import {pageStorageSnapshots,storedPageSnapshot} from './page-content-storage.mjs';
import {defaultPanelLayout,sharedPageMedia,validatePanelTransition} from '../../src/shared-panels.js';
import {SHARED_PAGE_SCHEMA,SHARED_CONTENT_LIMITS,SHARED_IMAGE_TYPES,SHARED_VIDEO_TYPES,sharedPageDefaults,validateSharedPageContent} from '../../src/shared-content-schema.js';
import {UserError} from './family-service.mjs';
import {isMember,can} from './policy.mjs';
import {createRateStorage} from './auth.mjs';

const leaderSql="EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND m.status='active' AND m.member_group IN ('family','loved_ones') AND (m.is_leader=1 OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(m.roles_json) THEN m.roles_json ELSE '[]' END) role WHERE role.value='admin')) AND u.emailVerified=1)";
const rows=value=>value.results||[];
function pageId(value){if(!Object.hasOwn(SHARED_PAGE_SCHEMA,value))throw new UserError('Shared page not found',404);return value;}
function active(actor){if(!isMember(actor))throw new UserError('Family membership approval required',403);}
function leader(actor){active(actor);if(!can(actor,'edit_pages'))throw new UserError('Family Leader permission required',403);}
function payload(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new UserError('Unsupported shared page fields');return value;}
function revisionNumber(value){if(!Number.isSafeInteger(value)||value<0)throw new UserError('Use a valid page revision');return value;}
function requestId(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))throw new UserError('A valid requestId is required');return value;}
function content(page,value){try{return validateSharedPageContent(page,value);}catch(error){throw new UserError(error.message);}}
function parseContent(page,value,extension,presentation){return content(page,storedPageSnapshot(value,extension,presentation));}
async function fingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const revisionSql='SELECT r.*,e.extension_json,e.presentation_v2_json FROM page_content_revisions r LEFT JOIN page_content_extensions e ON e.page=r.page AND e.revision=r.revision';
const currentSql='SELECT r.*,e.extension_json,e.presentation_v2_json FROM page_content p JOIN page_content_revisions r ON r.page=p.page AND r.revision=p.revision LEFT JOIN page_content_extensions e ON e.page=r.page AND e.revision=r.revision WHERE p.page=?';
async function currentRow(db,page){return db.prepare(currentSql).bind(page).first();}
function rawContent(page,row){return row?parseContent(page,row.content_json,row.extension_json,row.presentation_v2_json):sharedPageDefaults(page);}
async function enrichContent(db,value){
 const ids=[...new Set(sharedPageMedia(value,{includeRemoved:true}).map(file=>file.id))];if(!ids.length)return value;
 const media=rows(await db.prepare(`SELECT id,name,mime_type FROM media WHERE id IN (${ids.map(()=>'?').join(',')}) AND deleted_at IS NULL`).bind(...ids).all());
 const enrich=file=>{const row=media.find(row=>row.id===file.id);return {...file,url:row?'/api/media/'+file.id:null,type:row?.mime_type||null,name:row?.name||'Unavailable file'};};
 return {...value,hero:{...value.hero,media:value.hero.media.map(enrich)},panelLayout:{...value.panelLayout,panels:value.panelLayout.panels.map(panel=>({...panel,...(panel.media?{media:panel.media.map(enrich)}:{}),...(panel.elements?{elements:panel.elements.map(element=>({...element,...(element.media?{media:element.media.map(enrich)}:{})}))}:{})}))}};
}
async function record(db,actor,page,row){return {page,revision:row?.revision||0,content:await enrichContent(db,rawContent(page,row)),canEdit:can(actor,'edit_pages'),updatedAt:row?.created_at||null};}
async function receipt(db,actor,key,hash){
 const row=await db.prepare('SELECT * FROM page_content_requests WHERE member_id=? AND request_id=?').bind(actor.id,key).first();
 if(row&&row.fingerprint!==hash)throw new UserError('This requestId was already used for different changes',409);
 return row;
}
async function priorResponse(db,actor,page,saved){
 const row=await db.prepare(revisionSql+' WHERE r.page=? AND r.revision=?').bind(saved.page,saved.revision).first();
 return {...await record(db,actor,page,row),replayed:true};
}
async function mediaRecords(env,actor,page,value,allowedIds){
 const uses=sharedPageMedia(value,{includeRemoved:true}),activeIds=new Set(sharedPageMedia(value).map(file=>file.id)),ids=[...new Set(uses.map(file=>file.id))].filter(id=>activeIds.has(id)||!allowedIds.has(id));if(!ids.length)return [];
 // Existing removed references stay recoverable without forcing a missing old
 // upload to block unrelated edits. New references and every visible file still
 // pass ownership, type, object and transaction-time checks.
 if(!env.R2||typeof env.R2.head!=='function')throw new UserError('Media storage is not configured',503);
 const files=rows(await env.DB.prepare(`SELECT * FROM media WHERE id IN (${ids.map(()=>'?').join(',')}) AND deleted_at IS NULL`).bind(...ids).all());
 const validType=(id,type)=>uses.filter(file=>file.id===id).every(file=>(file.mediaMode==='video'?SHARED_VIDEO_TYPES:SHARED_IMAGE_TYPES).includes(type));
 for(const id of ids){
  const file=files.find(row=>row.id===id);
  if(!file||file.owner_id!==actor.id&&!allowedIds.has(id)||!validType(id,file.mime_type)||file.size_bytes<=0||file.size_bytes>SHARED_CONTENT_LIMITS.maxMediaBytes||file.object_key!==`family/${file.owner_id}/${file.id}`)throw new UserError('Choose your uploaded photos or videos for this page');
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
 let value=submitted,allowedIds=new Set(sharedPageMedia(rawContent(page,current),{includeRemoved:true}).map(file=>file.id));
 if(!restore){
  if(data.content.panelLayout&&data.content.panelLayout.version!==2)throw new UserError('Reload the page editor before changing this layout',409);
  if(data.content.panelLayout===undefined&&JSON.stringify(rawContent(page,current).panelLayout)!==JSON.stringify(defaultPanelLayout(page))||data.content.bodyFormats===undefined&&Object.keys(rawContent(page,current).bodyFormats).length)throw new UserError('Reload the page editor before changing this layout',409);
  if(data.content.cardLayouts===undefined&&Object.keys(rawContent(page,current).cardLayouts||{}).length)throw new UserError('Reload the page editor before changing this card layout',409);
  try{validatePanelTransition(page,rawContent(page,current),value);}catch(error){throw new UserError(error.message);}
 }
 if(restore){
  if(target>expected)throw new UserError('Choose an existing earlier page revision');
  const prior=target?await db.prepare(revisionSql+' WHERE r.page=? AND r.revision=?').bind(page,target).first():null;
  if(target&&!prior)throw new UserError('Page revision not found',404);
  value=rawContent(page,prior);allowedIds=new Set(sharedPageMedia(value,{includeRemoved:true}).map(file=>file.id));
 }
 const files=await mediaRecords(c.env,actor,page,value,allowedIds);
 if(!(await createRateStorage(db).consume('page-content:write:'+actor.id,{window:3600,max:60})).allowed)throw new UserError('Page edit limit reached. Please try again later.',429);
 const mutation=crypto.randomUUID(),next=expected+1,now=new Date().toISOString(),snapshot=pageStorageSnapshots(page,value),encoded=JSON.stringify(snapshot.content),extension=JSON.stringify(snapshot.extension),presentation=JSON.stringify(snapshot.presentation);
 // D1 batch is transactional. The revision insert is the compare-and-swap;
 // current pointer and receipt are conditional on this exact mutation's success.
 // Recheck account and media within that transaction, closing authorization races.
 const fileGuard=files.length?` AND (SELECT count(*) FROM media WHERE deleted_at IS NULL AND (${files.map(()=>'(id=? AND owner_id=? AND object_key=? AND mime_type=? AND size_bytes=?)').join(' OR ')}))=?`:'';
 const fileArgs=files.flatMap(file=>[file.id,file.owner_id,file.object_key,file.mime_type,file.size_bytes]);
 await db.batch([
  db.prepare(`INSERT INTO page_content_revisions(page,revision,mutation_id,content_json,editor_id,restored_from,created_at) SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM page_content WHERE page=?),0)=? AND ${leaderSql} AND NOT EXISTS(SELECT 1 FROM page_content_requests WHERE member_id=? AND request_id=?)${fileGuard}`).bind(page,next,mutation,encoded,actor.id,target,now,page,expected,actor.id,actor.id,key,...fileArgs,...(files.length?[files.length]:[])),
  db.prepare('INSERT INTO page_content_extensions(page,revision,extension_json,presentation_v2_json) SELECT page,revision,?,? FROM page_content_revisions WHERE mutation_id=?').bind(extension,presentation,mutation),
  db.prepare('INSERT INTO page_content(page,revision) SELECT page,revision FROM page_content_revisions WHERE mutation_id=? ON CONFLICT(page) DO UPDATE SET revision=excluded.revision').bind(mutation),
  db.prepare('INSERT INTO page_content_requests(member_id,request_id,fingerprint,page,revision,created_at) SELECT ?,?,?,page,revision,? FROM page_content_revisions WHERE mutation_id=?').bind(actor.id,key,hash,now,mutation)
 ]);
 const committed=await receipt(db,actor,key,hash);
 if(!committed){
  if(!await db.prepare(`SELECT 1 WHERE ${leaderSql}`).bind(actor.id).first())throw new UserError('Family Leader permission required',403);
  current=await currentRow(db,page);return c.json({error:'This page or a selected upload changed. Review the latest revision before saving.',current:await record(db,actor,page,current)},409);
 }
 const row=await db.prepare(revisionSql+' WHERE r.page=? AND r.revision=?').bind(page,committed.revision).first();return c.json(await record(db,actor,page,row));
}
// Only the current published pointer grants family visibility. Historical media
// and unsaved uploads cannot become readable just by appearing in an old revision.
export async function publishedPageReferencesMedia(db,actor,id){
 active(actor);
 const current=rows(await db.prepare('SELECT p.page,r.content_json,e.extension_json,e.presentation_v2_json FROM page_content p JOIN page_content_revisions r ON r.page=p.page AND r.revision=p.revision LEFT JOIN page_content_extensions e ON e.page=r.page AND e.revision=r.revision').bind().all());
 return current.some(row=>{if(!Object.hasOwn(SHARED_PAGE_SCHEMA,row.page)||row.page==='leader-calendar'&&!can(actor,'edit_pages'))return false;try{return sharedPageMedia(rawContent(row.page,row)).some(file=>file.id===id);}catch{return false;}});
}
export function registerPageContent(app){
 app.get('/api/page-content/:page',async c=>{const actor=c.get('actor');active(actor);const page=pageId(c.req.param('page'));if(page==='leader-calendar')leader(actor);return c.json(await record(c.env.DB,actor,page,await currentRow(c.env.DB,page)));});
 app.patch('/api/page-content/:page',c=>write(c));
 app.get('/api/page-content/:page/revisions',async c=>{
  const db=c.env.DB,actor=c.get('actor');leader(actor);const page=pageId(c.req.param('page')),rawLimit=c.req.query('limit')??'20',rawBefore=c.req.query('before');
  if(!/^([1-9]|[1-4]\d|50)$/.test(rawLimit)||rawBefore!==undefined&&!/^[1-9]\d{0,14}$/.test(rawBefore))throw new UserError('Use a valid history cursor and a limit from 1 to 50');
  const limit=Number(rawLimit),before=rawBefore===undefined?null:Number(rawBefore);
  const found=rows(await db.prepare(`SELECT r.*,e.extension_json,e.presentation_v2_json,u.name AS editor_name FROM page_content_revisions r LEFT JOIN page_content_extensions e ON e.page=r.page AND e.revision=r.revision LEFT JOIN user u ON u.id=r.editor_id WHERE r.page=?${before===null?'':' AND r.revision<?'} ORDER BY r.revision DESC LIMIT ?`).bind(page,...(before===null?[]:[before]),limit+1).all());
  const visible=found.slice(0,limit),revisions=[];
  for(const row of visible)revisions.push({revision:row.revision,createdAt:row.created_at,editorName:row.editor_name||'Family Leader',restoredFrom:row.restored_from,content:await enrichContent(db,rawContent(page,row))});
  return c.json({page,revisions,nextBefore:found.length>limit?visible.at(-1).revision:null});
 });
 app.post('/api/page-content/:page/restore',c=>write(c,true));
}
