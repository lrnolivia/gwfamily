import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import worker,{createApp} from '../src/worker.mjs';
import {queueNotificationDrains,notificationMutation} from '../src/notification-dispatch.mjs';
import {registerDevice,drainWithInjectedSender} from '../src/push-store.mjs';
const origin='https://fixture.example.test';
// Lauren's defaults (0028) leave email/push off for Following, Tags, Replies and
// Conversations. These suites test delivery, so the fictional member opts in.
const OPT_IN_CHANNELS="INSERT INTO notification_settings(member_id,channels_json,write_token) VALUES('bob',json('{\"following\":{\"email\":true,\"push\":true},\"mentions\":{\"email\":true,\"push\":true},\"replies\":{\"email\":true},\"messages\":{\"email\":true}}'),'channels:fixture-opt-in')";
function setup({switchAccount=false,providerFailure=false}={}){
 const x=database();seed(x.sqlite);x.sqlite.exec("DELETE FROM notifications;DELETE FROM notification_events;UPDATE email_notification_control SET enabled=1;INSERT INTO email_notification_preferences(member_id,enabled,updated_at) VALUES('bob',1,0)");x.sqlite.exec(OPT_IN_CHANNELS);
 const sent=[],work=[];let calls=0;
 const env={DB:x.DB,BETTER_AUTH_SECRET:'fictional-only',AUTH_ORIGIN:origin,AUTH_EMAIL_ENABLED:'true',EMAIL_SCHEMA_VERSION:'1',EMAIL:{send:async m=>{sent.push(m);if(providerFailure)throw Error('Fictional failure');return {messageId:'fictional-accepted'}}}};
 const app=createApp(()=>({api:{getSession:async({headers})=>{const id=headers.get('x-fixture-user');calls++;return id?{user:{id:switchAccount&&calls>1?'alice':id,emailVerified:id!=='unverified'},session:{id:'fictional-session'}}:null}}}));
 const call=(path='/api/posts',method='POST',body={body:'Fictional post'},user='owner',extra={})=>app.request(origin+path,{method,headers:{Origin:origin,'x-fixture-user':user,'Content-Type':'application/json',...extra},...(['GET','HEAD'].includes(method)||body===undefined?{}:{body:JSON.stringify(body)})},env,{waitUntil:p=>work.push(p)});
 return {...x,env,call,sent,work,flush:()=>Promise.all(work)};
}
const validPush={PUSH_ENABLED:'true',PUSH_SCHEMA_VERSION:'1',PUSH_SUBJECT:'mailto:fictional@example.test',PUSH_KEY_VERSION:'fixture',PUSH_VAPID_PRIVATE_KEY:Buffer.alloc(32).toString('base64url'),PUSH_VAPID_PUBLIC_KEY:Buffer.from([4,...Array(64).fill(0)]).toString('base64url')};

test('successful committed mutations dispatch in the existing context without changing response or replaying idempotent events',async()=>{
 const x=setup();try{
  const input={type:'ADD_POST',requestId:'fixture-idempotent-post',post:{text:'Fictional announcement',asLeader:true}};
  const first=await x.call('/api/commands','POST',input);assert.equal(first.status,200);const result=await first.json();assert.ok(x.sqlite.prepare('SELECT id FROM posts WHERE id=?').get(result.id));assert.equal(x.work.length,1);await x.flush();assert.equal(x.sent.length,1);
  const replay=await x.call('/api/commands','POST',input);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),result);await x.flush();assert.equal(x.sent.length,1);
 }finally{x.sqlite.close()}
});

test('rejected auth, origin, member view, malformed and invalid mutations never queue drains',async()=>{
 for(const [user,body,headers,status] of [['',{body:'x'},{},401],['pending',{body:'x'},{},403],['unverified',{body:'x'},{},403],['owner',{body:'x'},{Origin:'https://evil.example.test'},403],['owner',{body:'x'},{'X-GW-Member-View':'true','X-GW-Member-View-Account':'owner'},403],['owner',{}, {},400]]){
  const x=setup();try{const response=await x.call('/api/posts','POST',body,user,headers);assert.equal(response.status,status);assert.equal(x.work.length,0);assert.equal(x.sent.length,0)}finally{x.sqlite.close()}
 }
});

test('GET, preferences, notification read actions, and non-notifying commands remain inert',async()=>{
 const x=setup();try{
  assert.equal((await x.call('/api/me','GET',undefined)).status,200);
  assert.equal((await x.call('/api/commands','POST',{type:'SET_NOTIFICATION_SCOPE',requestId:'fixture-settings-update',scope:'all'})).status,200);
  for(const [method,path,type] of [['GET','/api/posts'],['POST','/api/conversations/c/read'],['POST','/api/me/push/devices'],['PUT','/api/me/notifications'],['POST','/api/notifications/read-all'],['POST','/api/auth/sign-out'],['POST','/api/commands','SAVE_MEMBER']])assert.equal(await notificationMutation({req:{method,path,json:async()=>({type})}}),false,path);
  assert.equal(x.work.length,0);assert.equal(x.sent.length,0);
 }finally{x.sqlite.close()}
});

test('account switch suppresses dispatch without rewriting already committed success',async()=>{
 const x=setup({switchAccount:true});try{assert.equal((await x.call()).status,201);await x.flush();assert.equal(x.sent.length,0);assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'pending')}finally{x.sqlite.close()}
});

test('provider failure preserves successful HTTP result and established unknown-no-retry semantics',async()=>{
 const x=setup({providerFailure:true});try{const response=await x.call();assert.equal(response.status,201);await x.flush();assert.equal(x.sent.length,1);assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'unknown');queueNotificationDrains(x.env,{waitUntil:p=>x.work.push(p)});await x.flush();assert.equal(x.sent.length,1)}finally{x.sqlite.close()}
});

test('runtime Off and absent/failed execution context do not inspect DB or start transport',async()=>{
 let calls=0;const context={waitUntil(){calls++}},off={get DB(){throw Error('Off must not inspect storage')}};
 assert.equal(queueNotificationDrains(off,context),false);assert.equal(calls,0);
 const env={...validPush};const options={push:async()=>{calls++}};
 assert.equal(queueNotificationDrains(env,null,options),false);assert.equal(queueNotificationDrains(env,{waitUntil(){throw Error('Unavailable')}},options),false);await Promise.resolve();assert.equal(calls,0);
});

test('parallel bounded channels remain independent when one drain fails',async()=>{
 const work=[],seen=[];let unblock;const held=new Promise(r=>unblock=r);
 assert.equal(queueNotificationDrains({...validPush,EMAIL_SCHEMA_VERSION:'1',AUTH_EMAIL_ENABLED:'true',EMAIL:{send(){}}},{waitUntil:p=>work.push(p)},{max:1,push:async(_,options)=>{seen.push(['push',options]);await held;throw Error('Fictional storage error')},email:async(_,options)=>{seen.push(['email',options])}}),true);
 await new Promise(r=>setImmediate(r));assert.deepEqual(seen,[['push',{max:1}],['email',{max:1}]]);unblock();await assert.rejects(Promise.all(work),/Notification dispatch unavailable/);
});

test('post-commit request drains at most one email row, leaving backlog for cron',async()=>{
 const x=setup();try{x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('older','owner','Fictional prior post')");assert.equal((await x.call()).status,201);await x.flush();assert.equal(x.sent.length,1);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM email_notification_outbox WHERE state='pending'").get().n,1)}finally{x.sqlite.close()}
});

test('hourly and minute scheduled events drain existing queues with D1 alias and unchanged maintenance',async()=>{
 for(const cron of ['0 * * * *','* * * * *']){const x=setup();try{x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('scheduled','owner','Fictional scheduled backlog')");const env={...x.env,D1:x.DB};delete env.DB;worker.scheduled({cron,scheduledTime:Date.now()},env,{waitUntil:p=>x.work.push(p)});assert.equal(x.work.length,cron==='* * * * *'?1:2);await x.flush();assert.equal(x.sent.length,1)}finally{x.sqlite.close()}}
});

test('overlapping push hints retain atomic single-claim delivery and current session/consent checks',async()=>{
 for(const revoke of [false,true]){const x=setup();try{
  x.sqlite.exec("UPDATE push_control SET enabled=1;INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('bob-session',9999999999999,'fictional',0,0,'bob')");
  await registerDevice(x.DB,{id:'bob'},'bob-session','bob',{endpoint:'https://web.push.apple.com/fictional-dispatch-test',keys:{p256dh:validPush.PUSH_VAPID_PUBLIC_KEY,auth:Buffer.alloc(16).toString('base64url')}},'fixture');
  x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('push-hint','owner','Fictional push')");if(revoke)x.sqlite.exec("DELETE FROM session WHERE id='bob-session'");
  let sends=0;const push=env=>drainWithInjectedSender(env.DB,{sender:async()=>{sends++;return {status:201}},max:1});const env={...validPush,DB:x.DB};
  queueNotificationDrains(env,{waitUntil:p=>x.work.push(p)},{max:1,push});queueNotificationDrains(env,{waitUntil:p=>x.work.push(p)},{max:1,push});await x.flush();assert.equal(sends,revoke?0:1);
 }finally{x.sqlite.close()}}
});

test('failed database commit preserves failure response and cannot dispatch unrelated backlog',async()=>{
 const x=setup();try{
  x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('unrelated-backlog','owner','Fictional pending post')");
  x.DB.batch=async()=>{throw Error('Fictional transaction failure')};
  const response=await x.call();assert.equal(response.status,500);assert.equal((await response.json()).error,'Request could not be completed');assert.equal(x.work.length,0);assert.equal(x.sent.length,0);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM posts").get().n,1);
 }finally{x.sqlite.close()}
});

test('database channel Off keeps successful mutation inert even with runtime configured',async()=>{
 const x=setup();try{x.sqlite.exec('UPDATE email_notification_control SET enabled=0');assert.equal((await x.call()).status,201);await x.flush();assert.equal(x.sent.length,0);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM email_notification_outbox WHERE attempts>0").get().n,0)}finally{x.sqlite.close()}
});
