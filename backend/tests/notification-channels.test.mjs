import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,seed} from './test-db.mjs';
import {CATEGORIES,channelDefault} from '../src/notification-policy.mjs';
import {notificationSettings,notificationSettingsStatements,saveNotificationSettings,listNotifications,openNotification,readAllNotifications,dismissAllNotifications} from '../src/notification-service.mjs';
import {registerDevice,claimDelivery,authorizedDelivery,drainWithInjectedSender} from '../src/push-store.mjs';
import {claimEmail,drainEmailNotifications} from '../src/email-notifications.mjs';
import {createApp} from '../src/worker.mjs';

const bob={id:'bob',status:'active',group:'family',roles:[],canPost:true};
// Structural fictional values only. No keys are generated, browser enrolled,
// permission requested, provider contacted or production data loaded.
const subscription={endpoint:'https://web.push.apple.com/fictional-channel-fixture',keys:{p256dh:Buffer.from([4,...Array(64).fill(0)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};
function setup(){const x=database();seed(x.sqlite);x.sqlite.exec("DELETE FROM notifications;DELETE FROM notification_events;INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('channel-session',9999999999999,'fictional-not-a-credential',0,0,'bob')");return x}
async function enableFixtures(x){
 x.sqlite.exec("UPDATE push_control SET enabled=1;INSERT INTO email_notification_preferences(member_id,enabled,updated_at) VALUES('bob',1,0)");
 await registerDevice(x.DB,bob,'channel-session','bob',subscription,'fixture-v1');
}
function event(x,category='membership',id=crypto.randomUUID()){
 x.sqlite.prepare("INSERT INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,category,audience,direct_ids_json) VALUES(?,?,'membership.role_changed','owner','member','bob',?,'direct','[\"bob\"]')").run(id,id,category);
 return x.sqlite.prepare("SELECT * FROM notifications WHERE event_id=? AND recipient_id='bob'").get(id);
}
const outbox=(x,channel)=>x.sqlite.prepare('SELECT * FROM '+(channel==='email'?'email_notification_outbox':'push_outbox')).all();
const count=(x,table)=>x.sqlite.prepare('SELECT count(*) n FROM '+table).get().n;
const emailEnv=x=>({DB:x.DB,AUTH_EMAIL_ENABLED:'true',EMAIL_SCHEMA_VERSION:'1',EMAIL:{send(){throw Error('A real provider is never available in this fixture')}}});

test('every category supports all eight independent combinations through fanout, inbox, queues and stubbed dispatch',async()=>{
 for(const category of CATEGORIES)for(let mask=0;mask<8;mask++){
  const x=setup();try{
   await enableFixtures(x);const choices={inApp:!!(mask&1),email:!!(mask&2),push:!!(mask&4)};
   const saved=await saveNotificationSettings(x.DB,bob,{scope:'all',channels:{[category]:choices},revision:0});
   assert.deepEqual(saved.channels[category],choices,category+' '+mask);assert.equal(saved.categories[category],choices.inApp);
   const row=event(x,category),inbox=await listNotifications(x.DB,bob);
   assert.equal(!!row,!!mask,category+' recipient '+mask);assert.equal(inbox.notifications.length,Number(choices.inApp));assert.equal(inbox.unreadCount,Number(choices.inApp));
   assert.equal(outbox(x,'email').length,Number(choices.email));assert.equal(outbox(x,'push').length,Number(choices.push));
   let emails=0,pushes=0;
   await drainEmailNotifications(emailEnv(x),{send:async mail=>{emails++;assert.equal(mail.to,'bob@example.test');assert.doesNotMatch(mail.html,/fictional-channel-fixture|membership\.role_changed/);return {messageId:'fictional-only'}}});
   await drainWithInjectedSender(x.DB,{sender:async({payload})=>{pushes++;assert.equal(payload.title,'Family account update');assert.doesNotMatch(JSON.stringify(payload),/bob@example|membership\.role_changed/);return {status:201}}});
   assert.equal(emails,Number(choices.email));assert.equal(pushes,Number(choices.push));
   assert.equal(count(x,'push_devices'),1);assert.equal(x.sqlite.prepare('SELECT enabled FROM email_notification_preferences').get().enabled,1);
  }finally{x.sqlite.close()}
 }
});

test('migration preserves every legacy off, defaults, consent, global off, revisions and read/dismiss history without backfill',async()=>{
 let before;
 const x=database({beforeMigration(file,sqlite){if(file!=='0025_notification_channels.sql')return;
  seed(sqlite);sqlite.exec('DELETE FROM notifications;DELETE FROM notification_events;');
  sqlite.prepare("INSERT INTO notification_settings(member_id,categories_json,global_off,revision) VALUES('alice',?,1,7)").run(JSON.stringify(Object.fromEntries(CATEGORIES.map(k=>[k,false]))));
  sqlite.exec("INSERT INTO notification_settings(member_id,categories_json,revision) VALUES('bob','{\"replies\":false,\"reactions\":true}',3);INSERT INTO email_notification_preferences(member_id,enabled,revision,generation,consented_at,updated_at) VALUES('bob',1,9,2,123,456);INSERT INTO notifications(id,recipient_id,kind,read_at,dismissed_at) VALUES('historic','bob','membership.role_changed','2026-01-01','2026-01-02')");
  before={events:count({sqlite},'notification_events'),notices:count({sqlite},'notifications'),email:sqlite.prepare('SELECT * FROM email_notification_preferences').get()};
 }});
 try{
  const alice=await notificationSettings(x.DB,{id:'alice'}),settings=await notificationSettings(x.DB,bob),defaults=await notificationSettings(x.DB,{id:'owner'});
  for(const category of CATEGORIES){assert.deepEqual(alice.channels[category],{inApp:false,email:false,push:false});assert.deepEqual(defaults.channels[category],{inApp:true,email:channelDefault(category,'email'),push:channelDefault(category,'push')})}
  assert.equal(alice.globalOff,true);assert.equal(alice.revision,7);assert.equal(settings.revision,3);assert.deepEqual(settings.channels.replies,{inApp:false,email:false,push:false});assert.deepEqual(settings.channels.reactions,{inApp:true,email:true,push:true});
  assert.deepEqual(JSON.parse(x.sqlite.prepare("SELECT channels_json FROM notification_settings WHERE member_id='bob'").get().channels_json),{replies:{email:false,push:false}});
  assert.deepEqual(x.sqlite.prepare('SELECT * FROM email_notification_preferences').get(),before.email);assert.equal(count(x,'push_devices'),0);assert.equal(count(x,'notification_events'),before.events);assert.equal(count(x,'notifications'),before.notices);assert.equal(count(x,'email_notification_outbox'),0);assert.equal(count(x,'push_outbox'),0);
  assert.deepEqual({...x.sqlite.prepare("SELECT read_at,dismissed_at FROM notifications WHERE id='historic'").get()},{read_at:'2026-01-01',dismissed_at:'2026-01-02'});
  await saveNotificationSettings(x.DB,bob,{channels:{replies:{email:true}},revision:3});assert.deepEqual((await notificationSettings(x.DB,bob)).channels.replies,{inApp:false,email:true,push:false});
 }finally{x.sqlite.close()}
});

test('channel edits preserve unrelated preferences, only choices that differ from the default are stored, and invalid DTOs cannot commit',async()=>{
 const x=setup();try{
  let s=await saveNotificationSettings(x.DB,bob,{scope:'selected',selectedIds:['alice'],channels:{replies:{email:false},mentions:{push:false}}});
  s=await saveNotificationSettings(x.DB,bob,{channels:{replies:{inApp:false}},revision:s.revision});
  assert.deepEqual(s.channels.replies,{inApp:false,email:false,push:true});assert.equal(s.channels.mentions.push,false);assert.deepEqual(s.selectedIds,['alice']);assert.equal(s.scope,'selected');
  s=await saveNotificationSettings(x.DB,bob,{channels:{replies:{email:true}},revision:s.revision});assert.equal(s.channels.replies.inApp,false);assert.equal(s.channels.mentions.push,false);
  // Replies email and Tags push are off by default, so only the Replies email opt-in is stored.
  assert.deepEqual(JSON.parse(x.sqlite.prepare("SELECT channels_json FROM notification_settings WHERE member_id='bob'").get().channels_json),{replies:{email:true}});
  for(const channels of [null,[],false,{unknown:{email:true}},{replies:[]},{replies:{sms:true}},{replies:{email:'true'}},{replies:{inApp:null}}])await assert.rejects(()=>saveNotificationSettings(x.DB,bob,{channels}),e=>e.status===400);
  await assert.rejects(()=>saveNotificationSettings(x.DB,bob,{categories:{replies:false},channels:{replies:{email:true}}}),e=>e.status===400);
  assert.equal((await notificationSettings(x.DB,bob)).revision,s.revision);assert.equal(count(x,'push_devices'),0);assert.equal(count(x,'email_notification_preferences'),0);
 }finally{x.sqlite.close()}
});

test('channel compare-and-swap remains atomic and cannot undo another device or account',async()=>{
 const x=setup();try{
  const stale=await notificationSettingsStatements(x.DB,bob,{channels:{reactions:{email:false}},revision:0});
  await saveNotificationSettings(x.DB,bob,{channels:{membership:{push:false}},revision:0});await assert.rejects(()=>x.DB.batch(stale));
  const actual=await notificationSettings(x.DB,bob);assert.equal(actual.channels.reactions.email,true);assert.equal(actual.channels.membership.push,false);assert.equal(actual.revision,1);assert.equal(count(x,'notification_setting_guards'),0);
  const env={DB:x.DB,BETTER_AUTH_SECRET:'fictional-only',AUTH_ORIGIN:'https://fixture.example.test'},app=createApp(()=>({api:{getSession:async()=>({user:{id:'bob',emailVerified:true},session:{id:'channel-session'}})}}));
  const response=await app.request(env.AUTH_ORIGIN+'/api/me/notifications',{method:'PUT',headers:{Origin:env.AUTH_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({expectedAccountId:'alice',revision:1,channels:{mentions:{push:true}}})},env);
  assert.equal(response.status,409);assert.deepEqual(await notificationSettings(x.DB,bob),actual);
 }finally{x.sqlite.close()}
});

test('legacy category offs remain all-channel offs without re-enabling independently disabled channels',async()=>{
 const x=setup();try{
  let s=await saveNotificationSettings(x.DB,bob,{categories:{replies:false}});assert.deepEqual(s.channels.replies,{inApp:false,email:false,push:false});
  s=await saveNotificationSettings(x.DB,bob,{categories:{replies:true}});assert.deepEqual(s.channels.replies,{inApp:true,email:false,push:false});
  // A rollback Worker updates categories and an unprefixed write token only.
  x.sqlite.exec("UPDATE notification_settings SET categories_json=json_set(categories_json,'$.membership',json('false')),write_token='legacy-writer',revision=revision+1 WHERE member_id='bob'");
  assert.deepEqual((await notificationSettings(x.DB,bob)).channels.membership,{inApp:false,email:false,push:false});
  s=await saveNotificationSettings(x.DB,bob,{channels:{membership:{inApp:true,email:true}}});assert.deepEqual(s.channels.membership,{inApp:true,email:true,push:false});
  s=await saveNotificationSettings(x.DB,bob,{channels:{membership:{inApp:false}}});assert.deepEqual(s.channels.membership,{inApp:false,email:true,push:false});
 }finally{x.sqlite.close()}
});

test('channel-off cancels only its pending and leased deliveries; re-enable never revives old work or enrolls a device',async()=>{
 for(const channel of ['email','push']){
  const x=setup();try{
   await enableFixtures(x);event(x);const pushLease=await claimDelivery(x.DB),emailLease=await claimEmail(x.DB,Date.now());assert.ok(pushLease&&emailLease);
   const device={...x.sqlite.prepare('SELECT * FROM push_devices').get()},consent={...x.sqlite.prepare('SELECT * FROM email_notification_preferences').get()};
   await saveNotificationSettings(x.DB,bob,{channels:{membership:{[channel]:false}}});
   const cancelled=outbox(x,channel)[0];assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.lease_token,null);assert.equal(outbox(x,channel==='email'?'push':'email')[0].state,'leased');
   assert.deepEqual({...x.sqlite.prepare('SELECT * FROM push_devices').get()},device);assert.deepEqual({...x.sqlite.prepare('SELECT * FROM email_notification_preferences').get()},consent);
   if(channel==='email')assert.ok(await authorizedDelivery(x.DB,pushLease,Date.now()));else assert.equal(await authorizedDelivery(x.DB,pushLease,Date.now()),null);
   await saveNotificationSettings(x.DB,bob,{channels:{membership:{[channel]:true}}});assert.equal(outbox(x,channel)[0].state,'cancelled');assert.equal(outbox(x,channel).length,1);
   event(x);assert.equal(outbox(x,channel).length,2);assert.equal(outbox(x,channel)[1].state,'pending');
  }finally{x.sqlite.close()}
 }
});

test('email-only and push-only records stay out of in-app pages, counts and bulk actions but authorized links still open',async()=>{
 for(const channel of ['email','push']){
  const x=setup();try{
   await enableFixtures(x);await saveNotificationSettings(x.DB,bob,{channels:{following:{inApp:false,email:channel==='email',push:channel==='push'}}});
   x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('hidden-post','owner','Fictional authorized content')");
   const notice=x.sqlite.prepare("SELECT * FROM notifications WHERE recipient_id='bob'").get();assert.ok(notice);
   const inbox=await listNotifications(x.DB,bob);assert.equal(inbox.unreadCount,0);assert.equal(inbox.messageUnreadCount,0);assert.equal(inbox.readAllCutoff,0);assert.deepEqual(inbox.notifications,[]);
   await readAllNotifications(x.DB,bob,Number.MAX_SAFE_INTEGER);await dismissAllNotifications(x.DB,bob,Number.MAX_SAFE_INTEGER);
   const hidden=x.sqlite.prepare('SELECT * FROM notifications WHERE id=?').get(notice.id);assert.equal(hidden.read_at,null);assert.equal(hidden.dismissed_at,null);
   assert.equal((await openNotification(x.DB,bob,notice.id)).post.id,'hidden-post');assert.equal((await openNotification(x.DB,{id:'alice'},notice.id)).available,false);
   x.sqlite.exec("UPDATE posts SET group_id='private-group' WHERE id='hidden-post'");assert.equal((await openNotification(x.DB,bob,notice.id)).available,false);
   x.sqlite.exec("INSERT INTO family_group_members(group_id,member_id) VALUES('private-group','bob')");assert.equal((await openNotification(x.DB,bob,notice.id)).available,true);
   await saveNotificationSettings(x.DB,bob,{channels:{following:{[channel]:false}}});assert.equal((await openNotification(x.DB,bob,notice.id)).available,false);
  }finally{x.sqlite.close()}
 }
});

test('effective fanout requires existing email consent or a live enabled push device and never backfills on opt-in',async()=>{
 for(const choices of [{inApp:false,email:true,push:false},{inApp:false,email:false,push:true}]){
  const x=setup();try{
   await saveNotificationSettings(x.DB,bob,{channels:{membership:choices}});assert.equal(event(x),undefined);assert.equal(count(x,'push_devices'),0);assert.equal(count(x,'email_notification_preferences'),0);
   await enableFixtures(x);assert.equal(count(x,'notifications'),0);assert.equal(count(x,'push_outbox'),0);assert.equal(count(x,'email_notification_outbox'),0);assert.ok(event(x));
  }finally{x.sqlite.close()}
 }
});

test('global off remains absolute, preserves choices and consent, and requires fresh push enrollment after turning back on',async()=>{
 const x=setup();try{
  await enableFixtures(x);const before=await saveNotificationSettings(x.DB,bob,{scope:'selected',selectedIds:['owner'],channels:{membership:{inApp:false,email:true,push:true}}});event(x);
  const paused=await saveNotificationSettings(x.DB,bob,{globalOff:true});assert.deepEqual(paused.channels,before.channels);assert.deepEqual(paused.selectedIds,['owner']);assert.equal(event(x),undefined);
  assert.ok(x.sqlite.prepare('SELECT revoked_at FROM push_devices').get().revoked_at);assert.equal(outbox(x,'email')[0].state,'cancelled');assert.equal(outbox(x,'push')[0].state,'cancelled');
  await saveNotificationSettings(x.DB,bob,{globalOff:false});event(x);assert.equal(outbox(x,'email').length,2);assert.equal(outbox(x,'push').length,1);assert.equal(x.sqlite.prepare('SELECT enabled FROM email_notification_preferences').get().enabled,1);
 }finally{x.sqlite.close()}
});

test('channel fanout migration retains the complete established resource authorization block',()=>{
 const prior=readFileSync(new URL('../migrations/0023_multi_household_membership.sql',import.meta.url),'utf8'),next=readFileSync(new URL('../migrations/0025_notification_channels.sql',import.meta.url),'utf8');
 const resource=text=>text.slice(text.indexOf(' AND (CASE NEW.resource_kind'),text.indexOf('\nEND;',text.indexOf(' AND (CASE NEW.resource_kind')));
 assert.equal(resource(next),resource(prior));assert.ok(resource(next).includes('cm.notifications_muted=0'));assert.ok(resource(next).includes('cm.invite_generation=NEW.resource_revision'));
});

test('hidden delivery links and queued sends recheck expiry, membership, verification, Following and resource deletion',async()=>{
 const mutations=["UPDATE notification_events SET expires_at='2000-01-01'","UPDATE members SET status='suspended' WHERE id='bob'","UPDATE user SET emailVerified=0 WHERE id='bob'","UPDATE posts SET deleted_at=CURRENT_TIMESTAMP WHERE id='hidden-gated-post'","UPDATE notification_preferences SET scope='selected',selected_ids_json='[]' WHERE member_id='bob'"];
 for(const mutation of mutations){const x=setup();try{
  await enableFixtures(x);await saveNotificationSettings(x.DB,bob,{channels:{following:{inApp:false,email:true,push:true}}});x.sqlite.exec("INSERT INTO posts(id,author_id,body) VALUES('hidden-gated-post','owner','Synthetic text')");
  const notice=x.sqlite.prepare("SELECT id FROM notifications WHERE recipient_id='bob'").get();assert.ok(notice);assert.equal((await openNotification(x.DB,bob,notice.id)).available,true);assert.equal((await listNotifications(x.DB,bob)).unreadCount,0);
  x.sqlite.exec(mutation);assert.equal((await openNotification(x.DB,bob,notice.id)).available,false,mutation);let sends=0;
  await drainEmailNotifications(emailEnv(x),{send:async()=>{sends++;return {messageId:'unexpected'}}});await drainWithInjectedSender(x.DB,{sender:async()=>{sends++;return {status:201}}});assert.equal(sends,0,mutation);
 }finally{x.sqlite.close()}}
});

test('first global Off insertion revokes already-enrolled devices and On cannot silently resume push',async()=>{
 for(const mode of ['settings','legacy-preferences']){
  const x=setup();try{
   await enableFixtures(x);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM notification_settings WHERE member_id='bob'").get().n,0);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM notification_preferences WHERE member_id='bob'").get().n,0);
   event(x);const leased=await claimDelivery(x.DB);assert.ok(leased);const consent={...x.sqlite.prepare("SELECT * FROM email_notification_preferences WHERE member_id='bob'").get()};
   if(mode==='settings')await saveNotificationSettings(x.DB,bob,{globalOff:true});else x.sqlite.exec("INSERT INTO notification_preferences(member_id,scope) VALUES('bob','off')");
   const device=x.sqlite.prepare("SELECT * FROM push_devices WHERE member_id='bob'").get();assert.ok(device.revoked_at);assert.equal(device.generation,2);assert.equal(outbox(x,'push')[0].state,'cancelled');assert.equal(outbox(x,'push')[0].lease_token,null);assert.equal(await authorizedDelivery(x.DB,leased,Date.now()),null);
   assert.deepEqual({...x.sqlite.prepare("SELECT * FROM email_notification_preferences WHERE member_id='bob'").get()},consent);
   await saveNotificationSettings(x.DB,bob,{globalOff:false});event(x);assert.equal(outbox(x,'push').length,1);assert.equal(await claimDelivery(x.DB),null);assert.equal(x.sqlite.prepare('SELECT generation FROM push_devices').get().generation,2);
  }finally{x.sqlite.close()}
 }
});

test('legacy explicit Off cancels external channels even when categories JSON was already identical',async()=>{
 const x=setup();try{
  await enableFixtures(x);const before=await saveNotificationSettings(x.DB,bob,{channels:{membership:{inApp:false,email:true,push:true},replies:{inApp:false,email:true,push:true}}});
  event(x);await claimDelivery(x.DB);await claimEmail(x.DB,Date.now());const oldJSON=x.sqlite.prepare("SELECT categories_json FROM notification_settings WHERE member_id='bob'").get().categories_json;
  // This is the categories/write-token UPDATE made by the baseline Worker. It
  // has no channels column and writes exactly the same already-false JSON.
  x.sqlite.prepare("UPDATE notification_settings SET categories_json=?,write_token=?,revision=revision+1 WHERE member_id='bob' AND revision=?").run(oldJSON,'legacy-worker-write',before.revision);
  assert.equal(x.sqlite.prepare("SELECT categories_json FROM notification_settings WHERE member_id='bob'").get().categories_json,oldJSON);
  const after=await notificationSettings(x.DB,bob);assert.deepEqual(after.channels.membership,{inApp:false,email:false,push:false});assert.deepEqual(after.channels.replies,{inApp:false,email:false,push:false});assert.equal(outbox(x,'email')[0].state,'cancelled');assert.equal(outbox(x,'push')[0].state,'cancelled');
  assert.equal(x.sqlite.prepare('SELECT revoked_at FROM push_devices').get().revoked_at,null,'A category off must not revoke the device itself');
  await saveNotificationSettings(x.DB,bob,{channels:{membership:{email:true,push:true}}});assert.deepEqual((await notificationSettings(x.DB,bob)).channels.membership,{inApp:false,email:true,push:true});
 }finally{x.sqlite.close()}
});

test('Lauren’s defaults: an unset member gets email/push only where the default is on',async()=>{
 const expected={following:[0,0],mentions:[0,0],replies:[0,1],messages:[0,1],announcements:[1,1],birthdays:[1,1],fees:[1,1],orders:[1,1],membership:[1,1],reunion:[1,1]};
 for(const [category,[email,push]] of Object.entries(expected)){
  const x=setup();try{
   await enableFixtures(x);const row=event(x,category);
   assert.ok(row,category+' still reaches the in-app inbox');
   assert.equal(outbox(x,'email').length,email,category+' email');assert.equal(outbox(x,'push').length,push,category+' push');
   const shown=(await notificationSettings(x.DB,bob)).channels[category];assert.deepEqual(shown,{inApp:true,email:!!email,push:!!push},category+' settings');
  }finally{x.sqlite.close()}
 }
});
