import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createTestPng} from '../../tests/png-fixtures.mjs';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {SHARED_PAGE_SCHEMA,sharedPageDefaults,validateSharedPageContent} from '../../src/shared-content-schema.js';

function setup(){
 const value=database();seed(value.sqlite);
 value.sqlite.exec(`UPDATE members SET is_leader=1 WHERE id='alice';UPDATE members SET roles_json='["admin","planner","moderator"]' WHERE id='bob';`);
 const objects=new Map();
 const env={DB:value.DB,R2:{head:async key=>objects.get(key)||null,get:async key=>objects.has(key)?{body:objects.get(key).bytes}:null,put:async(key,bytes,options)=>objects.set(key,{bytes,...options}),delete:async key=>objects.delete(key)},BETTER_AUTH_SECRET:'synthetic-page-content-test-secret',AUTH_ORIGIN:'https://family.example.test'};
 const sessions=new Set(['owner','alice','bob','pending']);
 const app=createApp(()=>({api:{getSession:async({headers})=>{const id=headers.get('Cookie')?.match(/session=([^;]+)/)?.[1];return sessions.has(id)?{user:{id,emailVerified:true}}:null;}}}));
 async function call(user,path,method='GET',body,headers={}){
  const response=await app.request(env.AUTH_ORIGIN+path,{method,headers:{...(user?{Cookie:'session='+user}:{}),Origin:env.AUTH_ORIGIN,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})},env);
  const type=response.headers.get('Content-Type')||'';
  return {status:response.status,data:type.includes('application/json')?await response.json():await response.text(),headers:response.headers};
 }
 const get=(page='home',user='bob')=>call(user,'/api/page-content/'+page);
 const write=(content,expectedRevision=0,user='alice',page='home',requestId=crypto.randomUUID())=>call(user,'/api/page-content/'+page,'PATCH',{requestId,expectedRevision,content});
 const restore=(revision,expectedRevision,user='alice',page='home',requestId=crypto.randomUUID())=>call(user,'/api/page-content/'+page+'/restore','POST',{requestId,expectedRevision,revision});
 const upload=(id,owner='alice',type='image/jpeg',options={})=>{
  const key=`family/${owner}/${id}`,size=options.size??5;
  value.sqlite.prepare('INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes,deleted_at) VALUES(?,?,?,?,?,?,?)').run(id,owner,options.key??key,id,type,size,options.deleted?'2026-01-01':null);
  if(!options.missing)objects.set(key,{bytes:new Uint8Array([255,216,255,224,0]),size});
  return {id,alt:'Family photo'};
 };
 return {...value,env,app,call,get,write,restore,upload,objects};
}
const copy=(heading,hero={mode:'default',media:[]})=>({text:{heading},hero});

test('source defaults are returned to active family without database seeds; public and pending users cannot read',async()=>{
 const {get,call,sqlite}=setup();
 for(const page of Object.keys(SHARED_PAGE_SCHEMA)){
  const result=await get(page);assert.equal(result.status,200,page);assert.equal(result.data.revision,0);assert.deepEqual(result.data.content,sharedPageDefaults(page));assert.equal(result.data.canEdit,false);assert.equal(result.headers.get('Cache-Control'),'no-store');
 }
 assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content').get().n,0);
 assert.equal((await get('home','alice')).data.canEdit,true);
 for(const user of [null,'pending'])for(const path of ['/api/page-content/home','/api/page-content/global','/api/page-content/home/revisions'])assert.equal((await call(user,path)).status,user?403:401,path);
 for(const page of ['welcome','signin','profile','posts','menus','__proto__','unknown'])assert.equal((await get(page)).status,404,page);
});

test('only explicit Leaders can write or restore; admin and organizer roles never grant access',async()=>{
 const {write,restore,call,sqlite}=setup();
 for(const user of [null,'pending','bob']){
  assert.equal((await write(copy('Blocked'),0,user)).status,user?403:401,user);
  assert.equal((await restore(0,0,user)).status,user?403:401,user);
  assert.equal((await call(user,'/api/page-content/home/revisions')).status,user?403:401,user);
 }
 // Alice has no administrative, planner or moderator roles, only is_leader.
 assert.equal((await write(copy('Leader-written heading'))).status,200);
 assert.equal((await call('alice','/api/page-content/home','PATCH',{requestId:crypto.randomUUID(),expectedRevision:1,content:copy('Cross origin')},{Origin:'https://evil.example'})).status,403);
 sqlite.exec("UPDATE members SET is_leader=0 WHERE id='alice'");assert.equal((await write(copy('Revoked'),1)).status,403);
});

test('writes sanitize bounded allowlisted plain text and store only default overrides',async()=>{
 const {write,get,sqlite}=setup();
 const result=await write(copy('  <b>Hello</b>\u0000 family\nagain  '));assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.content.text.heading,'Hello family again');assert.equal(result.data.revision,1);
 assert.equal((await get()).data.content.text.heading,'Hello family again');
 assert.deepEqual(JSON.parse(sqlite.prepare('SELECT content_json FROM page_content_revisions').get().content_json),{text:{heading:'Hello family again'},hero:{mode:'default',media:[]}});
 const rejected=[{text:{navigation:'Alter menu'}},{text:{selfId:'bob'}},{text:{name:'Someone else'}},{text:{heading:'x'.repeat(161)}},{text:{heading:{html:'<b>No</b>'}}},{text:[]},{text:null},{text:false},{text:'wrong'},{hero:null},{text:{},__proto__:null,other:'forbidden'},JSON.parse('{"text":{"__proto__":"attack"}}'),{text:{heading:'Allowed'},personalProfiles:[]}];
 for(const value of rejected){const result=await write(value,1);assert.equal(result.status,400,JSON.stringify(value));}
 assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,1);
});

test('all schema pages edit independently while global refuses hero media',async()=>{
 const {get,write,upload}=setup();
 for(const [page,schema]of Object.entries(SHARED_PAGE_SCHEMA)){
  const key=Object.keys(schema.fields)[0],result=await write({text:{[key]:'Updated '+page}},0,'alice',page);assert.equal(result.status,200,page);assert.equal((await get(page)).data.content.text[key],'Updated '+page);
 }
 const file=upload('global-image');assert.equal((await write({text:{footerTagline:'Family'},hero:{mode:'image',media:[file]}},1,'alice','global')).status,400);
});

test('stale revision returns current content; concurrent edits cannot overwrite another Leader',async()=>{
 const {env,DB,write,get,sqlite}=setup();
 const batch=DB.batch.bind(DB);let tail=Promise.resolve();DB.batch=statements=>{const run=tail.then(()=>batch(statements));tail=run.catch(()=>{});return run;};
 const values=await Promise.all([write(copy('Alice first'),0,'alice'),write(copy('Owner first'),0,'owner')]);assert.deepEqual(values.map(x=>x.status).sort(),[200,409]);
 const stale=values.find(x=>x.status===409);assert.equal(stale.data.current.revision,1);assert.equal(stale.data.current.content.text.heading,(await get()).data.content.text.heading);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,1);assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_requests').get().n,1);
 assert.equal((await write(copy('Still stale'),0)).status,409);
});

test('request replay is idempotent and changing its page, content, expected revision or operation fails',async()=>{
 const {write,call,get,restore,sqlite}=setup(),id=crypto.randomUUID(),value=copy('Exactly once');
 const first=await write(value,0,'alice','home',id),second=await write(value,0,'alice','home',id);assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(second.data.revision,1);assert.equal(second.data.replayed,true);
 assert.equal((await write(copy('Changed'),0,'alice','home',id)).status,409);
 assert.equal((await write(value,1,'alice','home',id)).status,409);
 assert.equal((await write(value,0,'alice','family',id)).status,409);
 assert.equal((await restore(0,1,'alice','home',id)).status,409);
 await write(copy('Newer edit'),1,'owner');
 const lateRetry=await write(value,0,'alice','home',id);assert.equal(lateRetry.data.revision,1);assert.equal((await get()).data.revision,2);assert.equal((await get()).data.content.text.heading,'Newer edit');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,2);
});

test('restoration appends a revision, preserves history and supports a reversible reset to source defaults',async()=>{
 const {write,restore,get,call,sqlite}=setup();
 await write(copy('First'));await write(copy('Second'),1,'owner');
 const restored=await restore(1,2);assert.equal(restored.status,200);assert.equal(restored.data.revision,3);assert.equal(restored.data.content.text.heading,'First');
 assert.equal((await restore(0,3)).data.revision,4);assert.deepEqual((await get()).data.content,sharedPageDefaults('home'));
 assert.equal((await restore(2,4)).data.content.text.heading,'Second');
 const history=await call('alice','/api/page-content/home/revisions?limit=2');assert.equal(history.status,200);assert.deepEqual(history.data.revisions.map(x=>x.revision),[5,4]);assert.equal(history.data.revisions[0].restoredFrom,2);assert.equal(history.data.nextBefore,4);
 const older=await call('alice','/api/page-content/home/revisions?limit=2&before=4');assert.deepEqual(older.data.revisions.map(x=>x.revision),[3,2]);assert.equal(older.data.revisions[0].editorName,'Alice');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,5);
 assert.equal((await restore(6,5)).status,400);assert.equal((await restore(1,4)).status,409);
});

test('uploaded images and video are validated, enriched and visible to family only while currently published',async()=>{
 const {upload,write,get,call,restore}=setup(),one=upload('one'),two=upload('two'),video=upload('video','alice','video/mp4');
 assert.equal((await call('bob','/api/media/one')).status,404);
 let result=await write(copy('Gallery',{mode:'gallery',media:[one,two]}));assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.content.hero.media[0].url,'/api/media/one');assert.equal(result.data.content.hero.media[0].type,'image/jpeg');
 assert.equal((await call('bob','/api/media/one')).status,200);assert.equal((await call(null,'/api/media/one')).status,401);assert.equal((await call('pending','/api/media/one')).status,403);
 result=await write(copy('Video',{mode:'video',media:[video]}),1);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal((await call('bob','/api/media/video')).status,200);assert.equal((await call('bob','/api/media/one')).status,404);
 // Seeing a history entry does not grant its unpublished media to a different Leader.
 assert.equal((await call('owner','/api/page-content/home/revisions')).data.revisions[1].content.hero.media[0].url,'/api/media/one');assert.equal((await call('owner','/api/media/one')).status,404);
 assert.equal((await restore(1,2,'owner')).status,200);assert.equal((await call('bob','/api/media/one')).status,200);assert.equal((await call('bob','/api/media/video')).status,404);
 assert.equal((await restore(0,3)).status,200);assert.equal((await call('bob','/api/media/one')).status,404);
 // The upload owner's pre-existing read permission is unchanged.
 assert.equal((await call('alice','/api/media/one')).status,200);
});

test('Leader can retain current shared media from another Leader, but cannot introduce someone else’s private upload',async()=>{
 const {upload,write,restore,call}=setup(),shared=upload('shared'),privateFile=upload('private'),personal=upload('private-profile','bob');
 await write(copy('Shared',{mode:'image',media:[shared]}));
 assert.equal((await write(copy('Edited copy',{mode:'image',media:[shared]}),1,'owner')).status,200);
 assert.equal((await write(copy('Stolen',{mode:'image',media:[privateFile]}),2,'owner')).status,400);
 assert.equal((await write(copy('Stolen profile',{mode:'image',media:[personal]}),2)).status,400);
 assert.equal((await write({text:{heading:'Another page'},hero:{mode:'image',media:[shared]}},0,'owner','family')).status,400);
 await restore(0,2);assert.equal((await write(copy('Old reference',{mode:'image',media:[shared]}),3,'owner')).status,400);
 assert.equal((await restore(1,3,'owner')).status,200);assert.equal((await call('bob','/api/media/shared')).status,200);
});

test('media references reject URLs, unknown fields, wrong types, oversize/deleted/missing files and forged object keys',async()=>{
 const {upload,write,sqlite}=setup();
 const image=upload('image'),video=upload('clip','alice','video/webm'),audio=upload('audio','alice','audio/ogg'),svg=upload('svg','alice','image/svg+xml'),big=upload('big','alice','image/jpeg',{size:21*1024*1024}),deleted=upload('deleted','alice','image/jpeg',{deleted:true}),missing=upload('missing','alice','image/jpeg',{missing:true}),forged=upload('forged','alice','image/jpeg',{key:'different-private-path'});
 for(const media of [[{id:'https://evil.example/file',alt:''}],[{...image,url:'https://evil.example/file'}],[{id:'not-uploaded'}],[audio],[svg],[big],[deleted],[missing],[forged],[video]])assert.equal((await write(copy('Invalid',{mode:'image',media}))).status,400,JSON.stringify(media));
 assert.equal((await write(copy('Wrong type',{mode:'video',media:[image]}))).status,400);
 for(const hero of [{mode:'iframe',media:[]},{mode:'default',media:[image]},{mode:'image',media:[]},{mode:'image',media:[image,image]},{mode:'gallery',media:[image,image]},{mode:'gallery',media:Array.from({length:11},(_,i)=>({id:'id'+i}))},{mode:'video',media:[video],autoplay:false}])assert.equal((await write(copy('Wrong shape',hero))).status,400,JSON.stringify(hero));
 assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content').get().n,0);
});

test('private profile, post, memory and conversation data are never altered through this endpoint',async()=>{
 const {write,sqlite}=setup();
 const before={members:sqlite.prepare('SELECT * FROM members').all(),profiles:sqlite.prepare('SELECT * FROM profiles').all(),posts:sqlite.prepare('SELECT * FROM posts').all(),memories:sqlite.prepare('SELECT * FROM memories').all(),messages:sqlite.prepare('SELECT * FROM messages').all()};
 await write(copy('Safe shared copy'));
 for(const [table,rows]of Object.entries(before))assert.deepEqual(sqlite.prepare('SELECT * FROM '+table).all(),rows);
});

test('database rechecks Leader authorization and media validity inside the atomic write',async()=>{
 for(const changed of ['leader','media']){
  const {upload,write,DB,sqlite}=setup(),file=upload('race-file'),batch=DB.batch.bind(DB);let once=true;
  DB.batch=async statements=>{if(once){once=false;sqlite.exec(changed==='leader'?"UPDATE members SET is_leader=0 WHERE id='alice'":"UPDATE media SET deleted_at=CURRENT_TIMESTAMP WHERE id='race-file'");}return batch(statements);};
  const result=await write(copy('Race',{mode:'image',media:[file]}));assert.equal(result.status,changed==='leader'?403:409,JSON.stringify(result.data));assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_requests').get().n,0);
 }
});

test('invalid request IDs, revisions, pagination and input size fail closed; editing is rate limited',async()=>{
 const {call,write,sqlite}=setup();
 for(const expectedRevision of [-1,0.5,'0',Number.MAX_SAFE_INTEGER+1,null])assert.equal((await call('alice','/api/page-content/home','PATCH',{requestId:crypto.randomUUID(),expectedRevision,content:copy('Bad revision')})).status,400);
 for(const requestId of ['',null,'short','x'.repeat(101),'not valid key'])assert.equal((await write(copy('Bad key'),0,'alice','home',requestId)).status,400);
 for(const query of ['?limit=0','?limit=51','?limit=1.5','?limit=01','?before=-1','?before=0','?before=abc','?before=9999999999999999'])assert.equal((await call('alice','/api/page-content/home/revisions'+query)).status,400,query);
 assert.equal((await write({text:{heading:'x'.repeat(70000)}})).status,413);
 sqlite.prepare('INSERT INTO app_rate_limits(key,count,reset_at) VALUES(?,?,?)').run('page-content:write:alice',60,Date.now()+3600000);
 assert.equal((await write(copy('Too many'))).status,429);assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,0);
});

test('pure contract has no menu or personal fields, strict bounded text/media shape and source-reset semantics',()=>{
 for(const [page,schema]of Object.entries(SHARED_PAGE_SCHEMA)){
  assert.ok(!Object.keys(schema.fields).some(key=>/password|payment|email|phone|address|menu|memberId|selfId/i.test(key)),page);
  assert.deepEqual(validateSharedPageContent(page,{}),sharedPageDefaults(page));
 }
 assert.throws(()=>validateSharedPageContent('home',{text:{heading:'a'.repeat(161)}}));
 assert.equal(validateSharedPageContent('home',{text:{heroTitle:'Line one\nLine two'}}).text.heroTitle,'Line one\nLine two');
});


test('existing upload endpoint feeds the shared gallery without exposing an unpublished upload',async()=>{
 const {app,env,write,call,objects}=setup(),files=[];
 for(let i=0;i<2;i++){
  const form=new FormData();form.append('file',new File([createTestPng(3+i,2)],'photo-'+i+'.png',{type:'image/png'}));
  const response=await app.request(env.AUTH_ORIGIN+'/api/media',{method:'POST',headers:{Cookie:'session=alice',Origin:env.AUTH_ORIGIN},body:form},env);
  assert.equal(response.status,201);const file=await response.json();assert.ok(objects.has('family/alice/'+file.id));assert.equal((await call('bob',file.url)).status,404);files.push({id:file.id,alt:'Uploaded family photograph'});
 }
 const published=await write(copy('Uploaded gallery',{mode:'gallery',media:files}));assert.equal(published.status,200,JSON.stringify(published.data));
 for(const file of files)assert.equal((await call('bob','/api/media/'+file.id)).status,200);
});

test('additive content migration preserves all existing family and messaging rows and seeds no content',()=>{
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')&&file<'0011').sort())sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 seed(sqlite);sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('existing-post','alice','Keep existing post');INSERT INTO conversations(id,name,owner_id) VALUES('existing-chat','Keep private chat','alice');INSERT INTO conversation_members(conversation_id,member_id,status) VALUES('existing-chat','alice','active');INSERT INTO messages(id,conversation_id,author_id,body,sequence) VALUES('existing-message','existing-chat','alice','Keep private message',1);");
 const tables=['user','members','profiles','posts','conversations','conversation_members','messages'],before=Object.fromEntries(tables.map(table=>[table,sqlite.prepare('SELECT * FROM '+table).all()]));
 sqlite.exec(readFileSync(new URL('../migrations/0011_page_content.sql',import.meta.url),'utf8'));
 for(const table of tables)assert.deepEqual(sqlite.prepare('SELECT * FROM '+table).all(),before[table],table);
 for(const table of ['page_content','page_content_revisions','page_content_requests'])assert.equal(sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
});
