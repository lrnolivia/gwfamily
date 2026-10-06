import {SHARED_PAGE_SCHEMA,SHARED_CONTENT_LIMITS,SHARED_IMAGE_TYPES,SHARED_VIDEO_TYPES,sharedPageDefaults,validateSharedPageContent} from '../../src/shared-content-schema.js';
import {UserError} from './family-service.mjs';
import {isMember} from './policy.mjs';
import {createRateStorage} from './auth.mjs';

const leaderSql="EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND m.status='active' AND m.member_group IN ('family','loved_ones') AND m.is_leader=1 AND u.emailVerified=1)";
const rows=value=>value.results||[];
function pageId(value){if(!Object.hasOwn(SHARED_PAGE_SCHEMA,value))throw new UserError('Shared page not found',404);return value;}
function active(actor){if(!isMember(actor))throw new UserError('Family membership approval required',403);}
function leader(actor){active(actor);if(actor.isLeader!==true)throw new UserError('Family Leader permission required',403);}
function payload(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new UserError('Unsupported shared page fields');return value;}
function revisionNumber(value){if(!Number.isSafeInteger(value)||value<0)throw new UserError('Use a valid page revision');return value;}
function requestId(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))throw new UserError('A valid requestId is required');return value;}
function content(page,value){try{return validateSharedPageContent(page,value);}catch(error){throw new UserError(error.message);}}
function storedContent(page,value){const defaults=sharedPageDefaults(page);return {text:Object.fromEntries(Object.entries(value.text).filter(([key,text])=>text!==defaults.text[key])),hero:value.hero};}
function parseContent(page,value){return content(page,JSON.parse(value));}
async function fingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const currentSql='SELECT r.* FROM page_content p JOIN page_content_revisions r ON r.page=p.page AND r.revision=p.revision WHERE p.page=?';
async function currentRow(db,page){return db.prepare(currentSql).bind(page).first();}
function rawContent(page,row){return row?parseContent(page,row.content_json):sharedPageDefaults(page);}
async function enrichContent(db,value){
 const ids=value.hero.media.map(file=>file.id);if(!ids.length)return value;
 const media=rows(await db.prepare(`SELECT id,name,mime_type FROM media WHERE id IN (${ids.map(()=>'?').join(',')}) AND deleted_at IS NULL`).bind(...ids).all());
 return {...value,hero:{...value.hero,media:value.hero.media.map(file=>{const row=media.find(row=>row.id===file.id);return {...file,url:row?'/api/media/'+file.id:null,type:row?.mime_type||null,name:row?.name||'Unavailable file'};})}};
}
async function record(db,actor,page,row){return {page,revision:row?.revision||0,content:await enrichContent(db,rawContent(page,row)),canEdit:actor.isLeader===true,updatedAt:row?.created_at||null};}
async function receipt(db,actor,key,hash){
 const row=await db.prepare('SELECT * FROM page_content_requests WHERE member_id=? AND request_id=?').bind(actor.id,key).first();
 if(row&&row.fingerprint!==hash)throw new UserError('This requestId was already used for different changes',409);
 return row;
}
async function priorResponse(db,actor,page,saved){
 const row=await db.prepare('SELECT * FROM page_content_revisions WHERE page=? AND revision=?').bind(saved.page,saved.revision).first();
 return {...await record(db,actor,page,row),replayed:true};
}
async function mediaRecords(env,actor,page,value,allowedIds){
 const ids=value.hero.media.map(file=>file.id);if(!ids.length)return [];
 if(!env.R2||typeof env.R2.head!=='function')throw new UserError('Media storage is not configured',503);
 const files=rows(await env.DB.prepare(`SELECT * FROM media WHERE id IN (${ids.map(()=>'?').join(',')}) AND deleted_at IS NULL`).bind(...ids).all());
 const types=value.hero.mode==='video'?SHARED_VIDEO_TYPES:SHARED_IMAGE_TYPES;
 for(const id of ids){
  const file=files.find(row=>row.id===id);
  if(!file||file.owner_id!==actor.id&&!allowedIds.has(id)||!types.includes(file.mime_type)||file.size_bytes<=0||file.size_bytes>SHARED_CONTENT_LIMITS.maxMediaBytes||file.object_key!==`family/${file.owner_id}/${file.id}`)throw new UserError('Choose your uploaded photos or videos for this page');
  if(!await env.R2.head(file.object_key))throw new UserError('A selected upload is no longer available. Upload it again.');
 }
 return files;
}
async function write(c,restore=false){
 const db=c.env.DB,actor=c.get('actor');leader(actor);const page=pageId(c.req.param('page'));
 const data=payload(await c.req.json(),restore?['requestId','expectedRevision','revision']:['requestId','expectedRevision','content']);
 const key=requestId(data.requestId),expected=revisionNumber(data.expectedRevision),target=restore?revisionNumber(data.revision):null;
 const submitted=restore?null:content(page,data.content);
 const hash=await fingerprint({page,operation:restore?'restore':'update',expectedRevision:expected,...(restore?{revision:target}:{content:submitted})});
 const saved=await receipt(db,actor,key,hash);if(saved)return c.json(await priorResponse(db,actor,page,saved));
 let current=await currentRow(db,page);
 if((current?.revision||0)!==expected)return c.json({error:'This page changed while you were editing. Review the latest revision before saving.',current:await record(db,actor,page,current)},409);
 let value=submitted,allowedIds=new Set(rawContent(page,current).hero.media.map(file=>file.id));
 if(restore){
  if(target>expected)throw new UserError('Choose an existing earlier page revision');
  const prior=target?await db.prepare('SELECT * FROM page_content_revisions WHERE page=? AND revision=?').bind(page,target).first():null;
  if(target&&!prior)throw new UserError('Page revision not found',404);
  value=rawContent(page,prior);allowedIds=new Set(value.hero.media.map(file=>file.id));
 }
 const files=await mediaRecords(c.env,actor,page,value,allowedIds);
 if(!(await createRateStorage(db).consume('page-content:write:'+actor.id,{window:3600,max:60})).allowed)throw new UserError('Page edit limit reached. Please try again later.',429);
 const mutation=crypto.randomUUID(),next=expected+1,now=new Date().toISOString(),encoded=JSON.stringify(storedContent(page,value));
 // D1 batch is transactional. The revision insert is the compare-and-swap;
 // current pointer and receipt are conditional on this exact mutation's success.
 // Recheck account and media within that transaction, closing authorization races.
 const fileGuard=files.length?` AND (SELECT count(*) FROM media WHERE deleted_at IS NULL AND (${files.map(()=>'(id=? AND owner_id=? AND object_key=? AND mime_type=? AND size_bytes=?)').join(' OR ')}))=?`:'';
 const fileArgs=files.flatMap(file=>[file.id,file.owner_id,file.object_key,file.mime_type,file.size_bytes]);
 await db.batch([
  db.prepare(`INSERT INTO page_content_revisions(page,revision,mutation_id,content_json,editor_id,restored_from,created_at) SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM page_content WHERE page=?),0)=? AND ${leaderSql} AND NOT EXISTS(SELECT 1 FROM page_content_requests WHERE member_id=? AND request_id=?)${fileGuard}`).bind(page,next,mutation,encoded,actor.id,target,now,page,expected,actor.id,actor.id,key,...fileArgs,...(files.length?[files.length]:[])),
  db.prepare('INSERT INTO page_content(page,revision) SELECT page,revision FROM page_content_revisions WHERE mutation_id=? ON CONFLICT(page) DO UPDATE SET revision=excluded.revision').bind(mutation),
  db.prepare('INSERT INTO page_content_requests(member_id,request_id,fingerprint,page,revision,created_at) SELECT ?,?,?,page,revision,? FROM page_content_revisions WHERE mutation_id=?').bind(actor.id,key,hash,now,mutation)
 ]);
 const committed=await receipt(db,actor,key,hash);
 if(!committed){
  if(!await db.prepare(`SELECT 1 WHERE ${leaderSql}`).bind(actor.id).first())throw new UserError('Family Leader permission required',403);
  current=await currentRow(db,page);return c.json({error:'This page or a selected upload changed. Review the latest revision before saving.',current:await record(db,actor,page,current)},409);
 }
 const row=await db.prepare('SELECT * FROM page_content_revisions WHERE page=? AND revision=?').bind(page,committed.revision).first();return c.json(await record(db,actor,page,row));
}
// Only the current published pointer grants family visibility. Historical media
// and unsaved uploads cannot become readable just by appearing in an old revision.
export async function publishedPageReferencesMedia(db,actor,id){
 active(actor);
 const current=rows(await db.prepare('SELECT p.page,r.content_json FROM page_content p JOIN page_content_revisions r ON r.page=p.page AND r.revision=p.revision').bind().all());
 return current.some(row=>{if(!Object.hasOwn(SHARED_PAGE_SCHEMA,row.page))return false;try{return rawContent(row.page,row).hero.media.some(file=>file.id===id);}catch{return false;}});
}
export function registerPageContent(app){
 app.get('/api/page-content/:page',async c=>{const actor=c.get('actor');active(actor);const page=pageId(c.req.param('page'));return c.json(await record(c.env.DB,actor,page,await currentRow(c.env.DB,page)));});
 app.patch('/api/page-content/:page',c=>write(c));
 app.get('/api/page-content/:page/revisions',async c=>{
  const db=c.env.DB,actor=c.get('actor');leader(actor);const page=pageId(c.req.param('page')),rawLimit=c.req.query('limit')??'20',rawBefore=c.req.query('before');
  if(!/^([1-9]|[1-4]\d|50)$/.test(rawLimit)||rawBefore!==undefined&&!/^[1-9]\d{0,14}$/.test(rawBefore))throw new UserError('Use a valid history cursor and a limit from 1 to 50');
  const limit=Number(rawLimit),before=rawBefore===undefined?null:Number(rawBefore);
  const found=rows(await db.prepare(`SELECT r.*,u.name AS editor_name FROM page_content_revisions r LEFT JOIN user u ON u.id=r.editor_id WHERE r.page=?${before===null?'':' AND r.revision<?'} ORDER BY r.revision DESC LIMIT ?`).bind(page,...(before===null?[]:[before]),limit+1).all());
  const visible=found.slice(0,limit),revisions=[];
  for(const row of visible)revisions.push({revision:row.revision,createdAt:row.created_at,editorName:row.editor_name||'Family Leader',restoredFrom:row.restored_from,content:await enrichContent(db,rawContent(page,row))});
  return c.json({page,revisions,nextBefore:found.length>limit?visible.at(-1).revision:null});
 });
 app.post('/api/page-content/:page/restore',c=>write(c,true));
}
