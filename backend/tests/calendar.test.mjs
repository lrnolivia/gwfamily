import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {calendarCommand,calendarDetailsFor} from '../src/calendar.mjs';
import {commandFingerprint} from '../src/command-identity.mjs';
const event={title:'Synthetic picnic',description:'Test fixture only',location:'Synthetic park',allDay:false,startDate:'2027-06-19',endDate:'2027-06-19',startTime:'12:00',endTime:'14:00',timezone:'America/New_York',visibility:'family'};
function setup(){
 const {DB,sqlite}=database();seed(sqlite);sqlite.exec(`UPDATE members SET is_leader=1 WHERE id='alice';UPDATE members SET roles_json='["admin","planner"]' WHERE id='bob';`);
 const env={DB,BETTER_AUTH_SECRET:'synthetic-calendar-fixture-secret',AUTH_ORIGIN:'https://family.example.test'},sessions=new Set(['owner','alice','bob','pending']);
 const app=createApp(()=>({api:{getSession:async({headers})=>{const id=headers.get('Cookie')?.match(/session=([^;]+)/)?.[1];return sessions.has(id)?{user:{id,emailVerified:true}}:null}}}));
 const call=async(user,path='/api/calendar',method='GET',body,headers={})=>{const response=await app.request(env.AUTH_ORIGIN+path,{method,headers:{Origin:env.AUTH_ORIGIN,...(user?{Cookie:'session='+user}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})},env);return {status:response.status,data:await response.json(),headers:response.headers}};
 const write=(action,user='alice',headers)=>call(user,'/api/commands','POST',{expectedAccountId:user,requestId:crypto.randomUUID(),...action},headers);
 const current=()=>JSON.parse(sqlite.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").get()?.data_json||'{}');
 return {DB,sqlite,call,write,current};
}
test('approved Leaders only; unauthenticated, pending and admin-only users cannot read manager or write',async()=>{
 const {call,write}=setup();for(const [user,status]of [[null,401],['pending',403],['bob',403]]){assert.equal((await call(user)).status,status);assert.equal((await write({type:'SAVE_EVENT',event,expectedRevision:0},user)).status,status)}
 assert.equal((await call('alice')).status,200);assert.equal((await call('alice')).headers.get('Cache-Control'),'no-store');
 assert.equal((await write({type:'SAVE_EVENT',event,expectedRevision:0},'alice',{Origin:'https://evil.example'})).status,403);
 assert.equal((await write({type:'SAVE_EVENT',event,expectedRevision:0,expectedAccountId:'bob'})).status,409);
 assert.equal((await write({type:'DETAILS',value:{schedule:'Unauthorized schedule'}},'bob')).status,403);
});
test('create, edit, archive, restore and private calendar feed the existing family state',async()=>{
 const {write,call,current,sqlite}=setup();const noticesBefore=sqlite.prepare('SELECT count(*) n FROM notifications').get().n;let response=await write({type:'SAVE_EVENT',event,expectedRevision:0});assert.equal(response.status,200,JSON.stringify(response.data));const id=response.data.calendar.events[0].id;
 assert.equal((await call('bob','/api/state')).data.details.calendar.events[0].title,event.title);
 response=await write({type:'SAVE_EVENT',event:{...event,id,title:'Edited picnic'},expectedRevision:1});assert.equal(response.status,200);
 assert.equal((await write({type:'ARCHIVE_EVENT',id,expectedRevision:2})).status,200);assert.deepEqual((await call('bob','/api/state')).data.details.calendar.events,[]);assert.equal(current().calendar.events.length,1);
 assert.equal((await write({type:'RESTORE_EVENT',id,expectedRevision:3})).status,200);
 assert.equal((await write({type:'SAVE_EVENT',event:{...event,title:'Private draft',visibility:'leaders'},expectedRevision:4})).status,200);
 assert.equal((await call('bob','/api/state')).data.details.calendar.events.length,1);assert.equal((await call('alice')).data.events.length,2);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM notifications').get().n,noticesBefore);
 assert.equal((await write({type:'SAVE_CALENDAR',expectedRevision:5,settings:{visibility:'leaders',timezone:'America/New_York',schedule:'Private plan'}})).status,200);
 const member=(await call('bob','/api/state')).data;assert.equal(member.details.schedule,'');assert.deepEqual(member.details.calendar.events,[]);assert.equal(member.capabilities.manageCalendar,false);assert.equal((await call('alice','/api/state')).data.capabilities.manageCalendar,true);
 assert.ok(sqlite.prepare('SELECT count(*) n FROM notifications').get().n>=noticesBefore);assert.equal(sqlite.prepare('SELECT count(*) n FROM invitations').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM fee_reports').get().n,0);
});
test('revision conflicts and receipt replay prevent overwrites or duplicate events',async()=>{
 const {write,current,sqlite}=setup(),requestId=crypto.randomUUID(),action={type:'SAVE_EVENT',event,expectedRevision:0,requestId};
 assert.equal((await write(action)).status,200);assert.equal((await write(action)).status,200);assert.equal(current().calendar.events.length,1);
 assert.equal((await write({...action,event:{...event,title:'Different body'}})).status,409);
 assert.equal((await write({type:'SAVE_EVENT',event:{...event,title:'Stale'},expectedRevision:0})).status,409);assert.equal(current().calendar.events[0].title,event.title);
 sqlite.exec("UPDATE members SET is_leader=0 WHERE id='alice'");assert.equal((await write(action)).status,403);
});
test('invalid data does not mutate calendar, receipt, or audit',async()=>{
 const {write,current,sqlite}=setup();for(const patch of [{startDate:'2027-02-30'},{startDate:'2026-03-08',endDate:'2026-03-08',startTime:'02:30'},{timezone:'not-a-zone'},{endTime:'11:00'},{visibility:'public'}])assert.equal((await write({type:'SAVE_EVENT',event:{...event,...patch},expectedRevision:0})).status,400);
 assert.deepEqual(current(),{});assert.equal(sqlite.prepare('SELECT count(*) n FROM command_receipts').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM audit_log').get().n,0);
});
test('legacy reunion and payment writes preserve events and advance relevant revision',async()=>{
 const {write,current}=setup();await write({type:'SAVE_EVENT',event,expectedRevision:0});
 assert.equal((await write({type:'DETAILS',value:{date:'2027-06-19'}},'owner')).status,200);assert.equal(current().calendar.events.length,1);assert.equal(current().calendar.revision,2);
 assert.equal((await write({type:'SET_PAYMENT',value:{paypal:'',cashApp:'',amount:'Synthetic value'}},'owner')).status,200);assert.equal(current().calendar.events.length,1);assert.equal(current().schedule,'');
 assert.equal((await write({type:'DETAILS',value:{schedule:'Unversioned stale schedule'}},'owner')).status,409);
 assert.equal((await write({type:'SAVE_CALENDAR',expectedRevision:2,settings:{visibility:'family',timezone:'UTC',schedule:'New schedule'}})).status,200);assert.equal(current().payment.amount,'Synthetic value');
});
test('transaction rechecks Leader permission and full record compare-and-swap',async()=>{
 for(const mutation of ['permission','calendar','payment']){
  const {DB,sqlite,current}=setup(),actor={id:'alice',status:'active',group:'family',isLeader:true},input={type:'SAVE_EVENT',event,expectedRevision:0,requestId:crypto.randomUUID(),expectedAccountId:'alice'};
  const wrapped={...DB,batch:async statements=>{if(mutation==='permission')sqlite.exec("UPDATE members SET is_leader=0 WHERE id='alice'");else sqlite.prepare("INSERT INTO reunion_settings(id,data_json,updated_by) VALUES('current',?,'owner')").run(JSON.stringify(mutation==='calendar'?{calendar:{revision:1,events:[]}}:{payment:{amount:'Concurrent payment'}}));return DB.batch(statements)}};
  await assert.rejects(()=>calendarCommand(wrapped,actor,input,awaitHash),e=>e.status===(mutation==='permission'?403:409));
  assert.equal(current().calendar?.events?.length||0,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM command_receipts').get().n,0);if(mutation==='payment')assert.equal(current().payment.amount,'Concurrent payment');
 }
});
const awaitHash='synthetic-fingerprint';
