import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

// SYNTHETIC ISOLATION ONLY. These tests exercise the actual private attachment
// and messaging handlers with an in-memory SQLite/D1 adapter and in-memory R2.
// They do not load the worker, authenticate a real user, start a server, access
// the network, or claim coverage of production auth/origin middleware or R2.
// Baseline family/auth dependencies are intentionally replaced in memory because
// this exported source snapshot does not include their full runtime graph.
const root=new URL('../src/',import.meta.url);
const dataModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const stubUrl=dataModule(`
 export class UserError extends Error {constructor(message,status=400){super(message);this.status=status}}
 export async function readPost(){return null}
 export function createRateStorage(db){return {consume:async(...args)=>{db.rateCalls?.push(args);return {allowed:true}}}}
 export const json=(value,fallback={})=>{try{return JSON.parse(value)}catch{return fallback}};
 export const authEnvironment=value=>value,authReady=()=>true;
 export const publicAuthConfig=()=>({configured:true,email:true,providers:[]}),storedPhotoFrame=()=>({x:50,y:50,zoom:1}),resolveReunion=async()=>({id:'legacy'});
 export const command=async()=>({}),familyState=async()=>({}),validDate=()=>true,adultOn=()=>true;
 export const can=()=>false,canRehearseFirstLoad=()=>false;
 export const invitationsEnabled=()=>false,provisionalAllowed=async()=>false,registerInvitationEntry=()=>{},registerFamilyInvitations=()=>{};
 export const registerPushRoutes=()=>{},registerNotifications=()=>{},registerEmailNotifications=()=>{},registerPageContent=()=>{},registerHouseholdInvites=()=>{},registerFamilyCalendar=()=>{};
 export const publishedPageReferencesMedia=async()=>false,readCalendar=async()=>({});
 // Photo target authorization has its own real-route suite; this private-message isolation boundary exposes no photo references.
 export const registerPhotoDiscussions=()=>{},photoCommentsReferenceMedia=async()=>false;
`);
const attachmentSource=await readFile(new URL('message-attachments.mjs',root),'utf8');
const attachmentUrl=dataModule(attachmentSource.replace(/from\s+(['"])\.\/(?:family-service|auth)\.mjs\1/g,`from '${stubUrl}'`));
const messagingSource=await readFile(new URL('messaging.mjs',root),'utf8');
const messagingUrl=dataModule(messagingSource
 .replace(/from\s+(['"])\.\/(?:family-service|auth)\.mjs\1/g,`from '${stubUrl}'`)
 .replace(/from\s+(['"])\.\/message-attachments\.mjs\1/g,`from '${attachmentUrl}'`));
const {validateAttachmentBytes,normalizeAttachmentIds,attachmentGuardSql,loadMessageAttachments,attachmentHash,cleanupMessageAttachments,ATTACHMENT_TTL_MS}=await import(attachmentUrl);
// Also exercise the real generic-media GET handler, isolated from unrelated
// page/calendar/push modules. Its lookup must never expose private-chat rows.
const routesSource=await readFile(new URL('routes.mjs',root),'utf8');
const routesUrl=dataModule(routesSource.replace(/from\s+(['"])\.\/([^'"]+)\1/g,(_,quote,path)=>`from '${path==='messaging.mjs'?messagingUrl:path==='error-diagnostics.mjs'?new URL(path,root).href:stubUrl}'`));
const {registerFamily}=await import(routesUrl);

const LIMIT=10*1024*1024;
const bytes={
 png:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMIqDgBAAKsAZH3/1VIAAAAAElFTkSuQmCC','base64'),
 jpeg:Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCpRRRX1R45/9k=','base64'),
 gif:Buffer.from('R0lGODdhAQABAIEAAFB4yAAAAAAAAAAAACwAAAAAAQABAAAIBAABBAQAOw==','base64'),
 webp:Buffer.from('UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/uC5f/OJfyR+gXdn/3GtufrEAAA=','base64'),
 pdf:Buffer.from('%PDF-1.7\nsynthetic fixture\n%%EOF'),
 text:Buffer.from('Synthetic private message attachment.\n')
};
const file=(type='image/png',data=bytes.png,name='synthetic.png')=>new File([data],name,{type});
const count=(sqlite,table)=>sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,emailVerified INTEGER,image TEXT);
 CREATE TABLE members(id TEXT PRIMARY KEY REFERENCES user(id),status TEXT,is_leader INTEGER DEFAULT 0,roles_json TEXT DEFAULT '[]');
 CREATE TABLE profiles(member_id TEXT PRIMARY KEY REFERENCES members(id),completed INTEGER,birthday TEXT);
 CREATE TABLE conversations(id TEXT PRIMARY KEY,type TEXT,name TEXT,owner_id TEXT,created_at TEXT,archived_at TEXT,direct_key TEXT UNIQUE);
 CREATE TABLE conversation_members(conversation_id TEXT REFERENCES conversations(id),member_id TEXT REFERENCES members(id),status TEXT,role TEXT DEFAULT 'member',read_sequence INTEGER DEFAULT 0,invited_by TEXT,invited_at TEXT,joined_at TEXT,PRIMARY KEY(conversation_id,member_id));
 CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id),author_id TEXT REFERENCES members(id),body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),created_at TEXT,sequence INTEGER,UNIQUE(conversation_id,sequence));
 CREATE TABLE messaging_requests(member_id TEXT,request_id TEXT,operation TEXT,fingerprint TEXT,resource_id TEXT,PRIMARY KEY(member_id,request_id,operation));
 CREATE TABLE typing_presence(scope_kind TEXT,scope_id TEXT,member_id TEXT,expires_at INTEGER,PRIMARY KEY(scope_kind,scope_id,member_id));
 CREATE TABLE media(id TEXT PRIMARY KEY,owner_id TEXT,object_key TEXT,name TEXT,mime_type TEXT,size_bytes INTEGER,deleted_at TEXT);
 `);
 const DB={queries:[],rateCalls:[],beforeBatch:null,beforeRun:null,beforeFirst:null,afterFirst:null,beforeAll:null,afterAll:null,prepare(sql){
  const statement={sql,args:[],bind(...args){return {...statement,args}},async first(column){if(DB.beforeFirst)await DB.beforeFirst(this);DB.queries.push({sql:this.sql,args:this.args});const row=sqlite.prepare(this.sql).get(...this.args);if(DB.afterFirst)await DB.afterFirst(this,row);return row?(column?row[column]:{...row}):null},async all(){if(DB.beforeAll)await DB.beforeAll(this);DB.queries.push({sql:this.sql,args:this.args});const results=sqlite.prepare(this.sql).all(...this.args).map(row=>({...row}));if(DB.afterAll)await DB.afterAll(this,results);return {results,success:true}},async run(){const hook=DB.beforeRun;DB.beforeRun=null;if(hook)await hook(this);DB.queries.push({sql:this.sql,args:this.args});const result=sqlite.prepare(this.sql).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}}};
  return statement;
 },async batch(statements){const hook=DB.beforeBatch;DB.beforeBatch=null;if(hook)await hook(statements);sqlite.exec('BEGIN');try{const results=[];for(const statement of statements){DB.queries.push({sql:statement.sql,args:statement.args});const prepared=sqlite.prepare(statement.sql);if(prepared.columns().length){const values=prepared.all(...statement.args);results.push({success:true,results:values.map(row=>({...row})),meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}})}else{const result=prepared.run(...statement.args);results.push({success:true,results:[],meta:{changes:Number(result.changes)}})}}sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
 return {sqlite,DB};
}
function bucket(){
 const objects=new Map(),calls=[];
 return {objects,calls,beforePut:null,beforeGet:null,async put(key,value,options){calls.push(['put',key]);const hook=this.beforePut;this.beforePut=null;if(hook)await hook(key);const raw=value instanceof ArrayBuffer?new Uint8Array(value):value;objects.set(key,{bytes:Uint8Array.from(raw),options,uploaded:new Date()});return {key}},async get(key){calls.push(['get',key]);const hook=this.beforeGet;this.beforeGet=null;if(hook)await hook(key);const object=objects.get(key);return object?{body:object.bytes.slice(),size:object.bytes.length,httpMetadata:object.options?.httpMetadata,writeHttpMetadata(headers){for(const [name,value]of Object.entries(object.options?.httpMetadata||{}))headers.set(name,value)}}:null},async delete(key){calls.push(['delete',key]);if(this.beforeDelete)await this.beforeDelete(key);for(const id of Array.isArray(key)?key:[key])objects.delete(id)},async list({prefix,limit,cursor}){calls.push(['list',prefix,cursor]);const all=[...objects.entries()].filter(([key])=>key.startsWith(prefix)&&(!cursor||key>cursor)).sort(([a],[b])=>a.localeCompare(b)),page=all.slice(0,limit);return {objects:page.map(([key,value])=>({key,uploaded:value.uploaded})),truncated:all.length>limit,cursor:page.at(-1)?.[0]}}};
}
function router(){
 const handlers=[];const app={};
 for(const method of ['get','post','patch','delete'])app[method]=(path,handler)=>handlers.push({method:method.toUpperCase(),path,handler});
 const call=async(env,actor,path,method='GET',body)=>{
  const url=new URL(path,'https://synthetic.invalid');let params,route;
  for(const item of handlers){if(item.method!==method)continue;const keys=[];const pattern=item.path.replace(/:[A-Za-z]+/g,key=>{keys.push(key.slice(1));return '([^/]+)'});const match=new RegExp('^'+pattern+'$').exec(url.pathname);if(match){params=Object.fromEntries(keys.map((key,i)=>[key,decodeURIComponent(match[i+1])]));route=item;break}}
  if(!route)return new Response(JSON.stringify({error:'Route not found'}),{status:404});
  const headers=new Headers();const raw=new Request(url,{method,headers:{'X-Expected-Account-ID':env.expectedAccountId===undefined?actor:env.expectedAccountId},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const c={env,get:key=>key==='actor'?{id:actor,isLeader:actor==='leader'}:key==='validateMessageSession'?env.validateMessageSession:undefined,req:{raw,param:key=>params[key],query:key=>url.searchParams.has(key)?url.searchParams.get(key):undefined,header:key=>raw.headers.get(key),json:async()=>body,formData:async()=>body},header:(key,value)=>headers.set(key,value),json:(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...Object.fromEntries(headers),'Content-Type':'application/json'}}),body:(value,status=200,extra={})=>new Response(value,{status,headers:{...Object.fromEntries(headers),...extra}})};
  try{return await route.handler(c)}catch(error){if(error.status)return new Response(JSON.stringify({error:error.message}),{status:error.status,headers:{'Content-Type':'application/json'}});throw error}
 };
 return {app,handlers,call};
}
async function setup(){
 const d=database();
 // Use the actual migration under test, against only synthetic base tables.
 d.sqlite.exec(await readFile(new URL('../migrations/0015_message_attachments.sql',import.meta.url),'utf8'));
 const people=['alice','bob','outsider','leader','pending','inactive','unverified','minor','incomplete','unknown-age','left','removed'];
 for(const id of people){d.sqlite.prepare('INSERT INTO user VALUES(?,?,?,NULL)').run(id,'Synthetic '+id,id==='unverified'?0:1);d.sqlite.prepare('INSERT INTO members(id,status,is_leader) VALUES(?,?,?)').run(id,id==='inactive'?'inactive':'active',id==='leader'?1:0);d.sqlite.prepare('INSERT INTO profiles VALUES(?,?,?)').run(id,id==='incomplete'?0:1,id==='minor'?'2015-01-01':id==='unknown-age'?null:'1980-01-01')}
 for(const id of ['conv-one','conv-two','direct-one'])d.sqlite.prepare('INSERT INTO conversations(id,type,name,owner_id,created_at,direct_key) VALUES(?,?,?,?,?,?)').run(id,id==='direct-one'?'direct':'group','Synthetic private group','alice',new Date().toISOString(),id==='direct-one'?'["alice","bob"]':null);
 for(const conversationId of ['conv-one','conv-two','direct-one'])for(const id of ['alice','bob'])d.sqlite.prepare('INSERT INTO conversation_members(conversation_id,member_id,status,joined_at) VALUES(?,?,?,?)').run(conversationId,id,'active',new Date().toISOString());
 for(const id of people.filter(id=>!['alice','bob','outsider','leader'].includes(id)))d.sqlite.prepare('INSERT INTO conversation_members(conversation_id,member_id,status) VALUES(?,?,?)').run('conv-one',id,['pending','left','removed'].includes(id)?id:'active');
 const R2=bucket(),routes=router(),env={DB:d.DB,R2};registerFamily(routes.app);
 const call=(actor,path,method='GET',body)=>routes.call(env,actor,path,method,body);
 const upload=async(actor='alice',conversationId='conv-one',value=file(),requestId=crypto.randomUUID(),extra={})=>{const form=new FormData();form.set('requestId',requestId);form.set('expectedAccountId',actor);form.set('file',value);for(const[key,value]of Object.entries(extra))form.set(key,value);return call(actor,`/api/conversations/${conversationId}/attachments`,'POST',form)};
 const send=(actor='alice',conversationId='conv-one',attachmentIds=[],requestId=crypto.randomUUID(),body='Synthetic attachment message')=>call(actor,`/api/conversations/${conversationId}/messages`,'POST',{requestId,body,attachments:attachmentIds,expectedAccountId:actor});
 return {...d,R2,env,routes,call,upload,send};
}
async function uploaded(fixture,...args){const response=await fixture.upload(...args);assert.equal(response.status,201,await response.clone().text());const value=await response.json();const attachment=value.attachment||value;assert.ok(attachment.id);return attachment}
const path=(attachment,conversationId='conv-one')=>`/api/conversations/${conversationId}/attachments/${attachment.id}`;
const denied=async(response,label)=>assert.equal(response.status,404,label+' '+await response.text());

// Signature matching is content-derived; declared MIME/extension alone is never trusted.
test('synthetic attachment bytes accept matching allowed signatures and reject spoofed MIME',async()=>{
 for(const[type,data,name]of [['image/png',bytes.png,'x.png'],['image/jpeg',bytes.jpeg,'x.jpg'],['image/gif',bytes.gif,'x.gif'],['image/webp',bytes.webp,'x.webp'],['application/pdf',bytes.pdf,'x.pdf'],['text/plain',bytes.text,'x.txt']])await validateAttachmentBytes(file(type,data,name));
 for(const[type,data]of [['image/png',bytes.jpeg],['image/jpeg',bytes.png],['image/gif',bytes.text],['image/webp',bytes.png],['application/pdf',bytes.text],['text/html',Buffer.from('<script>alert(1)</script>')],['image/svg+xml',Buffer.from('<svg/>')],['application/javascript',bytes.text],['application/octet-stream',bytes.png]])await assert.rejects(()=>validateAttachmentBytes(file(type,data)),type);
});
test('synthetic bytes fail closed for empty, oversized, truncated and inconsistent files',async()=>{
 for(const value of [file('image/png',new Uint8Array()),file('image/png',new Uint8Array(LIMIT+1)),file('image/png',bytes.png.slice(0,4)),file('image/jpeg',Uint8Array.from([255,216])),{size:bytes.png.length+1,type:'image/png',name:'x.png',arrayBuffer:async()=>bytes.png.buffer.slice(bytes.png.byteOffset,bytes.png.byteOffset+bytes.png.byteLength)}])await assert.rejects(()=>validateAttachmentBytes(value));
 const exact=new Uint8Array(LIMIT).fill(65);await validateAttachmentBytes(file('text/plain',exact));
});
test('synthetic message attachment IDs reject objects, URLs, duplicates, excessive lists and unsupported fields',()=>{
 assert.deepEqual(normalizeAttachmentIds(undefined),[]);
 for(const input of ['attachment-id',{id:'attachment-id'},[{}],['/api/media/foreign'],['https://synthetic.invalid/object'],['a','a'],Array.from({length:6},()=>crypto.randomUUID())])assert.throws(()=>normalizeAttachmentIds(input));
 const ids=[crypto.randomUUID(),crypto.randomUUID()];assert.deepEqual(normalizeAttachmentIds(ids),ids);
});
test('synthetic upload is conversation-scoped, never enters generic media and hides unbound stages from peers',async()=>{
 const f=await setup(),attachment=await uploaded(f);
 assert.equal(count(f.sqlite,'media'),0);assert.equal(count(f.sqlite,'conversation_attachments'),1);
 assert.match(attachment.url,/^\/api\/conversations\/conv-one\/attachments\//);assert.ok(!JSON.stringify(attachment).includes('object_key'));assert.ok(!JSON.stringify(attachment).includes('private/'));
 assert.equal((await f.call('alice',path(attachment))).status,200);
 await denied(await f.call('bob',path(attachment)),'peer cannot read unsent stage');
 await denied(await f.call('alice',path(attachment,'conv-two')),'cross-conversation route');
 await denied(await f.call('alice','/api/media/'+attachment.id),'generic owner path');
 await denied(await f.call('leader','/api/media/'+attachment.id),'generic family leader path');
});
test('synthetic attachment routes enforce accepted active verified adult membership without leadership bypass',async()=>{
 const f=await setup(),attachment=await uploaded(f);
 for(const actor of ['outsider','leader','pending','inactive','unverified','minor','incomplete','unknown-age','left','removed']){
  await denied(await f.upload(actor),'upload '+actor);
  await denied(await f.call(actor,path(attachment)),'download '+actor);
  await denied(await f.call(actor,path(attachment),'DELETE'),'cancel '+actor);
 }
 assert.equal(count(f.sqlite,'conversation_attachments'),1);assert.equal(f.R2.calls.filter(([action])=>action==='put').length,1);
});
test('synthetic staged upload request receipts require exact replay and prevent fingerprint mutation',async()=>{
 const f=await setup(),key='synthetic-replay-01',attachment=await uploaded(f,'alice','conv-one',file(),key);
 const again=await f.upload('alice','conv-one',file(),key);assert.equal(again.status,200,await again.clone().text());const repeated=await again.json();assert.equal((repeated.attachment||repeated).id,attachment.id);
 assert.equal(count(f.sqlite,'conversation_attachments'),1);assert.equal(f.R2.calls.filter(([action])=>action==='put').length,1);
 for(const[conversationId,value]of [['conv-one',file('image/png',bytes.png,'renamed.png')],['conv-one',file('text/plain',Buffer.from('Different synthetic content'),'different.txt')],['conv-two',file()]])assert.equal((await f.upload('alice',conversationId,value,key)).status,409);
});
test('synthetic private downloads enforce safe headers, MIME and attachment disposition',async()=>{
 const f=await setup(),attachment=await uploaded(f,'alice','conv-one',file('application/pdf',bytes.pdf,'private\r\nquote".pdf'));
 const response=await f.call('alice',path(attachment));assert.equal(response.status,200);
 assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(response.headers.get('Content-Length'),String(bytes.pdf.length));assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(response.headers.get('Cache-Control'),/private/);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.match(response.headers.get('Content-Security-Policy'),/sandbox/);assert.match(response.headers.get('Content-Disposition'),/^attachment;/);assert.ok(!/[\r\n]/.test(response.headers.get('Content-Disposition')));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(bytes.pdf));
});
test('synthetic attachment staging expires in 24h and cannot be read, sent or revived by replay',async()=>{
 const f=await setup(),key='synthetic-expiry-01',attachment=await uploaded(f,'alice','conv-one',file(),key);
 const row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);assert.ok(row.expires_at);const millis=value=>typeof value==='number'?value:Date.parse(value);assert.equal(millis(row.expires_at)-millis(row.created_at),24*60*60*1000);
 f.sqlite.prepare("UPDATE conversation_attachments SET created_at=?,expires_at=? WHERE id=?").run(Date.now()-86400001,Date.now()-1,attachment.id);
 await denied(await f.call('alice',path(attachment)),'expired stage');assert.equal((await f.send('alice','conv-one',[attachment.id])).status,410);assert.equal((await f.upload('alice','conv-one',file(),key)).status,410);assert.equal(count(f.sqlite,'messages'),0);
});
test('synthetic cancellation is owner-only and prevents staged send or content replay',async()=>{
 const f=await setup(),key='synthetic-cancel-01',attachment=await uploaded(f,'alice','conv-one',file(),key);
 await denied(await f.call('bob',path(attachment),'DELETE'),'nonowner cancel');assert.equal((await f.call('alice',path(attachment),'DELETE')).status,200);
 assert.equal(f.sqlite.prepare('SELECT state FROM conversation_attachments WHERE id=?').get(attachment.id).state,'cancelled');assert.equal(f.R2.objects.size,0);
 await denied(await f.call('alice',path(attachment)),'cancelled download');assert.equal((await f.send('alice','conv-one',[attachment.id])).status,410);assert.equal((await f.upload('alice','conv-one',file(),key)).status,410);assert.equal(count(f.sqlite,'messages'),0);
});
test('synthetic atomic send binds exact owned staged files and exact request replay yields one message',async()=>{
 const f=await setup(),attachment=await uploaded(f),key='synthetic-send-replay-01';
 const response=await f.send('alice','conv-one',[attachment.id],key);assert.equal(response.status,201,await response.clone().text());const value=await response.json();assert.equal(value.message.files.length,1);assert.equal(value.message.files[0].id,attachment.id);
 const row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);assert.equal(row.message_id,value.message.id);assert.equal(row.state,'ready');
 const replay=await f.send('alice','conv-one',[attachment.id],key);assert.equal(replay.status,201,await replay.clone().text());assert.equal((await replay.json()).message.id,value.message.id);assert.equal(count(f.sqlite,'messages'),1);
 assert.equal((await f.send('alice','conv-one',[],key)).status,409);assert.equal((await f.send('alice','conv-one',[attachment.id])).status,409);
 assert.equal((await f.call('bob',path(attachment))).status,200);await denied(await f.call('alice',path(attachment),'DELETE'),'bound file cannot be cancelled');
 const page=await f.call('bob','/api/conversations/conv-one/messages');assert.equal(page.status,200);assert.equal((await page.json()).messages[0].files[0].id,attachment.id);
});
test('synthetic message-bound attachments still deny outsiders, revoked membership and archive access',async()=>{
 const f=await setup(),attachment=await uploaded(f);assert.equal((await f.send('alice','conv-one',[attachment.id])).status,201);
 for(const actor of ['outsider','leader','pending','inactive','unverified','minor','incomplete','unknown-age','left','removed'])await denied(await f.call(actor,path(attachment)),'bound '+actor);
 for(const status of ['left','removed','pending']){f.sqlite.prepare("UPDATE conversation_members SET status=? WHERE conversation_id='conv-one' AND member_id='alice'").run(status);await denied(await f.call('alice',path(attachment)),'owner '+status)}
 f.sqlite.exec("UPDATE conversation_members SET status='active' WHERE conversation_id='conv-one' AND member_id='alice'; UPDATE conversations SET archived_at=datetime('now') WHERE id='conv-one'");await denied(await f.call('alice',path(attachment)),'archived owner');await denied(await f.call('bob',path(attachment)),'archived peer');
});
test('synthetic send rejects cross-owner, cross-conversation, nonexistent and generic media attachment IDs',async()=>{
 const f=await setup(),mine=await uploaded(f),peer=await uploaded(f,'bob'),other=await uploaded(f,'alice','conv-two'),genericId=crypto.randomUUID();
 f.sqlite.prepare('INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES(?,?,?,?,?,?)').run(genericId,'alice','family/alice/generic','Synthetic generic','image/png',bytes.png.length);
 for(const ids of [[peer.id],[other.id],[crypto.randomUUID()],[genericId],[mine.id,peer.id]]){const response=await f.send('alice','conv-one',ids);assert.equal(response.status,409);assert.notEqual((await response.json()).safeToEdit,true)};
 assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);assert.equal(f.sqlite.prepare('SELECT message_id FROM conversation_attachments WHERE id=?').get(mine.id).message_id,null);
});
test('synthetic attachment-only messages work while client URLs/files remain rejected',async()=>{
 const f=await setup(),attachment=await uploaded(f);const response=await f.send('alice','conv-one',[attachment.id],crypto.randomUUID(),'');assert.equal(response.status,201,await response.clone().text());
 for(const extra of [{files:[{id:attachment.id}]},{attachments:[{url:path(attachment)}]},{url:path(attachment)},{attachmentIds:[attachment.id]}])assert.equal((await f.call('alice','/api/conversations/conv-one/messages','POST',{requestId:crypto.randomUUID(),body:'Synthetic text',...extra})).status,400);
 assert.equal((await f.send('alice','conv-one',[],crypto.randomUUID(),'')).status,400);
});
test('synthetic send batch rechecks attachment availability and participant authorization after preflight',async()=>{
 for(const mutation of ['cancel','expired','bound','left','inactive','minor','archived']){
  const f=await setup(),attachment=await uploaded(f);
  f.DB.beforeBatch=()=>{
   if(mutation==='cancel')f.sqlite.prepare("UPDATE conversation_attachments SET state='cancelled' WHERE id=?").run(attachment.id);
   if(mutation==='expired')f.sqlite.prepare("UPDATE conversation_attachments SET created_at=?,expires_at=? WHERE id=?").run(Date.now()-86400001,Date.now()-1,attachment.id);
   if(mutation==='bound'){f.sqlite.prepare('INSERT INTO messages(id,conversation_id,author_id,body,created_at,sequence) VALUES(?,?,?,?,?,?)').run('synthetic-existing','conv-one','alice','Existing synthetic message',new Date().toISOString(),1);f.sqlite.prepare("UPDATE conversation_attachments SET state='ready',message_id='synthetic-existing',message_ordinal=0 WHERE id=?").run(attachment.id)}
   if(mutation==='left')f.sqlite.exec("UPDATE conversation_members SET status='left' WHERE conversation_id='conv-one' AND member_id='alice'");
   if(mutation==='inactive')f.sqlite.exec("UPDATE members SET status='inactive' WHERE id='alice'");
   if(mutation==='minor')f.sqlite.exec("UPDATE profiles SET birthday='2015-01-01' WHERE member_id='alice'");
   if(mutation==='archived')f.sqlite.exec("UPDATE conversations SET archived_at=datetime('now') WHERE id='conv-one'");
  };
  const response=await f.send('alice','conv-one',[attachment.id]);assert.ok([404,409,410].includes(response.status),mutation+' '+await response.clone().text());assert.equal(count(f.sqlite,'messages'),mutation==='bound'?1:0,mutation);assert.equal(count(f.sqlite,'messaging_requests'),0,mutation);
 }
});
test('synthetic upload revocation after R2 write cancels the stage and erases bytes',async()=>{
 for(const mutation of ['left','archived']){
  const f=await setup();f.R2.beforePut=()=>f.sqlite.exec(mutation==='left'?"UPDATE conversation_members SET status='left' WHERE conversation_id='conv-one' AND member_id='alice'":"UPDATE conversations SET archived_at=datetime('now') WHERE id='conv-one'");
  const response=await f.upload();assert.ok([404,409,410].includes(response.status),mutation+' '+await response.clone().text());assert.equal(count(f.sqlite,'conversation_attachments'),1);const row=f.sqlite.prepare('SELECT * FROM conversation_attachments').get();assert.equal(row.state,'cancelled');assert.equal(row.message_id,null);assert.equal(f.R2.objects.size,0);await denied(await f.call('alice',path({id:row.id})),'revoked owner');await denied(await f.call('bob',path({id:row.id})),'peer cannot read unsuccessful stage');
 }
});
test('synthetic message send transaction rollback preserves fresh staged attachments on DB failure',async()=>{
 const f=await setup(),attachment=await uploaded(f);f.sqlite.exec("CREATE TRIGGER synthetic_message_failure BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT,'synthetic message storage failure'); END");
 await assert.rejects(()=>f.send('alice','conv-one',[attachment.id]),/synthetic message storage failure/);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);const row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);assert.equal(row.state,'ready');assert.equal(row.message_id,null);assert.equal(f.R2.objects.size,1);
});

test('synthetic full-byte validation rejects trailing image/polyglot bytes, damaged chunks, bad EOF and unsafe text',async()=>{
 const damagedPng=Uint8Array.from(bytes.png);damagedPng[damagedPng.length-1]^=1;
 const damagedWebp=Uint8Array.from(bytes.webp);damagedWebp[4]^=1;
 const bad=[
  ['image/png',damagedPng],['image/webp',damagedWebp],
  ...['png','jpeg','gif','webp'].map(kind=>['image/'+kind,Buffer.concat([bytes[kind],Buffer.from('<script>synthetic</script>')])]),
  ['application/pdf',Buffer.from('%PDF-1.7\nmissing EOF')],['application/pdf',Buffer.concat([bytes.pdf,Buffer.from('trailing payload')])],
  ['text/plain',Uint8Array.from([255,255])],['text/plain',Uint8Array.from([65,0,66])],['text/plain',Uint8Array.from([65,27,66])]
 ];
 for(const[type,data]of bad)await assert.rejects(()=>validateAttachmentBytes(file(type,data)),type);
 const safe=await validateAttachmentBytes(file('text/plain',Buffer.from('Synthetic <script> text\tcan be downloaded.\n'),'../private\r\n\u202Ename.txt'));assert.ok(!/[\/\\\r\n\u202A-\u202E\u2066-\u2069]/.test(safe.name));
});
test('synthetic multipart and account-binding checks reject unexpected, duplicate and stale identity data without writes',async()=>{
 const f=await setup();
 for(const change of ['missing-account','wrong-account','duplicate-file','duplicate-id','extra-field','malformed-request']){
  const form=new FormData();form.set('file',file());form.set('requestId',crypto.randomUUID());form.set('expectedAccountId','alice');
  if(change==='missing-account')form.delete('expectedAccountId');if(change==='wrong-account')form.set('expectedAccountId','bob');if(change==='duplicate-file')form.append('file',file());if(change==='duplicate-id')form.append('requestId',crypto.randomUUID());if(change==='extra-field')form.set('url','/api/media/synthetic');if(change==='malformed-request')form.set('requestId','bad');
  const response=await f.call('alice','/api/conversations/conv-one/attachments','POST',form);assert.equal(response.status,change==='wrong-account'?409:400,change+' '+await response.clone().text());
 }
 for(const value of [file('image/svg+xml',Buffer.from('<svg/>')),file('image/png',bytes.text),file('text/plain',new Uint8Array())])assert.ok([400,413].includes((await f.upload('alice','conv-one',value)).status));
 assert.equal(count(f.sqlite,'conversation_attachments'),0);assert.equal(f.R2.calls.length,0);
 const attachment=await uploaded(f);
 for(const expectedAccountId of [undefined,'bob'])assert.equal((await f.call('alice','/api/conversations/conv-one/messages','POST',{requestId:crypto.randomUUID(),body:'Synthetic content',attachments:[attachment.id],...(expectedAccountId?{expectedAccountId}:{})})).status,409);
 assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);
});
test('synthetic failed R2 put is retryable with the same immutable row and never provides stage owner bypass',async()=>{
 const f=await setup(),key='synthetic-put-retry-01',original=f.R2.put.bind(f.R2);let fail=true;
 f.R2.put=async(...args)=>{if(fail){fail=false;throw new Error('Synthetic R2 unavailable')}return original(...args)};
 await assert.rejects(()=>f.upload('alice','conv-one',file(),key),/Synthetic R2 unavailable/);
 const staged=f.sqlite.prepare('SELECT * FROM conversation_attachments').get();assert.equal(staged.state,'staged');assert.equal(f.R2.objects.size,0);
 await denied(await f.call('alice',path(staged)),'unfinished owner stage');await denied(await f.call('bob',path(staged)),'unfinished peer stage');const unfinished=await f.send('alice','conv-one',[staged.id]);assert.equal(unfinished.status,409);assert.notEqual((await unfinished.json()).safeToEdit,true);
 const attachment=await uploaded(f,'alice','conv-one',file(),key);assert.equal(attachment.id,staged.id);assert.equal(count(f.sqlite,'conversation_attachments'),1);assert.equal(f.R2.objects.size,1);assert.equal((await f.call('alice',path(attachment))).status,200);
 f.sqlite.exec("UPDATE conversation_members SET status='left' WHERE conversation_id='conv-one' AND member_id='alice'");await denied(await f.upload('alice','conv-one',file(),key),'revoked same-key retry');await denied(await f.call('alice',path(attachment)),'revoked successful object owner');
});
test('synthetic async download rechecks revocation and validates object availability/size',async()=>{
 for(const mutation of ['left','inactive','unverified','minor','archived']){
  const f=await setup(),attachment=await uploaded(f);assert.equal((await f.send('alice','conv-one',[attachment.id])).status,201);
  f.R2.beforeGet=()=>f.sqlite.exec({left:"UPDATE conversation_members SET status='left' WHERE conversation_id='conv-one' AND member_id='bob'",inactive:"UPDATE members SET status='inactive' WHERE id='bob'",unverified:"UPDATE user SET emailVerified=0 WHERE id='bob'",minor:"UPDATE profiles SET birthday='2015-01-01' WHERE member_id='bob'",archived:"UPDATE conversations SET archived_at=datetime('now') WHERE id='conv-one'"}[mutation]);
  await denied(await f.call('bob',path(attachment)),'revoked while bucket get '+mutation);
 }
 const f=await setup(),attachment=await uploaded(f),row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);f.R2.objects.get(row.object_key).bytes=Uint8Array.from([1]);await denied(await f.call('alice',path(attachment)),'wrong object size');f.R2.objects.clear();await denied(await f.call('alice',path(attachment)),'missing object');
});
test('synthetic exact ordered attachment send fingerprints and previews preserve only safe metadata',async()=>{
 const f=await setup(),first=await uploaded(f),second=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'second.txt')),ids=[second.id,first.id],key='synthetic-order-send-01';
 const response=await f.send('alice','conv-one',ids,key,'');assert.equal(response.status,201);const message=(await response.json()).message;assert.equal(message.body,'');assert.deepEqual(message.files.map(item=>item.id),ids);assert.deepEqual(Object.keys(message.files[0]).sort(),['id','name','size','type','url']);
 const stored=f.sqlite.prepare('SELECT * FROM messages WHERE id=?').get(message.id);assert.equal(stored.attachment_only,1);assert.equal(stored.body,'second.txt\nsynthetic.png');
 assert.equal((await f.send('alice','conv-one',[first.id,second.id],key,'')).status,409);
 const detail=await f.call('bob','/api/conversations/conv-one');assert.equal(detail.status,200);assert.deepEqual((await detail.json()).conversation.lastMessage.files.map(item=>item.id),ids);
 const inbox=await f.call('bob','/api/conversations');assert.equal(inbox.status,200);assert.deepEqual((await inbox.json()).conversations.find(item=>item.id==='conv-one').lastMessage.files.map(item=>item.id),ids);
});
test('synthetic message file count and total 25 MiB limits are enforced atomically at exact boundaries',async()=>{
 const f=await setup(),ids=[];for(let i=0;i<6;i++)ids.push((await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'synthetic-'+i+'.txt'))).id);
 assert.equal((await f.send('alice','conv-one',ids)).status,400);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);
 // Synthetic metadata sizes isolate the aggregate SQL guard without allocating
 // 25 MiB of bucket data; per-file byte limits are exercised separately above.
 f.sqlite.prepare('UPDATE conversation_attachments SET size_bytes=? WHERE id IN (?,?)').run(LIMIT,ids[0],ids[1]);f.sqlite.prepare('UPDATE conversation_attachments SET size_bytes=? WHERE id=?').run(5*1024*1024+1,ids[2]);
 const over=await f.send('alice','conv-one',ids.slice(0,3));assert.equal(over.status,409);assert.notEqual((await over.json()).safeToEdit,true);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);
 f.sqlite.prepare('UPDATE conversation_attachments SET size_bytes=? WHERE id=?').run(5*1024*1024,ids[2]);assert.equal((await f.send('alice','conv-one',ids.slice(0,3))).status,201);assert.equal(count(f.sqlite,'messages'),1);
});
test('synthetic send stage TTL is rechecked against SQLite time after preflight awaits',async()=>{
 const f=await setup(),attachment=await uploaded(f);f.sqlite.prepare('UPDATE conversation_attachments SET expires_at=? WHERE id=?').run(Date.now()+100,attachment.id);
 f.DB.beforeBatch=async()=>new Promise(resolve=>setTimeout(resolve,180));
 const response=await f.send('alice','conv-one',[attachment.id]);assert.equal(response.status,410,await response.clone().text());assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);assert.equal(f.sqlite.prepare('SELECT message_id FROM conversation_attachments WHERE id=?').get(attachment.id).message_id,null);
});
test('synthetic concurrent exact send retries resolve to one receipt, message and association',async()=>{
 const f=await setup(),attachment=await uploaded(f),key='synthetic-racing-send-01';let winner;
 f.DB.beforeBatch=async()=>{winner=await f.send('alice','conv-one',[attachment.id],key)};
 const raced=await f.send('alice','conv-one',[attachment.id],key);assert.equal(winner.status,201);assert.equal(raced.status,201,await raced.clone().text());assert.equal((await raced.json()).message.id,(await winner.json()).message.id);assert.equal(count(f.sqlite,'messages'),1);assert.equal(count(f.sqlite,'messaging_requests'),1);
});
test('synthetic concurrent mismatched send retries cannot overwrite the winning message',async()=>{
 const f=await setup(),attachment=await uploaded(f),key='synthetic-racing-diff-01';let winner;
 f.DB.beforeBatch=async()=>{winner=await f.send('alice','conv-one',[attachment.id],key,'Winning synthetic body')};
 const raced=await f.send('alice','conv-one',[attachment.id],key,'Conflicting synthetic body');assert.equal(winner.status,201);assert.equal(raced.status,409);assert.equal(count(f.sqlite,'messages'),1);assert.equal(f.sqlite.prepare('SELECT body FROM messages').get().body,'Winning synthetic body');
});
test('synthetic simultaneous immutable upload retries share a stage safely without deleting the winning object',async()=>{
 const f=await setup(),key='synthetic-racing-upload-01';let other;
 f.R2.beforePut=async()=>{other=await f.upload('alice','conv-one',file(),key)};
 const response=await f.upload('alice','conv-one',file(),key);assert.equal(response.status,201);assert.equal(other.status,201);const attachment=await response.json();assert.equal(attachment.id,(await other.json()).id);assert.equal(count(f.sqlite,'conversation_attachments'),1);assert.equal(f.R2.objects.size,1);assert.equal(f.R2.calls.filter(([action])=>action==='delete').length,0);assert.equal((await f.call('alice',path(attachment))).status,200);
});
test('synthetic SQL helper rechecks ownership, scope, TTL, bound retries and batches authorized file hydration',async()=>{
 const f=await setup(),attachment=await uploaded(f),ids=[attachment.id];assert.deepEqual(attachmentGuardSql([],undefined,undefined,Date.now()),{sql:'1',values:[]});
 const evaluate=(guard)=>f.DB.prepare('SELECT 1 AS allowed WHERE '+guard.sql).bind(...guard.values).first('allowed');
 assert.equal(await evaluate(attachmentGuardSql(ids,'conv-one','alice',Date.now())),1);assert.equal(await evaluate(attachmentGuardSql(ids,'conv-two','alice',Date.now())),null);assert.equal(await evaluate(attachmentGuardSql(ids,'conv-one','bob',Date.now())),null);
 const sent=await f.send('alice','conv-one',ids);const message=(await sent.json()).message;assert.equal(await evaluate(attachmentGuardSql(ids,'conv-one','alice',Date.now())),null);assert.equal(await evaluate(attachmentGuardSql(ids,'conv-one','alice',Date.now(),message.id)),1);
 // Use the same accessFor expression as the real messaging source, exported only
 // in this data: module so the helper's actual bound SQL is exercised.
 const exportsUrl=dataModule(messagingSource.replace(/from\s+(['"])\.\/(?:family-service|auth)\.mjs\1/g,`from '${stubUrl}'`).replace(/from\s+(['"])\.\/message-attachments\.mjs\1/g,`from '${attachmentUrl}'`)+'\nexport {accessFor};');const {accessFor}=await import(exportsUrl);
 f.DB.queries.length=0;const hydrated=await loadMessageAttachments(f.DB,'bob',[{id:message.id}],accessFor);assert.equal(f.DB.queries.length,1);assert.deepEqual(hydrated.get(message.id).map(item=>item.id),ids);
 for(const actor of ['outsider','leader','pending','left','removed','minor'])assert.equal((await loadMessageAttachments(f.DB,actor,[{id:message.id}],accessFor)).size,0);
 f.DB.queries.length=0;assert.equal((await loadMessageAttachments(f.DB,'bob',[],accessFor)).size,0);assert.equal(f.DB.queries.length,0);
});

test('synthetic nonexistent send receipt resource fails closed without a ghost message or safe-to-edit promise',async()=>{
 for(const useAttachment of [false,true]){
  const f=await setup(),ids=useAttachment?[(await uploaded(f)).id]:[],key='synthetic-ghost-receipt-01',body='Synthetic receipt body';
  const value=ids.length?{conversationId:'conv-one',body,attachments:ids}:{conversationId:'conv-one',body};const hash=await attachmentHash(new TextEncoder().encode(JSON.stringify(value)));
  f.sqlite.prepare('INSERT INTO messaging_requests VALUES(?,?,?,?,?)').run('alice',key,'send',hash,crypto.randomUUID());
  const response=await f.send('alice','conv-one',ids,key,body);assert.equal(response.status,409);const error=await response.json();assert.equal(error.safeToEdit,undefined);assert.equal(error.message,undefined);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),1);
  if(ids.length){const row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(ids[0]);assert.equal(row.message_id,null);assert.equal(row.state,'ready')}
 }
});
test('synthetic legacy text-only send receipt keeps the old fingerprint with no account-binding field',async()=>{
 const f=await setup(),key='synthetic-legacy-send-01',messageId=crypto.randomUUID(),body='Synthetic old-client text';
 f.sqlite.prepare('INSERT INTO messages(id,conversation_id,author_id,body,created_at,sequence) VALUES(?,?,?,?,?,?)').run(messageId,'conv-one','alice',body,new Date().toISOString(),1);
 const fingerprint=await attachmentHash(new TextEncoder().encode(JSON.stringify({conversationId:'conv-one',body})));f.sqlite.prepare('INSERT INTO messaging_requests VALUES(?,?,?,?,?)').run('alice',key,'send',fingerprint,messageId);
 const response=await f.call('alice','/api/conversations/conv-one/messages','POST',{requestId:key,body});assert.equal(response.status,201);const returned=(await response.json()).message;assert.equal(returned.id,messageId);assert.deepEqual(returned.files,[]);assert.equal(count(f.sqlite,'messages'),1);assert.equal(count(f.sqlite,'messaging_requests'),1);
 assert.equal((await f.call('alice','/api/conversations/conv-one/messages','POST',{requestId:key,body:'Different synthetic text'})).status,409);
});
test('synthetic truly simultaneous same-key sends return the same message and ordered files exactly once',async()=>{
 const f=await setup(),first=await uploaded(f),second=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'second.txt')),ids=[second.id,first.id],key='synthetic-parallel-send-01';
 const responses=await Promise.all([f.send('alice','conv-one',ids,key),f.send('alice','conv-one',ids,key)]);const messages=[];for(const response of responses){assert.equal(response.status,201,await response.clone().text());messages.push((await response.json()).message)}assert.deepEqual(messages[0],messages[1]);assert.deepEqual(messages[0].files.map(item=>item.id),ids);assert.equal(count(f.sqlite,'messages'),1);assert.equal(count(f.sqlite,'messaging_requests'),1);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM conversation_attachments WHERE message_id=?').get(messages[0].id).n,2);
});
test('synthetic exact maximum five-file message succeeds and generic file references stay unsupported',async()=>{
 const f=await setup(),ids=[];for(let i=0;i<5;i++)ids.push((await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'max-'+i+'.txt'))).id);const response=await f.send('alice','conv-one',ids);assert.equal(response.status,201);assert.equal((await response.json()).message.files.length,5);
 assert.equal((await f.call('alice','/api/conversations/conv-one/messages','POST',{requestId:crypto.randomUUID(),body:'Synthetic text',attachments:['/api/media/'+ids[0]],expectedAccountId:'alice'})).status,400);
});
test('synthetic direct-message send rechecks peer adult eligibility at commit without consuming attachments',async()=>{
 for(const change of ['inactive','unverified','minor']){
  const f=await setup(),attachment=await uploaded(f,'alice','direct-one');f.DB.beforeBatch=()=>f.sqlite.exec({inactive:"UPDATE members SET status='inactive' WHERE id='bob'",unverified:"UPDATE user SET emailVerified=0 WHERE id='bob'",minor:"UPDATE profiles SET birthday='2015-01-01' WHERE member_id='bob'"}[change]);const response=await f.send('alice','direct-one',[attachment.id]);assert.ok([409,410].includes(response.status));assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);assert.equal(f.sqlite.prepare('SELECT message_id FROM conversation_attachments WHERE id=?').get(attachment.id).message_id,null);
 }
});

test('synthetic attachment association UPDATE failure rolls back receipt and message together',async()=>{
 const f=await setup(),attachment=await uploaded(f);f.sqlite.exec("CREATE TRIGGER synthetic_association_failure BEFORE UPDATE OF message_id ON conversation_attachments WHEN NEW.message_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic attachment association failure'); END");
 await assert.rejects(()=>f.send('alice','conv-one',[attachment.id]),/synthetic attachment association failure/);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);const row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);assert.equal(row.message_id,null);assert.equal(row.message_ordinal,null);assert.equal(row.state,'ready');assert.equal(f.R2.objects.size,1);
});
test('synthetic corrupt message-bound owner or conversation links never bypass the attachment read ACL',async()=>{
 for(const mismatch of ['author','conversation']){
  const f=await setup(),attachment=await uploaded(f),messageId=crypto.randomUUID();f.sqlite.prepare('INSERT INTO messages(id,conversation_id,author_id,body,created_at,sequence) VALUES(?,?,?,?,?,?)').run(messageId,mismatch==='conversation'?'conv-two':'conv-one',mismatch==='author'?'bob':'alice','Synthetic corrupt link fixture',new Date().toISOString(),1);f.sqlite.prepare('UPDATE conversation_attachments SET message_id=?,message_ordinal=0 WHERE id=?').run(messageId,attachment.id);
  await denied(await f.call('alice',path(attachment)),'owner with corrupt '+mismatch);await denied(await f.call('bob',path(attachment)),'peer with corrupt '+mismatch);const page=await f.call('bob',`/api/conversations/${mismatch==='conversation'?'conv-two':'conv-one'}/messages`);assert.equal(page.status,200);assert.deepEqual((await page.json()).messages[0].files,[]);
 }
});
test('synthetic attachment-only filename fallback obeys existing message body CHECK and API returns an empty body',async()=>{
 const f=await setup(),ids=[];for(let i=0;i<5;i++){const attachment=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'synthetic-'+i+'-'+('a'.repeat(170))+'.txt'));assert.ok(attachment.name.length<=150);ids.push(attachment.id)}const response=await f.send('alice','conv-one',ids,crypto.randomUUID(),'   ');assert.equal(response.status,201,await response.clone().text());const message=(await response.json()).message;assert.equal(message.body,'');assert.equal(message.files.length,5);const stored=f.sqlite.prepare('SELECT body,attachment_only FROM messages WHERE id=?').get(message.id);assert.equal(stored.attachment_only,1);assert.ok(stored.body.trim().length>=1&&stored.body.length<=4000);assert.equal(stored.body.split('\n').length,5);
});

test('synthetic hostile filenames always end in the validated MIME suffix and sanitize unsafe characters',async()=>{
 const f=await setup();
 for(const name of ['synthetic.html','synthetic.svg','synthetic.js','synthetic.sh','synthetic.exe']){
  const attachment=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,name));assert.equal(attachment.name,name+'.txt');const response=await f.call('alice',path(attachment));assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'text/plain');assert.match(response.headers.get('Content-Disposition'),/\.txt$/);assert.match(response.headers.get('Content-Disposition'),/^attachment;/);
 }
 for(const[type,data,name,expected]of [['image/jpeg',bytes.jpeg,'photo.JpEg','photo.JpEg'],['image/jpeg',bytes.jpeg,'photo.jpg','photo.jpg'],['image/jpeg',bytes.jpeg,'photo.png','photo.png.jpg'],['image/png',bytes.png,'photo.exe','photo.exe.png'],['image/webp',bytes.webp,'photo.js','photo.js.webp'],['image/gif',bytes.gif,'photo.svg','photo.svg.gif'],['application/pdf',bytes.pdf,'document.html','document.html.pdf']])assert.equal((await validateAttachmentBytes(file(type,data,name))).name,expected);
 const names=['a'.repeat(150),('a'.repeat(145)+'\u{1F600}').repeat(2),'../folder\\unsafe<>:"|?*\r\n\u202E\u2066name.exe','synthetic\uD800.exe','\uDC00synthetic.exe'];
 for(const name of names){
  // A plain file-shaped synthetic object preserves lone UTF-16 surrogates, which
  // File's USVString conversion would replace before this handler sees them.
  const value={name,type:'text/plain',size:bytes.text.length,arrayBuffer:async()=>bytes.text.buffer.slice(bytes.text.byteOffset,bytes.text.byteOffset+bytes.text.byteLength)};const validated=await validateAttachmentBytes(value);assert.ok(validated.name.length<=150);assert.match(validated.name,/\.txt$/);assert.ok(!/[\x00-\x1f\x7f/\\<>:"|?*\u202A-\u202E\u2066-\u2069]/u.test(validated.name));assert.ok(!/[\uD800-\uDFFF]/u.test(validated.name));assert.doesNotThrow(()=>encodeURIComponent(validated.name));
 }
});
test('synthetic zero-row attachment association caused inside the batch triggers CHECK and full rollback',async()=>{
 for(const mutation of ['cancel','expire']){
  const f=await setup(),attachment=await uploaded(f),original=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);const update=mutation==='cancel'?"SET state='cancelled'":"SET created_at=created_at-86400000,expires_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)-1";
  f.sqlite.exec(`CREATE TRIGGER synthetic_after_message_change AFTER INSERT ON messages BEGIN UPDATE conversation_attachments ${update} WHERE id='${attachment.id}'; END`);
  await assert.rejects(()=>f.send('alice','conv-one',[attachment.id]),/CHECK constraint failed: attachment_only IN\(0,1\)/,mutation);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);const row=f.sqlite.prepare('SELECT * FROM conversation_attachments WHERE id=?').get(attachment.id);assert.deepEqual({...row},{...original});assert.equal(row.message_id,null);assert.equal(row.message_ordinal,null);assert.equal(row.state,'ready');assert.equal(f.R2.objects.size,1);
 }
});

test('synthetic peer same-key commit after a receipt snapshot never claims safe-to-edit expiry',async()=>{
 for(const injection of ['after-first-snapshot','before-attachment-guard']){
  const f=await setup(),first=await uploaded(f),second=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'second.txt')),ids=[second.id,first.id],key='synthetic-peer-snapshot-01';let winner;
  if(injection==='after-first-snapshot')f.DB.afterFirst=async statement=>{if(statement.sql.includes('messaging_requests')){f.DB.afterFirst=null;winner=await f.send('alice','conv-one',ids,key)}};
  else f.DB.beforeFirst=async statement=>{if(statement.sql.includes('conversation_attachments')&&!statement.sql.includes('a.id=?')){f.DB.beforeFirst=null;winner=await f.send('alice','conv-one',ids,key)}};
  const response=await f.send('alice','conv-one',ids,key);assert.ok(winner,'race hook must execute');assert.equal(winner.status,201);const winningMessage=(await winner.json()).message;assert.ok([201,409].includes(response.status),injection+' '+await response.clone().text());const result=await response.json();assert.notEqual(result.safeToEdit,true);if(response.status===201){assert.equal(result.message.id,winningMessage.id);assert.deepEqual(result.message.files.map(item=>item.id),ids)}assert.equal(count(f.sqlite,'messages'),1);assert.equal(count(f.sqlite,'messaging_requests'),1);
 }
});
test('synthetic missing, staged, foreign and bound references never authorize editing the request receipt',async()=>{
 for(const kind of ['missing','staged','foreign-owner','foreign-conversation','bound']){
  const f=await setup();let attachmentId=crypto.randomUUID();
  if(kind==='staged'){f.R2.put=async()=>{throw new Error('Synthetic incomplete upload')};await assert.rejects(()=>f.upload(),/Synthetic incomplete upload/);attachmentId=f.sqlite.prepare('SELECT id FROM conversation_attachments').get().id}
  if(kind==='foreign-owner')attachmentId=(await uploaded(f,'bob')).id;
  if(kind==='foreign-conversation')attachmentId=(await uploaded(f,'alice','conv-two')).id;
  if(kind==='bound'){attachmentId=(await uploaded(f)).id;assert.equal((await f.send('alice','conv-one',[attachmentId])).status,201)}
  const response=await f.send('alice','conv-one',[attachmentId]);assert.equal(response.status,409,kind+' '+await response.clone().text());assert.notEqual((await response.json()).safeToEdit,true);assert.equal(count(f.sqlite,'messages'),kind==='bound'?1:0);assert.equal(count(f.sqlite,'messaging_requests'),kind==='bound'?1:0);
 }
});
test('synthetic known owned unbound expiry or cancellation is the only safe-to-edit unavailable result',async()=>{
 for(const kind of ['expired','cancelled']){
  const f=await setup(),attachment=await uploaded(f);if(kind==='expired')f.sqlite.prepare('UPDATE conversation_attachments SET created_at=?,expires_at=? WHERE id=?').run(Date.now()-86400001,Date.now()-1,attachment.id);else assert.equal((await f.call('alice',path(attachment),'DELETE')).status,200);
  const response=await f.send('alice','conv-one',[attachment.id]);assert.equal(response.status,410);assert.equal((await response.json()).safeToEdit,true);assert.equal(count(f.sqlite,'messages'),0);assert.equal(count(f.sqlite,'messaging_requests'),0);
 }
});
test('synthetic cached message bodies and files are withheld if access changes during attachment hydration',async()=>{
 for(const mode of ['list','receipt','new-send'])for(const mutation of ['left','inactive','unverified','minor','incomplete','archived']){
  const f=await setup(),attachment=await uploaded(f),key='synthetic-cached-body-01';assert.equal((await f.send('alice','conv-one',[attachment.id],key,'Synthetic confidential cached body')).status,201);let next;if(mode==='new-send')next=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'fresh.txt'));const actor=mode==='list'?'bob':'alice';let hit=false;
  f.DB.afterAll=statement=>{if(!statement.sql.includes('FROM conversation_attachments a JOIN messages'))return;f.DB.afterAll=null;hit=true;f.sqlite.exec({left:`UPDATE conversation_members SET status='left' WHERE conversation_id='conv-one' AND member_id='${actor}'`,inactive:`UPDATE members SET status='inactive' WHERE id='${actor}'`,unverified:`UPDATE user SET emailVerified=0 WHERE id='${actor}'`,minor:`UPDATE profiles SET birthday='2015-01-01' WHERE member_id='${actor}'`,incomplete:`UPDATE profiles SET completed=0 WHERE member_id='${actor}'`,archived:"UPDATE conversations SET archived_at=datetime('now') WHERE id='conv-one'"}[mutation])};
  const response=mode==='list'?await f.call(actor,'/api/conversations/conv-one/messages'):mode==='receipt'?await f.send(actor,'conv-one',[attachment.id],key,'Synthetic confidential cached body'):await f.send(actor,'conv-one',[next.id],crypto.randomUUID(),'Synthetic newly committed cached body');assert.equal(hit,true,'hydration hook '+mode+' '+mutation);assert.equal(response.status,404,mode+' '+mutation+' '+await response.clone().text());const text=await response.text();assert.ok(!text.includes('confidential cached body'));assert.ok(!text.includes('newly committed cached body'));assert.ok(!text.includes(attachment.id));assert.ok(!text.includes('safeToEdit'));
 }
});
test('synthetic matching send receipt refuses altered attachment order or incomplete association hydration',async()=>{
 for(const corruption of ['order','missing']){
  const f=await setup(),first=await uploaded(f),second=await uploaded(f,'alice','conv-one',file('text/plain',bytes.text,'second.txt')),ids=[first.id,second.id],key='synthetic-strict-receipt-01';assert.equal((await f.send('alice','conv-one',ids,key)).status,201);
  if(corruption==='order'){f.sqlite.prepare('UPDATE conversation_attachments SET message_ordinal=4 WHERE id=?').run(first.id);f.sqlite.prepare('UPDATE conversation_attachments SET message_ordinal=0 WHERE id=?').run(second.id);f.sqlite.prepare('UPDATE conversation_attachments SET message_ordinal=1 WHERE id=?').run(first.id)}else f.sqlite.prepare('UPDATE conversation_attachments SET message_id=NULL,message_ordinal=NULL WHERE id=?').run(first.id);
  const response=await f.send('alice','conv-one',ids,key);assert.equal(response.status,409,corruption+' '+await response.clone().text());const result=await response.json();assert.notEqual(result.safeToEdit,true);assert.equal(result.message,undefined);assert.equal(count(f.sqlite,'messages'),1);assert.equal(count(f.sqlite,'messaging_requests'),1);
 }
});


test('private file reads and deletion require the initiating account',async()=>{
 const f=await setup(),attachment=await uploaded(f);f.env.expectedAccountId='bob';
 assert.equal((await f.call('alice',path(attachment))).status,409);
 assert.equal((await f.call('alice',path(attachment),'DELETE')).status,409);
 assert.equal(f.R2.objects.size,1);
 f.env.expectedAccountId='';assert.equal((await f.call('alice',path(attachment))).status,409);
});
test('session invalidation during a bucket read never returns private bytes',async()=>{
 const f=await setup(),attachment=await uploaded(f);let revoked=false;
 f.env.validateMessageSession=async()=>{if(revoked)throw Object.assign(new Error('Sign in required'),{status:401})};
 f.R2.beforeGet=()=>{revoked=true};const response=await f.call('alice',path(attachment));assert.equal(response.status,401);assert.ok(!(await response.text()).includes('Synthetic private'));
});
test('session invalidation during upload erases the unbound object',async()=>{
 const f=await setup();let revoked=false;f.env.validateMessageSession=async()=>{if(revoked)throw Object.assign(new Error('Sign in required'),{status:401})};
 f.R2.beforePut=()=>{revoked=true};assert.equal((await f.upload()).status,401);assert.equal(f.R2.objects.size,0);assert.equal(f.sqlite.prepare('SELECT state FROM conversation_attachments').get().state,'cancelled');
});
test('cancellation before allocation prevents delayed upload recreation',async()=>{
 const f=await setup(),key='cancel-before-upload-01';assert.equal((await f.call('alice','/api/conversations/conv-one/attachment-requests/'+key,'DELETE')).status,200);
 assert.equal((await f.upload('alice','conv-one',file(),key)).status,410);assert.equal(f.R2.objects.size,0);assert.equal(count(f.sqlite,'conversation_attachments'),0);
});
test('cancelling during put cleans the late object and cannot cancel a sent attachment',async()=>{
 const f=await setup(),key='cancel-during-put-01';f.R2.beforePut=async()=>assert.equal((await f.call('alice','/api/conversations/conv-one/attachment-requests/'+key,'DELETE')).status,200);
 assert.equal((await f.upload('alice','conv-one',file(),key)).status,404);assert.equal(f.R2.objects.size,0);assert.equal((await f.upload('alice','conv-one',file(),key)).status,410);
 const sentKey='cancel-after-send-01',attachment=await uploaded(f,'alice','conv-one',file(),sentKey);assert.equal((await f.send('alice','conv-one',[attachment.id])).status,201);
 assert.equal((await f.call('alice','/api/conversations/conv-one/attachment-requests/'+sentKey,'DELETE')).status,200);assert.equal(f.R2.objects.size,1);assert.equal((await f.call('bob',path(attachment))).status,200);
});
test('cleanup erases expired and cancelled unbound objects, preserving fresh and sent objects',async()=>{
 const f=await setup(),expired=await uploaded(f),cancelled=await uploaded(f),fresh=await uploaded(f),bound=await uploaded(f);
 assert.equal((await f.send('alice','conv-one',[bound.id])).status,201);
 f.sqlite.prepare('UPDATE conversation_attachments SET created_at=?,expires_at=? WHERE id IN (?,?)').run(Date.now()-2*ATTACHMENT_TTL_MS,Date.now()-1,expired.id,bound.id);
 f.sqlite.prepare("UPDATE conversation_attachments SET state='cancelled' WHERE id=?").run(cancelled.id);
 const result=await cleanupMessageAttachments(f.env);assert.equal(result.deleted,2);assert.equal(f.R2.objects.size,2);assert.equal((await f.call('alice',path(fresh))).status,200);assert.equal((await f.call('bob',path(bound))).status,200);
 assert.equal((await f.send('alice','conv-one',[expired.id])).status,410);assert.equal(count(f.sqlite,'conversation_attachments'),4);
});
test('cleanup survives failed deletion and removes late writes on later sweeps',async()=>{
 const f=await setup(),attachment=await uploaded(f),row=f.sqlite.prepare('SELECT * FROM conversation_attachments').get(),now=Date.now();f.sqlite.prepare("UPDATE conversation_attachments SET state='cancelled' WHERE id=?").run(attachment.id);
 f.R2.beforeDelete=()=>{throw Error('Synthetic delete failure')};await assert.rejects(()=>cleanupMessageAttachments(f.env,{now}),/Synthetic delete failure/);assert.equal(f.sqlite.prepare('SELECT lease_until FROM conversation_attachment_cleanup').get().lease_until,0);assert.equal(f.R2.objects.size,1);
 f.R2.beforeDelete=null;assert.equal((await cleanupMessageAttachments(f.env,{now})).deleted,1);assert.equal(f.R2.objects.size,0);
 await f.R2.put(row.object_key,bytes.png,{});assert.equal((await cleanupMessageAttachments(f.env,{now:now+3600001})).deleted,1);assert.equal(f.R2.objects.size,0);
});
test('cleanup transaction guard preserves a stage bound by a concurrent send',async()=>{
 const f=await setup(),attachment=await uploaded(f);const now=Date.now()+ATTACHMENT_TTL_MS+1;
 f.DB.beforeFirst=async statement=>{if(!statement.sql.startsWith('UPDATE conversation_attachments SET state='))return;f.DB.beforeFirst=null;assert.equal((await f.send('alice','conv-one',[attachment.id])).status,201)};
 assert.equal((await cleanupMessageAttachments(f.env,{now})).deleted,0);assert.equal(f.R2.objects.size,1);assert.equal((await f.call('bob',path(attachment))).status,200);
});
test('orphan cleanup is bounded, age-limited, prefix-isolated and resumes its cursor',async()=>{
 const f=await setup(),now=Date.now(),keys=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'].map(id=>'message-attachments/'+id);
 for(const key of keys){await f.R2.put(key,bytes.png,{});f.R2.objects.get(key).uploaded=new Date(now-ATTACHMENT_TTL_MS-1)}
 await f.R2.put('family-media/never-delete',bytes.png,{});f.R2.objects.get('family-media/never-delete').uploaded=new Date(0);
 await f.R2.put('message-attachments/ffffffff-ffff-ffff-ffff-ffffffffffff',bytes.png,{});
 const first=await cleanupMessageAttachments(f.env,{now,limit:2});assert.equal(first.orphans,2);assert.equal(f.sqlite.prepare('SELECT cursor FROM conversation_attachment_cleanup').get().cursor,keys[1]);
 const second=await cleanupMessageAttachments(f.env,{now,limit:2});assert.equal(second.orphans,1);assert.equal(f.R2.objects.size,2);assert.equal(f.sqlite.prepare('SELECT cursor FROM conversation_attachment_cleanup').get().cursor,null);
});
test('cleanup skips a competing live lease and never needs enabled auth or push',async()=>{
 const f=await setup(),now=Date.now();f.sqlite.prepare("UPDATE conversation_attachment_cleanup SET lease_token='other',lease_until=?").run(now+10000);
 assert.deepEqual(await cleanupMessageAttachments(f.env,{now}),{skipped:true});assert.equal(f.R2.calls.length,0);
});
