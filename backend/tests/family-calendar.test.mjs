import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {changeFamilyEvent,readFamilyCalendar} from '../src/family-calendar.mjs';
import {listNotifications,openNotification,saveNotificationSettings} from '../src/notification-service.mjs';
import {registerDevice} from '../src/push-store.mjs';
const fixture={title:'Synthetic graduation',description:'Test only',eventType:'graduation',recurrence:'none',allDay:true,startDate:'2027-05-19',timezone:'UTC'};
const actor=id=>({id}),request=(id,extra={})=>({action:'save',event:fixture,expectedRevision:0,expectedAccountId:id,requestId:crypto.randomUUID(),...extra});
test('ordinary contributor publishes directly, owns edits/removal, rejects others/pending/account mismatch',async()=>{
 const {DB,sqlite}=database();seed(sqlite);const input=request('alice'),r=await changeFamilyEvent(DB,actor('alice'),input);
 assert.deepEqual(await changeFamilyEvent(DB,actor('alice'),input),r);assert.equal((await readFamilyCalendar(DB,actor('bob'))).events[0].createdBy,'alice');
 await assert.rejects(()=>changeFamilyEvent(DB,actor('bob'),request('bob',{event:{...fixture,id:r.id},expectedRevision:1})),e=>e.status===403);
 await assert.rejects(()=>changeFamilyEvent(DB,actor('pending'),request('pending')),e=>e.status===403);
 await assert.rejects(()=>changeFamilyEvent(DB,actor('alice'),request('bob')),e=>e.status===409);
 await changeFamilyEvent(DB,actor('alice'),request('alice',{event:{...fixture,title:'Updated synthetic event',id:r.id},expectedRevision:1}));
 await assert.rejects(()=>changeFamilyEvent(DB,actor('alice'),request('alice',{event:{...fixture,id:r.id},expectedRevision:1})),e=>e.status===409);
 await changeFamilyEvent(DB,actor('alice'),request('alice',{action:'delete',event:null,id:r.id,expectedRevision:2}));assert.equal((await readFamilyCalendar(DB,actor('bob'))).events.length,0);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM audit_log WHERE action LIKE 'family_calendar_%'").get().n,3);
});
test('Moderator, Leader and Admin moderation requires explanation and delivers private durable in-app alert without push',async()=>{
 for(const role of ['moderator','leader','admin']){
  const {DB,sqlite}=database();seed(sqlite);sqlite.prepare('UPDATE members SET roles_json=?,is_leader=? WHERE id=?').run(JSON.stringify(role==='leader'?[]:[role]),role==='leader'?1:0,'bob');
  const r=await changeFamilyEvent(DB,actor('alice'),request('alice')),edit=request('bob',{event:{...fixture,id:r.id,title:'Corrected fictional location'},expectedRevision:1,reason:'The contributor asked for this correction.'});
  await assert.rejects(()=>changeFamilyEvent(DB,actor('bob'),{...edit,reason:''}),/Explain/);await changeFamilyEvent(DB,actor('bob'),edit);
  let page=await listNotifications(DB,{id:'alice'}),notice=page.notifications.find(n=>n.kind==='family_calendar.changed');assert.ok(notice);assert.match(notice.text,/contributor asked/);assert.equal((await listNotifications(DB,{id:'owner'})).notifications.some(n=>n.id===notice.id),false);
  assert.equal((await openNotification(DB,{id:'alice'},notice.id)).target.kind,'family_calendar_moderation');
  await changeFamilyEvent(DB,actor('bob'),request('bob',{action:'delete',event:null,id:r.id,expectedRevision:2,reason:'This duplicate fixture was removed.'}));
  page=await listNotifications(DB,{id:'alice'});notice=page.notifications.find(n=>n.kind==='family_calendar.removed');assert.ok(notice);assert.match(notice.text,/duplicate fixture/);assert.equal((await openNotification(DB,{id:'alice'},notice.id)).available,true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM push_devices').get().n,0);
  assert.equal(sqlite.prepare('SELECT birthday FROM profiles WHERE member_id=?').get('alice').birthday,'1991-02-03');
 }
});

async function channelCalendarFixture({email=true,push=true}={}){
 const x=database();seed(x.sqlite);x.sqlite.exec('DELETE FROM notifications;DELETE FROM notification_events;UPDATE push_control SET enabled=1');
 if(email)x.sqlite.exec("INSERT INTO email_notification_preferences(member_id,enabled,updated_at) VALUES('bob',1,0)");
 if(push){x.sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('calendar-fixture-session',9999999999999,'fictional-not-a-credential',0,0,'bob')");await registerDevice(x.DB,actor('bob'),'calendar-fixture-session','bob',{endpoint:'https://web.push.apple.com/fictional-calendar-fixture',keys:{p256dh:Buffer.from([4,...Array(64).fill(0)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}},'fixture-v1')}
 return x;
}
async function moderateFixture(DB){
 const r=await changeFamilyEvent(DB,actor('bob'),request('bob'));
 await changeFamilyEvent(DB,actor('owner'),request('owner',{event:{...fixture,id:r.id,title:'Corrected fictional event'},expectedRevision:1,reason:'The contributor requested this fictional correction.'}));
 return r.id;
}

test('calendar moderation preserves audit and explanation across all eight recipient channel combinations without later backfill',async()=>{
 for(let mask=0;mask<8;mask++){
  const {DB,sqlite}=await channelCalendarFixture();try{
   const choices={inApp:!!(mask&1),email:!!(mask&2),push:!!(mask&4)};await saveNotificationSettings(DB,actor('bob'),{channels:{membership:choices}});const id=await moderateFixture(DB);
   assert.equal(sqlite.prepare("SELECT count(*) n FROM audit_log WHERE action LIKE 'family_calendar_%' AND subject_id=?").get(id).n,2);
   const event=sqlite.prepare("SELECT * FROM notification_events WHERE resource_kind='family_calendar_moderation' AND resource_id=?").get(id);assert.ok(event);assert.match(JSON.parse(event.data_json).reason,/contributor requested/);
   assert.equal(sqlite.prepare("SELECT count(*) n FROM notifications WHERE recipient_id='bob' AND resource_kind='family_calendar_moderation'").get().n,Number(mask!==0));
   const page=await listNotifications(DB,actor('bob'));assert.equal(page.unreadCount,Number(choices.inApp));assert.equal(page.notifications.length,Number(choices.inApp));
   assert.equal(sqlite.prepare('SELECT count(*) n FROM email_notification_outbox').get().n,Number(choices.email));assert.equal(sqlite.prepare('SELECT count(*) n FROM push_outbox').get().n,Number(choices.push));
   if(mask===0){await saveNotificationSettings(DB,actor('bob'),{channels:{membership:{inApp:true,email:true,push:true}}});assert.equal((await listNotifications(DB,actor('bob'))).notifications.length,0);assert.equal(sqlite.prepare("SELECT count(*) n FROM notification_events WHERE resource_kind='family_calendar_moderation'").get().n,1)}
  }finally{sqlite.close()}
 }
});

test('calendar manual recipient delivery respects consent, device, runtime and global-Off gates while retaining moderation audit',async()=>{
 for(const mode of ['no-email-consent','email-runtime-off','no-push-device','push-runtime-off','expired-push-session','global-off','legacy-off']){
  const useEmail=mode.startsWith('email')||mode==='no-email-consent',x=await channelCalendarFixture({email:mode!=='no-email-consent',push:mode!=='no-push-device'});try{
   await saveNotificationSettings(x.DB,actor('bob'),{channels:{membership:{inApp:false,email:useEmail,push:!useEmail}}});
   if(mode==='email-runtime-off')x.sqlite.exec('UPDATE email_notification_control SET enabled=0');
   if(mode==='push-runtime-off')x.sqlite.exec('UPDATE push_control SET enabled=0');
   if(mode==='expired-push-session')x.sqlite.exec('UPDATE session SET expiresAt=0');
   if(mode==='global-off')await saveNotificationSettings(x.DB,actor('bob'),{globalOff:true});
   if(mode==='legacy-off')x.sqlite.exec("UPDATE notification_preferences SET scope='off' WHERE member_id='bob'");
   const id=await moderateFixture(x.DB);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM notifications WHERE recipient_id='bob' AND resource_kind='family_calendar_moderation'").get().n,0,mode);assert.equal(x.sqlite.prepare('SELECT count(*) n FROM email_notification_outbox').get().n,0,mode);assert.equal(x.sqlite.prepare('SELECT count(*) n FROM push_outbox').get().n,0,mode);
   assert.equal(x.sqlite.prepare("SELECT count(*) n FROM notification_events WHERE resource_kind='family_calendar_moderation' AND resource_id=?").get(id).n,1);assert.equal(x.sqlite.prepare("SELECT count(*) n FROM audit_log WHERE subject_id=? AND action LIKE 'family_calendar_%'").get(id).n,2);
  }finally{x.sqlite.close()}
 }
});
