import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';

function setup(){
 const value=database();seed(value.sqlite);
 value.sqlite.exec(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('carol','Carol','carol@example.test',1,0,0),('dave','Dave','dave@example.test',1,0,0),('minor','Minor','minor@example.test',1,0,0),('unverified','Unverified','unverified@example.test',0,0,0),('incomplete','Incomplete','incomplete@example.test',1,0,0);
 INSERT INTO members(id,status) VALUES('carol','active'),('dave','active'),('minor','active'),('unverified','active'),('incomplete','active');
 INSERT INTO profiles(member_id,birthday,completed) VALUES('carol','1990-01-01',1),('dave','1990-01-01',1),('minor','2020-01-01',1),('unverified','1990-01-01',1);
 INSERT INTO dependents(id,guardian_id,name,birthday,gender) VALUES('child','alice','Private child','2020-01-01','Prefer not to say');
 INSERT INTO memorials(id,name,created_by) VALUES('ancestor','Remembered ancestor','owner');
 INSERT INTO posts(id,author_id,body) VALUES('public-post','alice','A public post');
 INSERT INTO posts(id,author_id,body,group_id) VALUES('private-post','alice','Private post','private-group');`);
 const env={DB:value.DB,BETTER_AUTH_SECRET:'synthetic-test-secret-not-real',AUTH_ORIGIN:'https://family.example.test'};
 // Separate signed-in cookie sessions share the same persistent database, as in production.
 const sessions=new Map(['alice','bob','owner','carol','dave','pending','minor','unverified','incomplete'].map(id=>['session-'+id,id]));
 const app=createApp(()=>({api:{getSession:async({headers})=>{const token=headers.get('Cookie')?.match(/(?:^|;\s*)gw_session=([^;]+)/)?.[1],id=sessions.get(token);return id?{user:{id,emailVerified:id!=='unverified'}}:null}}}));
 async function call(user,path,method='GET',body,headers={}){
  const response=await app.request(env.AUTH_ORIGIN+path,{method,headers:{...(user?{Cookie:'gw_session=session-'+user}:{}),Origin:env.AUTH_ORIGIN,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})},env);
  return {status:response.status,data:await response.json(),headers:response.headers};
 }
 const create=async(user,ids=['bob'],type='direct',name='')=>{const result=await call(user,'/api/conversations','POST',{requestId:crypto.randomUUID(),type,memberIds:ids,...(name?{name}:{})});assert.equal(result.status,201,JSON.stringify(result.data));return result.data.id};
 const accept=async(user,id)=>{const result=await call(user,`/api/conversations/${id}/invitation`,'POST',{action:'accept'});assert.equal(result.status,200,JSON.stringify(result.data));};
 const send=async(user,id,body,requestId=crypto.randomUUID())=>call(user,`/api/conversations/${id}/messages`,'POST',{requestId,body});
 return {...value,env,app,call,create,accept,send};
}

test('two sessions: invitation metadata only until acceptance; administrator cannot read private chat',async()=>{
 const {call,create,accept,send}=setup(),id=await create('alice');
 assert.equal((await send('alice',id,'A private invitation-era message')).status,201);
 const pending=await call('bob','/api/conversations');assert.equal(pending.status,200);assert.equal(pending.data.conversations.length,0);assert.equal(pending.data.invitations.length,1);assert.equal(pending.data.invitations[0].invitedByName,'Alice');assert.equal(pending.data.invitations[0].memberCount,2);assert.doesNotMatch(JSON.stringify(pending.data),/private invitation-era|body|lastMessage/);
 for(const user of ['bob','owner','carol']){
  for(const [path,method,body] of [
   ['', 'GET'],['/messages','GET'],['/typing','GET'],['/messages','POST',{requestId:crypto.randomUUID(),body:'no'}],['/typing','POST',{typing:true}],['/read','POST',{sequence:1}],['/members','POST',{memberIds:['carol']}],['','PATCH',{name:'no'}],['/members/alice','DELETE'],['/members/alice','PATCH',{role:'manager'}],['/leave','POST',{}]
  ])assert.equal((await call(user,`/api/conversations/${id}${path}`,method,body)).status,404,`${user} ${method} ${path}`);
  const state=await call(user,'/api/state');assert.equal(state.status,200);assert.doesNotMatch(JSON.stringify(state.data),/private invitation-era/);
 }
 const adminInbox=await call('owner','/api/conversations');assert.deepEqual(adminInbox.data,{conversations:[],invitations:[],nextCursor:null,nextInvitationCursor:null,unreadCount:0,invitationCount:0});
 await accept('bob',id);const read=await call('bob',`/api/conversations/${id}/messages`);assert.equal(read.status,200);assert.equal(read.data.messages[0].body,'A private invitation-era message');
 assert.equal((await send('bob',id,'Reply from the other session')).status,201);assert.equal((await call('alice',`/api/conversations/${id}/messages`)).data.messages.length,2);
 assert.equal((await call('alice',`/api/conversations/${id}`)).headers.get('Cache-Control'),'no-store');
});

test('eligible recipients are verified adult registered accounts, never dependents or ancestors',async()=>{
 const {call}=setup();
 const directory=await call('alice','/api/conversations/recipients');assert.equal(directory.status,200);assert.deepEqual(directory.data.members.map(m=>m.id),['bob','carol','dave','owner']);
 assert.deepEqual((await call('alice','/api/conversations/recipients?q=bo')).data.members.map(m=>m.id),['bob']);
 for(const id of ['child','ancestor','pending','unverified','incomplete','minor','unknown','alice']){
  const result=await call('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:[id]});assert.equal(result.status,400,id);
 }
 for(const user of ['pending','unverified','incomplete','minor']){
  assert.equal((await call(user,'/api/conversations')).status,403,user);
  assert.equal((await call(user,'/api/conversations/recipients')).status,403,user);
 }
 assert.equal((await call(null,'/api/conversations')).status,401);
 assert.equal((await call('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['bob']},{Origin:'https://evil.example'})).status,403);
});

test('direct pairs and request IDs are idempotent without restoring declined or left access',async()=>{
 const {call,sqlite,accept,send}=setup(),createBody={requestId:crypto.randomUUID(),type:'direct',memberIds:['bob']};
 const first=await call('alice','/api/conversations','POST',createBody);assert.equal(first.status,201);const id=first.data.id;
 const replay=await call('alice','/api/conversations','POST',createBody);assert.equal(replay.status,200);assert.equal(replay.data.id,id);
 assert.equal((await call('alice','/api/conversations','POST',{...createBody,memberIds:['carol']})).status,409);
 assert.equal((await call('alice','/api/conversations','POST',{...createBody,requestId:crypto.randomUUID()})).data.id,id);
 assert.equal((await call('bob','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['alice']})).status,409);
 assert.equal((await call('bob',`/api/conversations/${id}/invitation`,'POST',{action:'decline'})).status,200);
 assert.equal((await call('alice','/api/conversations','POST',{...createBody,requestId:crypto.randomUUID()})).data.id,id);
 assert.equal(sqlite.prepare('SELECT status FROM conversation_members WHERE conversation_id=? AND member_id=?').get(id,'bob').status,'declined');
 assert.equal((await call('bob',`/api/conversations/${id}/invitation`,'POST',{action:'accept'})).status,404);
 assert.equal((await call('bob',`/api/conversations/${id}/messages`)).status,404);
 // New direct invitation after both sides have closed is explicit, never automatic re-entry.
 assert.equal((await call('alice',`/api/conversations/${id}/leave`,'POST',{})).status,200);
 const second=await call('alice','/api/conversations','POST',{...createBody,requestId:crypto.randomUUID()});assert.equal(second.status,201);assert.notEqual(second.data.id,id);await accept('bob',second.data.id);
 const mid=crypto.randomUUID(),sent=await send('alice',second.data.id,'Exactly once',mid),resent=await send('alice',second.data.id,'Exactly once',mid);
 assert.equal(sent.status,201);assert.equal(resent.data.message.id,sent.data.message.id);assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,1);
 assert.equal((await send('alice',second.data.id,'Different payload',mid)).status,409);
 assert.equal((await call('bob','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['alice']})).data.id,second.data.id);
 assert.equal((await call('bob',`/api/conversations/${second.data.id}/leave`,'POST',{})).status,200);
 assert.equal((await call('bob',`/api/conversations/${second.data.id}/messages`)).status,404);
 assert.equal((await call('bob','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['alice']})).status,409);
});

test('group managers have explicit bounded powers; removal and reinvitation require renewed consent',async()=>{
 const {call,create,accept,send,sqlite}=setup(),id=await create('alice',['bob','carol'],'group','Private plans');await accept('bob',id);await accept('carol',id);
 assert.equal((await call('bob',`/api/conversations/${id}`,'PATCH',{name:'Hijack'})).status,403);
 assert.equal((await call('bob',`/api/conversations/${id}/members`,'POST',{memberIds:['owner']})).status,403);
 assert.equal((await call('alice',`/api/conversations/${id}/members/bob`,'PATCH',{role:'manager'})).status,200);
 assert.equal((await call('bob',`/api/conversations/${id}`,'PATCH',{name:'Updated plans'})).status,200);
 assert.equal((await call('bob',`/api/conversations/${id}/members`,'POST',{memberIds:['dave']})).status,200);assert.equal((await call('dave',`/api/conversations/${id}/messages`)).status,404);
 assert.equal((await call('bob',`/api/conversations/${id}`,'PATCH',{ownerId:'bob'})).status,403);
 assert.equal((await call('bob',`/api/conversations/${id}/members/carol`,'PATCH',{role:'manager'})).status,403);
 assert.equal((await call('bob',`/api/conversations/${id}/members/alice`,'DELETE')).status,403);
 assert.equal((await call('alice',`/api/conversations/${id}/members/carol`,'PATCH',{role:'manager'})).status,200);
 assert.equal((await call('bob',`/api/conversations/${id}/members/carol`,'DELETE')).status,404);
 await send('alice',id,'Group secret');
 assert.equal((await call('carol',`/api/conversations/${id}/typing`,'POST',{typing:true})).status,200);
 assert.equal((await call('alice',`/api/conversations/${id}/members/carol`,'DELETE')).status,200);
 for(const path of ['', '/messages','/typing'])assert.equal((await call('carol',`/api/conversations/${id}${path}`)).status,404,path);
 assert.equal((await send('carol',id,'No longer allowed')).status,404);
 assert.equal((await call('carol',`/api/conversations/${id}/read`,'POST',{sequence:1})).status,404);
 assert.equal((await call('carol','/api/conversations')).data.conversations.length,0);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM typing_presence WHERE member_id='carol'").get().n,0);
 assert.equal((await call('bob',`/api/conversations/${id}/members`,'POST',{memberIds:['carol']})).status,200);
 assert.equal((await call('carol',`/api/conversations/${id}/messages`)).status,404);
 await accept('carol',id);assert.equal((await call('carol',`/api/conversations/${id}`)).data.conversation.myRole,'member');
 assert.equal((await call('alice',`/api/conversations/${id}/leave`,'POST',{})).status,409);
 assert.equal((await call('alice',`/api/conversations/${id}`,'PATCH',{ownerId:'dave'})).status,400);
 assert.equal((await call('alice',`/api/conversations/${id}`,'PATCH',{ownerId:'bob'})).status,200);
 assert.equal((await call('alice',`/api/conversations/${id}/leave`,'POST',{})).status,200);
 assert.equal((await call('alice',`/api/conversations/${id}`)).status,404);
 assert.equal((await call('bob',`/api/conversations/${id}`)).data.conversation.myRole,'owner');
});

test('message order and cursor pagination are stable; read cursors never move backwards or cross chats',async()=>{
 const {call,create,accept,send,sqlite}=setup(),id=await create('alice');await accept('bob',id);
 for(let i=1;i<=5;i++)assert.equal((await send('alice',id,'Message '+i)).data.message.sequence,i);
 sqlite.prepare('UPDATE messages SET created_at=?').run('2026-01-01T00:00:00.000Z');
 const page=async query=>(await call('bob',`/api/conversations/${id}/messages${query}`)).data;
 const latest=await page('?limit=2');assert.deepEqual(latest.messages.map(m=>m.sequence),[4,5]);assert.equal(latest.hasMore,true);assert.equal(latest.nextBefore,4);
 const older=await page('?limit=2&before=4');assert.deepEqual(older.messages.map(m=>m.sequence),[2,3]);assert.equal(older.nextBefore,2);
 const oldest=await page('?limit=2&before=2');assert.deepEqual(oldest.messages.map(m=>m.sequence),[1]);assert.equal(oldest.hasMore,false);
 assert.deepEqual((await page('?limit=2&after=0')).messages.map(m=>m.sequence),[1,2]);
 assert.deepEqual((await page('?after=3')).messages.map(m=>m.sequence),[4,5]);
 assert.equal((await call('bob',`/api/conversations/${id}`)).data.conversation.unreadCount,5);
 assert.equal((await call('bob',`/api/conversations/${id}/read`,'POST',{sequence:4})).data.readSequence,4);
 assert.equal((await call('bob',`/api/conversations/${id}/read`,'POST',{sequence:2})).data.readSequence,4);
 assert.equal((await call('bob',`/api/conversations/${id}`)).data.conversation.unreadCount,1);
 assert.equal((await call('alice',`/api/conversations/${id}`)).data.conversation.unreadCount,0);
 assert.equal((await call('bob',`/api/conversations/${id}/read`,'POST',{sequence:6})).status,400);
 for(const query of ['?limit=0','?limit=101','?limit=1.5','?before=no','?after=-1','?before=2&after=1','?after=9007199254740992'])assert.equal((await call('bob',`/api/conversations/${id}/messages${query}`)).status,400,query);
 const other=await create('alice',['carol']);await accept('carol',other);assert.equal((await call('alice',`/api/conversations/${other}/read`,'POST',{sequence:1})).status,400);
 const key=crypto.randomUUID();await send('alice',id,'One scope',key);assert.equal((await send('alice',other,'One scope',key)).status,409);
});

test('typing is text-free, expiring, participant-only, and cleared by sending, stopping, or removal',async()=>{
 const {call,create,accept,send,sqlite}=setup(),id=await create('alice');await accept('bob',id);
 const put=await call('alice',`/api/conversations/${id}/typing`,'POST',{typing:true});assert.equal(put.status,200);assert.equal(put.data.ttlMs,8000);assert.deepEqual(put.data.typing,[]);
 const seen=await call('bob',`/api/conversations/${id}/typing`);assert.equal(seen.data.typing[0].memberId,'alice');assert.ok(seen.data.typing[0].expiresAt<=seen.data.serverNow+8000);assert.deepEqual(Object.keys(seen.data.typing[0]).sort(),['expiresAt','memberId','name']);
 assert.equal((await call('owner',`/api/conversations/${id}/typing`)).status,404);
 assert.equal((await call('alice',`/api/conversations/${id}/typing`,'POST',{typing:true,text:'Do not persist'})).status,400);
 sqlite.prepare('UPDATE typing_presence SET expires_at=?').run(Date.now()-1);assert.deepEqual((await call('bob',`/api/conversations/${id}/typing`)).data.typing,[]);
 await call('alice',`/api/conversations/${id}/typing`,'POST',{typing:true});await call('alice',`/api/conversations/${id}/typing`,'POST',{typing:false});assert.deepEqual((await call('bob',`/api/conversations/${id}/typing`)).data.typing,[]);
 await call('alice',`/api/conversations/${id}/typing`,'POST',{typing:true});await send('alice',id,'Sent');assert.deepEqual((await call('bob',`/api/conversations/${id}/typing`)).data.typing,[]);
});

test('comment typing follows accessible post scopes and immediately filters revoked writers',async()=>{
 const {call,sqlite}=setup();
 assert.equal((await call('alice','/api/posts/public-post/typing','POST',{typing:true})).status,200);
 assert.equal((await call('bob','/api/posts/public-post/typing')).data.typing[0].memberId,'alice');
 assert.equal((await call('bob','/api/posts/private-post/typing')).status,404);
 assert.equal((await call('owner','/api/posts/private-post/typing','POST',{typing:true})).status,404);
 assert.equal((await call('alice','/api/posts/private-post/typing','POST',{typing:true,body:'No drafts'})).status,400);
 assert.equal((await call('alice','/api/posts/private-post/typing','POST',{typing:true})).status,200);
 sqlite.exec("INSERT INTO family_group_members(group_id,member_id) VALUES('private-group','bob');");
 assert.equal((await call('bob','/api/posts/private-post/typing')).data.typing[0].memberId,'alice');
 sqlite.exec("DELETE FROM family_group_members WHERE group_id='private-group' AND member_id='alice'");
 assert.equal((await call('alice','/api/posts/private-post/typing')).status,404);assert.deepEqual((await call('bob','/api/posts/private-post/typing')).data.typing,[]);
 sqlite.exec("UPDATE posts SET deleted_at=CURRENT_TIMESTAMP WHERE id='private-post'");assert.equal((await call('bob','/api/posts/private-post/typing')).status,404);
 // A minor's existing public-comment scope is unchanged; private messaging stays adult-only.
 assert.equal((await call('minor','/api/posts/public-post/typing','POST',{typing:true})).status,200);
});

test('active account and verified adult eligibility are rechecked on every request',async()=>{
 const {call,create,accept,send,sqlite}=setup(),id=await create('alice');await accept('bob',id);await send('alice',id,'Stay private');
 await call('bob',`/api/conversations/${id}/typing`,'POST',{typing:true});
 sqlite.exec("UPDATE members SET status='suspended' WHERE id='bob'");
 assert.equal((await call('bob',`/api/conversations/${id}/messages`)).status,403);assert.equal((await send('bob',id,'blocked')).status,403);assert.deepEqual((await call('alice',`/api/conversations/${id}/typing`)).data.typing,[]);
 sqlite.exec("UPDATE members SET status='active' WHERE id='bob';UPDATE user SET emailVerified=0 WHERE id='bob'");
 assert.equal((await call('bob',`/api/conversations/${id}/messages`)).status,404);
 sqlite.exec("UPDATE user SET emailVerified=1 WHERE id='bob';UPDATE profiles SET birthday='2020-01-01' WHERE member_id='bob'");
 assert.equal((await call('bob',`/api/conversations/${id}/messages`)).status,404);
 assert.equal((await call('bob','/api/conversations')).status,403);
});

test('strict text-only payloads reject uploads and malformed input without side effects',async()=>{
 const {call,create,sqlite}=setup(),id=await create('alice');
 for(const body of [null,[],{body:'',requestId:crypto.randomUUID()},{body:'a'.repeat(4001),requestId:crypto.randomUUID()},{body:'ok'},{body:'ok',requestId:'x'},{body:'ok',requestId:crypto.randomUUID(),files:[]},{body:'ok',requestId:crypto.randomUUID(),attachments:[{id:'private-media'}]},{body:'ok',requestId:crypto.randomUUID(),authorId:'owner'}])assert.equal((await call('alice',`/api/conversations/${id}/messages`,'POST',body)).status,400,JSON.stringify(body)?.slice(0,100));
 assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,0);
 assert.equal((await call('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'group',memberIds:['bob'],name:'Group',files:[]})).status,400);
 assert.equal((await call('alice',`/api/conversations/${id}/members`,'POST',{memberIds:['carol']})).status,403);
 assert.equal((await call('alice',`/api/conversations/${id}`,'PATCH',{name:'A direct alias'})).status,403);
});

test('additive migration preserves legacy chat history and gives it stable ordering',()=>{
 const sqlite=new DatabaseSync(':memory:');
 const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>f<'0010_messaging.sql'))sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 seed(sqlite);sqlite.exec("INSERT INTO conversations(id) VALUES('legacy');INSERT INTO conversation_members(conversation_id,member_id) VALUES('legacy','alice'),('legacy','bob');INSERT INTO messages(id,conversation_id,author_id,body,created_at) VALUES('z','legacy','bob','Second','2026-01-01'),('a','legacy','alice','First','2026-01-01');");
 sqlite.exec(readFileSync(new URL('../migrations/0010_messaging.sql',import.meta.url),'utf8'));
 assert.deepEqual(sqlite.prepare('SELECT body FROM messages ORDER BY sequence').all().map(m=>m.body),['First','Second']);
 assert.deepEqual(sqlite.prepare('SELECT status FROM conversation_members').all().map(m=>m.status),['active','active']);
 assert.equal(sqlite.prepare('SELECT owner_id FROM conversations').get().owner_id,'alice');sqlite.close();
});

function beforeStatement(DB,match,run){
 const original=DB.prepare;let used=false;
 DB.prepare=sql=>{if(!used&&match(sql)){used=true;run()}return original(sql)};
 return ()=>{DB.prepare=original;assert.equal(used,true,'race hook executed')};
}

test('concurrent idempotent create/send requests commit one resource and one message',async()=>{
 const {call,DB,sqlite,accept,send}=setup();
 // D1 batches execute atomically. Serialize test-helper batches to model that
 // guarantee rather than opening nested transactions on one SQLite connection.
 const batch=DB.batch.bind(DB);let pending=Promise.resolve();
 DB.batch=statements=>{const result=pending.then(()=>batch(statements));pending=result.catch(()=>{});return result};
 const body={requestId:crypto.randomUUID(),type:'group',memberIds:['bob'],name:'Race-safe'};
 const [a,b]=await Promise.all([call('alice','/api/conversations','POST',body),call('alice','/api/conversations','POST',body)]);
 assert.ok([200,201].includes(a.status));assert.ok([200,201].includes(b.status));assert.ok([a.status,b.status].includes(201));assert.equal(a.data.id,b.data.id);assert.equal(sqlite.prepare('SELECT count(*) n FROM conversations').get().n,1);
 await accept('bob',a.data.id);const key=crypto.randomUUID();
 const sent=await Promise.all([send('alice',a.data.id,'Only once under overlap',key),send('alice',a.data.id,'Only once under overlap',key)]);
 assert.equal(sent[0].status,201);assert.equal(sent[1].status,201);assert.equal(sent[0].data.message.id,sent[1].data.message.id);assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,1);
 const conflictKey=crypto.randomUUID(),conflict=await Promise.all([send('alice',a.data.id,'Winner A',conflictKey),send('alice',a.data.id,'Winner B',conflictKey)]);
 assert.deepEqual(conflict.map(r=>r.status).sort(),[201,409]);assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,2);
});

test('write-time guards prevent stale-owner removal and owner transfer to a departed member',async()=>{
 const {call,create,accept,DB,sqlite}=setup(),id=await create('alice',['bob','carol'],'group','Changing ownership');await accept('bob',id);await accept('carol',id);
 await call('alice',`/api/conversations/${id}/members/bob`,'PATCH',{role:'manager'});
 let restore=beforeStatement(DB,sql=>sql.startsWith("UPDATE conversation_members SET status='removed'"),()=>sqlite.prepare('UPDATE conversations SET owner_id=? WHERE id=?').run('bob',id));
 assert.equal((await call('alice',`/api/conversations/${id}/members/bob`,'DELETE')).status,404);restore();
 assert.equal(sqlite.prepare('SELECT status FROM conversation_members WHERE conversation_id=? AND member_id=?').get(id,'bob').status,'active');
 restore=beforeStatement(DB,sql=>sql.startsWith('UPDATE conversations SET name='),()=>sqlite.prepare("UPDATE conversation_members SET status='left' WHERE conversation_id=? AND member_id='carol'").run(id));
 assert.equal((await call('bob',`/api/conversations/${id}`,'PATCH',{ownerId:'carol'})).status,404);restore();assert.equal(sqlite.prepare('SELECT owner_id FROM conversations WHERE id=?').get(id).owner_id,'bob');
});

test('last-owner leave cannot archive a group if an invitation is accepted during the request',async()=>{
 const {call,create,DB,sqlite}=setup(),id=await create('alice',['bob'],'group','Accepted during leave');
 const restore=beforeStatement(DB,sql=>sql.startsWith('UPDATE conversations SET owner_id=CASE'),()=>sqlite.prepare("UPDATE conversation_members SET status='active' WHERE conversation_id=? AND member_id='bob'").run(id));
 assert.equal((await call('alice',`/api/conversations/${id}/leave`,'POST',{})).status,409);restore();
 const row=sqlite.prepare('SELECT archived_at,owner_id FROM conversations WHERE id=?').get(id);assert.equal(row.archived_at,null);assert.equal(row.owner_id,'alice');assert.equal(sqlite.prepare("SELECT status FROM conversation_members WHERE conversation_id=? AND member_id='alice'").get(id).status,'active');
});

test('recipient/account revocation during creation or send cannot leave unauthorized resources',async()=>{
 const {call,create,accept,send,DB,sqlite}=setup();
 let restore=beforeStatement(DB,sql=>sql.startsWith('INSERT OR IGNORE INTO messaging_requests'),()=>sqlite.exec("UPDATE members SET status='suspended' WHERE id='bob'"));
 assert.equal((await call('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['bob']})).status,409);restore();assert.equal(sqlite.prepare('SELECT count(*) n FROM conversations').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM messaging_requests').get().n,0);
 sqlite.exec("UPDATE members SET status='active' WHERE id='bob'");const id=await create('alice');await accept('bob',id);
 restore=beforeStatement(DB,sql=>sql.startsWith('INSERT OR IGNORE INTO messaging_requests'),()=>sqlite.exec("UPDATE members SET status='suspended' WHERE id='alice'"));
 assert.equal((await send('alice',id,'Revoked during send')).status,404);restore();assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,0);
});

test('closed directs reject new sends but preserve receipt replay and pending-invitation delivery',async()=>{
 const {call,create,accept,send,sqlite,DB}=setup(),id=await create('alice');
 const firstKey=crypto.randomUUID(),first=await send('alice',id,'Sent while the invitation was pending',firstKey);assert.equal(first.status,201);
 assert.equal((await call('bob',`/api/conversations/${id}/invitation`,'POST',{action:'decline'})).status,200);
 assert.equal((await send('alice',id,'Do not send after decline')).status,409);
 const replay=await send('alice',id,'Sent while the invitation was pending',firstKey);assert.equal(replay.status,201);assert.equal(replay.data.message.id,first.data.message.id);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,1);
 await call('alice',`/api/conversations/${id}/leave`,'POST',{});
 const accepted=await create('alice');await accept('bob',accepted);const acceptedKey=crypto.randomUUID(),prior=await send('alice',accepted,'Before departure',acceptedKey);
 await call('bob',`/api/conversations/${accepted}/leave`,'POST',{});assert.equal((await send('alice',accepted,'Do not send after departure')).status,409);
 assert.equal((await send('alice',accepted,'Before departure',acceptedKey)).data.message.id,prior.data.message.id);
 const racing=await create('alice',['carol']);
 const restore=beforeStatement(DB,sql=>sql.startsWith('INSERT OR IGNORE INTO messaging_requests'),()=>sqlite.prepare("UPDATE conversation_members SET status='declined' WHERE conversation_id=? AND member_id='carol'").run(racing));
 const raceKey=crypto.randomUUID();assert.equal((await send('alice',racing,'Declined during submission',raceKey)).status,409);restore();
 assert.equal(sqlite.prepare('SELECT count(*) n FROM messages WHERE conversation_id=?').get(racing).n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM messaging_requests WHERE request_id=?').get(raceKey).n,0);
});

test('a text-only message containing a media URL never grants access to private R2 content',async()=>{
 const {call,create,accept,send,sqlite}=setup();
 sqlite.exec("INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES('chat-private-media','alice','private/alice/chat-photo','Private photo','image/jpeg',10)");
 const id=await create('alice',['bob'],'group','Media isolation');await accept('bob',id);
 assert.equal((await send('alice',id,'This is only text: /api/media/chat-private-media')).status,201);
 assert.match((await call('bob',`/api/conversations/${id}/messages`)).data.messages[0].body,/\/api\/media\/chat-private-media/);
 // R2 is deliberately absent: authorization must reject before attempting a fetch.
 for(const user of ['bob','carol','owner'])assert.equal((await call(user,'/api/media/chat-private-media')).status,404,user);
 assert.equal((await call('alice',`/api/conversations/${id}/members/bob`,'DELETE')).status,200);
 assert.equal((await call('bob',`/api/conversations/${id}/messages`)).status,404);
 assert.equal((await call('bob','/api/media/chat-private-media')).status,404);
});

test('inbox sections use bounded independent keyset pages and full authorized totals',async()=>{
 const {call,create,accept,send,sqlite,DB}=setup(),ids=[];
 for(let index=0;index<4;index++){
  const id=await create('alice',['bob'],'group','Paged group '+index);ids.push(id);await accept('bob',id);await send('bob',id,'Unread message '+index);
  sqlite.prepare('UPDATE messages SET created_at=? WHERE conversation_id=?').run(index<2?'2026-01-01T00:00:00.000Z':'2026-01-02T00:00:00.000Z',id);
 }
 const inviteIds=[];for(let index=0;index<3;index++){const id=await create('bob',['alice'],'group','Invitation '+index);inviteIds.push(id);sqlite.prepare("UPDATE conversation_members SET invited_at=? WHERE conversation_id=? AND member_id='alice'").run('2026-01-03T00:00:00.000Z',id)}
 const expected=sqlite.prepare('SELECT c.id FROM conversations c JOIN messages ms ON ms.conversation_id=c.id ORDER BY ms.created_at DESC,c.id DESC').all().map(r=>r.id),expectedInvites=[...inviteIds].sort().reverse();
 let detailReads=0,totalReads=0;const original=DB.prepare;DB.prepare=sql=>{totalReads++;if(sql.startsWith('SELECT c.*,cm.role,cm.read_sequence FROM'))detailReads++;return original(sql)};
 const first=await call('alice','/api/conversations?limit=2&invitationLimit=1');DB.prepare=original;
 assert.equal(first.status,200);assert.equal(detailReads,0,'inbox does not issue a detail request per row');assert.ok(totalReads<=10,'inbox adds only two bounded reads for private attachments and final access recheck: '+totalReads);assert.deepEqual(first.data.conversations.map(c=>c.id),expected.slice(0,2));assert.deepEqual(first.data.invitations.map(c=>c.id),expectedInvites.slice(0,1));assert.equal(first.data.unreadCount,4);assert.equal(first.data.invitationCount,3);assert.ok(first.data.nextCursor);assert.ok(first.data.nextInvitationCursor);
 const second=await call('alice','/api/conversations?limit=2&invitationLimit=1&cursor='+first.data.nextCursor+'&invitationCursor='+first.data.nextInvitationCursor);
 assert.equal(second.status,200);assert.deepEqual(second.data.conversations.map(c=>c.id),expected.slice(2));assert.deepEqual(second.data.invitations.map(c=>c.id),expectedInvites.slice(1,2));assert.equal(second.data.nextCursor,null);assert.equal(second.data.unreadCount,4);assert.equal(second.data.invitationCount,3);
 const third=await call('alice','/api/conversations?limit=2&invitationLimit=1&invitationCursor='+second.data.nextInvitationCursor);assert.deepEqual(third.data.conversations.map(c=>c.id),expected.slice(0,2));assert.deepEqual(third.data.invitations.map(c=>c.id),expectedInvites.slice(2));assert.equal(third.data.nextInvitationCursor,null);
 await call('alice',`/api/conversations/${ids[0]}/read`,'POST',{sequence:1});assert.equal((await call('alice','/api/conversations?limit=1&invitationLimit=1')).data.unreadCount,3);
 assert.equal((await call('owner','/api/conversations?limit=1&invitationLimit=1')).data.unreadCount,0);assert.equal((await call('owner','/api/conversations?limit=1&invitationLimit=1')).data.invitationCount,0);
 const decoded=JSON.parse(Buffer.from(first.data.nextCursor,'base64url').toString('utf8'));assert.deepEqual(Object.keys(decoded).sort(),['at','id','kind','v']);assert.doesNotMatch(JSON.stringify(decoded),/Unread message|Paged group/);
});

test('inbox rejects malformed cursors, swapped section cursors, and overbound page sizes',async()=>{
 const {call,create}=setup();
 await create('alice',['bob'],'group','First');await create('alice',['bob'],'group','Second');
 const first=await call('alice','/api/conversations?limit=1');assert.ok(first.data.nextCursor);
 const bad=btoa(JSON.stringify({v:1,kind:'conversation',at:'2026-01-01T00:00:00.000Z',id:'x',body:'Must reject'}));
 for(const query of ['limit=0','limit=101','limit=-1','limit=1.2','limit=NaN','limit=','limit=01','invitationLimit=0','invitationLimit=101','cursor=','cursor=invalid','cursor='+('a'.repeat(801)),'cursor='+encodeURIComponent(bad),'invitationCursor='+first.data.nextCursor])assert.equal((await call('alice','/api/conversations?'+query)).status,400,query.slice(0,100));
 assert.equal((await call('alice','/api/conversations?limit=100&invitationLimit=100')).status,200);
});

test('large inboxes, historical member lists, and public typing responses stay bounded',async()=>{
 const {call,create,accept,sqlite,DB}=setup(),id=await create('alice',['bob'],'group','Bounded history');await accept('bob',id);
 const user=sqlite.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)'),member=sqlite.prepare("INSERT INTO members(id,status) VALUES(?,'active')"),past=sqlite.prepare("INSERT INTO conversation_members(conversation_id,member_id,status) VALUES(?,?,'removed')"),presence=sqlite.prepare("INSERT INTO typing_presence(scope_kind,scope_id,member_id,expires_at) VALUES('post','public-post',?,?)");
 for(let i=0;i<105;i++){const memberId='past-'+String(i).padStart(3,'0');user.run(memberId,'Former '+i,memberId+'@example.test');member.run(memberId);past.run(id,memberId);presence.run(memberId,Date.now()+8000)}
 const detail=await call('alice',`/api/conversations/${id}`);assert.equal(detail.data.conversation.members.length,100);assert.deepEqual(detail.data.conversation.members.slice(0,2).map(m=>m.memberId),['alice','bob']);
 assert.equal((await call('alice','/api/conversations')).data.conversations[0].members.length,100);
 assert.equal((await call('alice','/api/posts/public-post/typing')).data.typing.length,50);
 const conv=sqlite.prepare("INSERT INTO conversations(id,type,name,owner_id,created_at) VALUES(?,'group',?,?,?)"),own=sqlite.prepare("INSERT INTO conversation_members(conversation_id,member_id,status,invited_by,invited_at) VALUES(?,?,?,?,?)");
 for(let i=0;i<101;i++){
  const activeId='page-active-'+String(i).padStart(3,'0'),inviteId='page-invite-'+String(i).padStart(3,'0'),stamp='2026-01-01T00:00:00.000Z';
  conv.run(activeId,'Active '+i,'alice',stamp);own.run(activeId,'alice','active',null,null);
  conv.run(inviteId,'Invited '+i,'bob',stamp);own.run(inviteId,'bob','active',null,null);own.run(inviteId,'alice','pending','bob',stamp);
 }
 let requests=0;const original=DB.prepare;DB.prepare=sql=>{requests++;return original(sql)};
 const first=await call('alice','/api/conversations');DB.prepare=original;
 assert.equal(first.status,200);assert.equal(first.data.conversations.length,50);assert.equal(first.data.invitations.length,50);assert.equal(first.data.invitationCount,101);assert.ok(first.data.nextCursor);assert.ok(first.data.nextInvitationCursor);assert.ok(requests<=8,'page size does not grow database round trips');
 const max=await call('alice','/api/conversations?limit=100&invitationLimit=100');assert.equal(max.status,200);assert.equal(max.data.conversations.length,100);assert.equal(max.data.invitations.length,100);assert.equal(max.data.invitationCount,101);assert.ok(max.data.nextCursor);assert.ok(max.data.nextInvitationCursor);
});
