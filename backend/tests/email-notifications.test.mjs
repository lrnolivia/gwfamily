import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {claimEmail,drainEmailNotifications} from '../src/email-notifications.mjs';
import {emailRetry} from '../src/email-delivery-policy.mjs';
const appearance={preset:'green',theme:'light',headingFont:'sans'};
// Lauren's defaults (0028) leave email/push off for Following, Tags, Replies and
// Conversations. These suites test delivery, so the fictional member opts in.
const OPT_IN_CHANNELS="INSERT INTO notification_settings(member_id,channels_json,write_token) VALUES('bob',json('{\"following\":{\"email\":true,\"push\":true},\"mentions\":{\"email\":true,\"push\":true},\"replies\":{\"email\":true},\"messages\":{\"email\":true}}'),'channels:fixture-opt-in')";
function setup(){
 const x=database();seed(x.sqlite);x.sqlite.exec('DELETE FROM notifications; DELETE FROM notification_events');x.sqlite.exec(OPT_IN_CHANNELS);
 const env={DB:x.DB,BETTER_AUTH_SECRET:'fictional-only',AUTH_ORIGIN:'https://fictional.example.test',AUTH_EMAIL_ENABLED:'true',EMAIL_SCHEMA_VERSION:'1',EMAIL:{send(){throw Error('No external mail in tests')}}};
 const app=createApp(()=>({api:{getSession:async({headers})=>headers.get('x-fixture-user')?{user:{id:headers.get('x-fixture-user'),emailVerified:headers.get('x-fixture-user')!=='unverified'},session:{id:'fictional-session'}}:null}}));
 const call=(user='bob',method='GET',body,origin=env.AUTH_ORIGIN)=>app.request(env.AUTH_ORIGIN+'/api/me/notification-email',{method,headers:{Origin:origin,'x-fixture-user':user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env);
 return {...x,env,call};
}
const choice=(enabled=true,revision=0)=>({expectedAccountId:'bob',enabled,appearance,revision});
function notice(x,id='new-event'){
 x.sqlite.prepare(`INSERT INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,category,audience,direct_ids_json) VALUES(?,?,'membership.role_changed','owner','member','bob','membership','direct','["bob"]')`).run(id,id);
 return x.sqlite.prepare('SELECT * FROM email_notification_outbox').all();
}
async function optIn(x){assert.equal((await x.call('bob','PUT',choice())).status,200)}
test('email is default off; opt-in never backfills historic activity',async()=>{
 const x=setup();assert.equal((await(await x.call()).json()).enabled,false);assert.equal(notice(x,'old').length,0);
 await optIn(x);assert.equal(x.sqlite.prepare('SELECT count(*) n FROM email_notification_outbox').get().n,0);
 assert.equal(notice(x).length,1);assert.equal(notice(x,'newer').length,2);
 assert.equal(x.sqlite.prepare('SELECT count(*) n FROM email_notification_preferences WHERE enabled=1').get().n,1);
});
test('email routes enforce membership, origin, account and strict eight-preset DTO',async()=>{
 const x=setup();for(const [user,status] of [['',401],['pending',403],['unverified',403]])assert.equal((await x.call(user)).status,status);
 assert.equal((await x.call('bob','PUT',choice(), 'https://foreign.example.test')).status,403);
 assert.equal((await x.call('bob','PUT',{...choice(),expectedAccountId:'alice'})).status,409);
 for(const patch of [{appearance:{...appearance,preset:'#387b51'}},{appearance:{...appearance,accent:'#fff'}},{recipient:'alice@example.test'},{revision:-1},{enabled:'true'}])assert.equal((await x.call('bob','PUT',{...choice(),...patch})).status,400);
 await optIn(x);assert.equal((await(await x.call('alice')).json()).enabled,false);
 assert.equal((await x.call('bob','PUT',choice(false))).status,409);
});
test('per-write guard rejects a concurrent same-revision save without undoing winner',async()=>{
 const x=setup();await optIn(x);const batch=x.DB.batch;let intercepted=false;
 x.DB.batch=async statements=>{if(!intercepted){intercepted=true;x.sqlite.exec("UPDATE email_notification_preferences SET preset='blue',revision=2,write_token='other-write' WHERE member_id='bob'")}return batch(statements)};
 assert.equal((await x.call('bob','PUT',{...choice(false,1)})).status,409);
 const row=x.sqlite.prepare('SELECT * FROM email_notification_preferences').get();assert.equal(row.enabled,1);assert.equal(row.preset,'blue');assert.equal(row.revision,2);
 assert.equal(x.sqlite.prepare('SELECT count(*) n FROM notification_setting_guards').get().n,0);
});
test('schema gate performs no delivery queries and disabling stays available when provider is off',async()=>{
 const x=setup();await optIn(x);x.env.AUTH_EMAIL_ENABLED='false';assert.equal((await x.call('bob','PUT',choice(false,1))).status,200);
 x.env.EMAIL_SCHEMA_VERSION=undefined;const prepare=x.DB.prepare;let emailQueries=0;x.DB.prepare=sql=>{if(sql.includes('email_notification_'))emailQueries++;return prepare(sql)};
 assert.equal((await(await x.call()).json()).ready,false);assert.deepEqual(await drainEmailNotifications(x.env),{attempted:0,disabled:true});assert.equal(emailQueries,0);
});
test('opt-out cancels leased queue; re-enabling does not resurrect earlier generation',async()=>{
 const x=setup();await optIn(x);notice(x);const row=await claimEmail(x.DB,Date.now());assert.ok(row);assert.equal(await claimEmail(x.DB,Date.now()),null);
 assert.equal((await x.call('bob','PUT',choice(false,1))).status,200);assert.equal((await x.call('bob','PUT',choice(true,2))).status,200);
 assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'cancelled');
 let sent=0;await drainEmailNotifications(x.env,{send:async()=>{sent++;return {messageId:'fictional'}}});assert.equal(sent,0);
});
test('read/dismissed/category/global-off/revoked-resource/member/address/verification suppress queued delivery',async()=>{
 const mutations=["UPDATE notifications SET read_at=CURRENT_TIMESTAMP","UPDATE notifications SET dismissed_at=CURRENT_TIMESTAMP","INSERT INTO notification_settings(member_id,categories_json) VALUES('bob','{\"membership\":false}') ON CONFLICT(member_id) DO UPDATE SET categories_json=excluded.categories_json,write_token='legacy-fixture'","INSERT INTO notification_settings(member_id,global_off) VALUES('bob',1) ON CONFLICT(member_id) DO UPDATE SET global_off=1","UPDATE notifications SET resource_id='absent-member'","UPDATE members SET status='suspended' WHERE id='bob'","UPDATE members SET status='suspended',removed_at=CURRENT_TIMESTAMP WHERE id='bob'","UPDATE user SET email='changed@example.test' WHERE id='bob'","UPDATE user SET emailVerified=0 WHERE id='bob'"];
 for(const sql of mutations){const x=setup();await optIn(x);notice(x);x.sqlite.exec(sql);let sent=0;await drainEmailNotifications(x.env,{send:async()=>{sent++;return {messageId:'fictional'}}});assert.equal(sent,0,sql);assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'cancelled',sql)}
});
test('current Following and private resource access are checked again at dispatch',async()=>{
 for(const mutation of ["INSERT INTO notification_preferences(member_id,scope) VALUES('bob','selected')","UPDATE posts SET group_id='private-group' WHERE id='fixture-post'"]){const x=setup();await optIn(x);x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('fixture-post','owner','Private fixture text never in mail')");assert.equal(x.sqlite.prepare('SELECT count(*) n FROM email_notification_outbox').get().n,1);x.sqlite.exec(mutation);let sent=0;await drainEmailNotifications(x.env,{send:async()=>{sent++;return {messageId:'fictional'}}});assert.equal(sent,0,mutation)}
});
test('one provider acceptance uses exact opted-in recipient and generic content only',async()=>{
 const x=setup();await optIn(x);notice(x);let calls=0;
 const result=await drainEmailNotifications(x.env,{send:async mail=>{calls++;assert.equal(mail.to,'bob@example.test');assert.equal(mail.from.email,'family@greenwhitefamily.com');assert.match(mail.html,/Email notification settings/);assert.match(mail.text,/gwNotice=/);assert.doesNotMatch(mail.html,/Owner|Alice|Pending/);assert.equal(mail.headers['Auto-Submitted'],'auto-generated');return {messageId:'fictional-accepted-only'}}});
 assert.deepEqual(result,{attempted:1});await drainEmailNotifications(x.env,{send:async()=>{calls++;throw Error('duplicate')}});assert.equal(calls,1);assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'accepted');
});
test('exclusive dispatch is not resent by concurrent drain or after ambiguous result',async()=>{
 const x=setup();await optIn(x);notice(x);let entered,release,calls=0;const started=new Promise(resolve=>entered=resolve),pending=new Promise(resolve=>release=resolve);
 const first=drainEmailNotifications(x.env,{send:async()=>{calls++;entered();await pending;throw Error('private provider text')}});await started;
 assert.deepEqual(await drainEmailNotifications(x.env,{send:async()=>{calls++;return {messageId:'duplicate'}}}),{attempted:0});release();await first;
 await drainEmailNotifications(x.env,{send:async()=>{calls++;return {messageId:'duplicate'}}});assert.equal(calls,1);const row=x.sqlite.prepare('SELECT state,last_code FROM email_notification_outbox').get();assert.equal(row.state,'unknown');assert.equal(row.last_code,'unknown');
});
test('crashed dispatch becomes unknown; quota rejection alone retries within expiry/attempt bound',async()=>{
 const x=setup();await optIn(x);notice(x);const row=await claimEmail(x.DB,Date.now());x.sqlite.prepare("UPDATE email_notification_outbox SET state='dispatching',lease_until=0 WHERE id=?").run(row.id);let sent=0;await drainEmailNotifications(x.env,{send:async()=>{sent++}});assert.equal(sent,0);assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'unknown');
 assert.equal(emailRetry('E_INTERNAL_SERVER_ERROR',1,0,999999).state,'unknown');assert.equal(emailRetry('E_RATE_LIMIT_EXCEEDED',5,0,999999).state,'failed');assert.equal(emailRetry('E_DAILY_LIMIT_EXCEEDED',1,0,1000).state,'expired');
 const y=setup();await optIn(y);notice(y);let clock=Date.now();await drainEmailNotifications(y.env,{now:()=>clock,send:async()=>{throw Object.assign(Error('private detail'),{code:'E_RATE_LIMIT_EXCEEDED'})}});assert.equal(y.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'pending');clock+=121000;await drainEmailNotifications(y.env,{now:()=>clock,send:async()=>({messageId:'fictional'})});assert.equal(y.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'accepted');
});
test('suppressed recipient disables their opt-in; sender configuration rejection halts channel',async()=>{
 for(const code of ['E_RECIPIENT_SUPPRESSED','E_SENDER_NOT_VERIFIED']){const x=setup();await optIn(x);notice(x);await drainEmailNotifications(x.env,{send:async()=>{throw Object.assign(Error('must not retain raw provider data'),{code})}});assert.equal(x.sqlite.prepare('SELECT state FROM email_notification_outbox').get().state,'failed');if(code==='E_RECIPIENT_SUPPRESSED')assert.equal(x.sqlite.prepare('SELECT enabled FROM email_notification_preferences').get().enabled,0);else assert.equal(x.sqlite.prepare('SELECT enabled FROM email_notification_control').get().enabled,0)}
});
