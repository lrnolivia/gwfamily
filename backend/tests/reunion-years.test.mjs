import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database,seed} from './test-db.mjs';
import {command,familyState} from '../src/family-service.mjs';
import {readCalendar} from '../src/calendar.mjs';
import {readReunions,resolveReunion} from '../src/reunions.mjs';
const actor=(id,roles=[],isLeader=false)=>({id,roles,isLeader,status:'active',group:'family',canPost:true}),owner=actor('owner',['admin','planner','treasurer'],true),planner=actor('owner',['planner'],true),member=actor('alice');
const write=(DB,who,type,extra={})=>command(DB,who,{type,requestId:crypto.randomUUID(),...extra});
function fixture(){const f=database();seed(f.sqlite);return f}
test('migration retains existing settings and copies RSVP without losing records or creating notifications',()=>{
 let beforeEvents,beforeNotices;
 const {sqlite}=database({beforeMigration(file,db){if(file==='0017_reunion_years.sql'){
  seed(db);db.exec("INSERT INTO reunion_settings(id,data_json,updated_by) VALUES('current','{\"location\":\"Original hall\",\"payment\":{\"amount\":\"$50\"}}','owner') ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json; INSERT INTO rsvps(member_id,status,count) VALUES('alice','Planning to come',2); INSERT INTO fee_reports(id,member_id,status) VALUES('old-fee','alice','confirmed'); INSERT INTO shirt_claims(id,member_id,lines_json) VALUES('old-order','alice','[]');");
  beforeEvents=db.prepare('SELECT count(*) AS n FROM notification_events').get().n;beforeNotices=db.prepare('SELECT count(*) AS n FROM notifications').get().n;
 }}});
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM notification_events').get().n,beforeEvents);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM notifications').get().n,beforeNotices);
 assert.equal(sqlite.prepare("SELECT year FROM reunions WHERE id='legacy'").get().year,null);assert.equal(sqlite.prepare("SELECT status FROM reunions WHERE id='legacy'").get().status,'active');
 assert.equal(JSON.parse(sqlite.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").get().data_json).location,'Original hall');assert.equal(sqlite.prepare("SELECT count(*) AS n FROM reunion_settings WHERE id='legacy'").get().n,0);
 assert.equal(sqlite.prepare("SELECT count FROM rsvps WHERE member_id='alice'").get().count,2);assert.equal(sqlite.prepare("SELECT count FROM reunion_rsvps WHERE member_id='alice' AND reunion_id='legacy'").get().count,2);
 for(const table of ['products','shirt_claims','fee_reports'])assert.ok(sqlite.prepare(`SELECT * FROM ${table}`).all().every(r=>r.reunion_id==='legacy'));
});
test('multiple planned years retain one explicit active year and keep independent RSVP/orders/payment/fees/calendar',async()=>{
 const {DB,sqlite}=fixture();await write(DB,owner,'CREATE_REUNION',{year:2028});await write(DB,owner,'CREATE_REUNION',{year:2031});
 await write(DB,member,'RSVP',{reunionId:'legacy',value:{status:'Planning to come',count:3}});await write(DB,member,'RSVP',{reunionId:'reunion-2028',value:{status:'Can’t make it',count:1}});
 await write(DB,owner,'SET_PAYMENT',{reunionId:'legacy',value:{amount:'$50',cashApp:'https://cash.app/$Fixture'}});await write(DB,owner,'SET_PAYMENT',{reunionId:'reunion-2028',value:{amount:'$60',methods:[{provider:'zelle',recipient:'Fixture treasurer',instructions:'Ask for the verified destination.'}]}});
 await write(DB,member,'SET_FEES',{reunionId:'legacy',value:'reported'});await write(DB,member,'CLAIM_ORDER',{reunionId:'legacy',lines:[{productId:'forest',size:'M',quantity:1}]});
 await write(DB,owner,'SAVE_CALENDAR',{reunionId:'legacy',expectedAccountId:'owner',expectedRevision:0,settings:{visibility:'family',timezone:'UTC',schedule:'Old schedule'}});
 await write(DB,owner,'SAVE_CALENDAR',{reunionId:'reunion-2028',expectedAccountId:'owner',expectedRevision:0,settings:{visibility:'family',timezone:'UTC',schedule:'New schedule'}});
 const legacy=await familyState(DB,member,'legacy'),future=await familyState(DB,member,'reunion-2028');assert.equal(legacy.rsvp.count,3);assert.equal(future.rsvp.count,1);assert.equal(legacy.payment.amount,'$50');assert.equal(future.payment.amount,'$60');assert.equal(legacy.planningRecords.orders.length,1);assert.equal(future.planningRecords.orders.length,0);assert.equal(future.planningRecords.feeReports.length,0);assert.equal(future.fees,'unpaid');assert.equal(future.products.length,0);assert.equal(legacy.details.schedule,'Old schedule');assert.equal(future.details.schedule,'New schedule');assert.equal((await readCalendar(DB,owner,'legacy')).schedule,'Old schedule');
 await write(DB,owner,'ACTIVATE_REUNION',{id:'reunion-2028',archivePrevious:true});assert.equal((await resolveReunion(DB)).id,'reunion-2028');assert.equal((await readReunions(DB)).filter(r=>r.status==='active').length,1);assert.equal((await familyState(DB,member,'legacy')).rsvp.count,3);
 await assert.rejects(()=>write(DB,owner,'ARCHIVE_REUNION',{id:'reunion-2028'}),/active/);await assert.rejects(()=>write(DB,member,'SET_FEES',{reunionId:'legacy',value:'reported'}),/archived/);await write(DB,owner,'RESTORE_REUNION',{id:'legacy'});assert.equal((await resolveReunion(DB,'legacy')).status,'planned');
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM reunion_write_guards').get().n,0);
});
test('treasury privilege, member ownership and resource year are all enforced server-side',async()=>{
 const {DB,sqlite}=fixture();await write(DB,owner,'CREATE_REUNION',{year:2028});
 await assert.rejects(()=>write(DB,planner,'SET_PAYMENT',{reunionId:'legacy',value:{amount:'$99'}}),e=>e.status===403);await assert.rejects(()=>write(DB,member,'CREATE_REUNION',{year:2030}),e=>e.status===403);
 const fee=await write(DB,member,'SET_FEES',{reunionId:'legacy',value:'reported'});await assert.rejects(()=>write(DB,owner,'CONFIRM_FEE',{reunionId:'reunion-2028',id:fee.id,status:'confirmed'}),e=>e.status===404);await assert.rejects(()=>write(DB,member,'CONFIRM_FEE',{reunionId:'legacy',id:fee.id,status:'confirmed'}),e=>e.status===403);
 const order=await write(DB,member,'CLAIM_ORDER',{reunionId:'legacy',lines:[{productId:'forest',size:'M',quantity:1}]});await assert.rejects(()=>write(DB,owner,'UPDATE_CLAIM',{reunionId:'reunion-2028',id:order.id,status:'delivered'}),e=>e.status===404);await assert.rejects(()=>write(DB,member,'CLAIM_ORDER',{reunionId:'reunion-2028',lines:[{productId:'forest',size:'M',quantity:1}]}),/unavailable/);await assert.rejects(()=>write(DB,owner,'SAVE_PRODUCT',{reunionId:'reunion-2028',product:{id:'forest',name:'Overwrite'}}),e=>e.status===404);
 assert.equal(sqlite.prepare('SELECT status FROM fee_reports WHERE id=?').get(fee.id).status,'reported');assert.equal(sqlite.prepare('SELECT status FROM shirt_claims WHERE id=?').get(order.id).status,'claimed');
});
test('same request cannot be replayed into another year; legacy clients write only legacy year',async()=>{
 const {DB,sqlite}=fixture();await write(DB,owner,'CREATE_REUNION',{year:2028});await write(DB,owner,'ACTIVATE_REUNION',{id:'reunion-2028'});
 const payload={type:'RSVP',requestId:crypto.randomUUID(),reunionId:'legacy',value:{status:'Planning to come',count:2}};await command(DB,member,payload);await command(DB,member,payload);await assert.rejects(()=>command(DB,member,{...payload,reunionId:'reunion-2028'}),e=>e.status===409);await write(DB,member,'SET_FEES',{value:'reported'});assert.equal(sqlite.prepare('SELECT reunion_id FROM fee_reports').get().reunion_id,'legacy');
});
test('archiving between validation and commit atomically rolls back the scoped write',async()=>{
 const {DB,sqlite}=fixture();await write(DB,owner,'CREATE_REUNION',{year:2028});let intercepted=false;const race={...DB,batch:async statements=>{if(!intercepted){intercepted=true;sqlite.exec("UPDATE reunions SET status='planned' WHERE id='legacy'; UPDATE reunions SET status='active' WHERE id='reunion-2028'; UPDATE reunions SET status='archived' WHERE id='legacy';")}return DB.batch(statements)}};
 await assert.rejects(()=>write(race,member,'SET_FEES',{reunionId:'legacy',value:'reported'}),e=>e.status===409);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM fee_reports').get().n,0);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM command_receipts WHERE operation='SET_FEES'").get().n,0);
});

test('local backup restore rehearsal retains original data and a separate all-year recovery snapshot',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'gw-reunion-rollback-')),beforePath=join(directory,'before.sqlite'),afterPath=join(directory,'all-years.sqlite');let prior,recovery;
 try{
  const {sqlite,DB}=database({beforeMigration(file,db){if(file==='0017_reunion_years.sql'){seed(db);db.exec("INSERT INTO rsvps(member_id,status,count) VALUES('alice','Planning to come',2)");db.prepare('VACUUM INTO ?').run(beforePath)}}});
  await write(DB,owner,'CREATE_REUNION',{year:2028});await write(DB,member,'RSVP',{reunionId:'reunion-2028',value:{status:'Planning to come',count:4}});sqlite.prepare('VACUUM INTO ?').run(afterPath);
  prior=new DatabaseSync(beforePath);recovery=new DatabaseSync(afterPath);assert.equal(prior.prepare("SELECT count FROM rsvps WHERE member_id='alice'").get().count,2);assert.equal(prior.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='reunions'").get().n,0);assert.equal(recovery.prepare("SELECT count FROM reunion_rsvps WHERE reunion_id='reunion-2028' AND member_id='alice'").get().count,4);assert.equal(recovery.prepare("SELECT count FROM reunion_rsvps WHERE reunion_id='legacy' AND member_id='alice'").get().count,2);sqlite.close();
 }finally{prior?.close();recovery?.close();rmSync(directory,{recursive:true,force:true})}
});
