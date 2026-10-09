import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {changeFamilyEvent,readFamilyCalendar} from '../src/family-calendar.mjs';
import {listNotifications,openNotification} from '../src/notification-service.mjs';
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
