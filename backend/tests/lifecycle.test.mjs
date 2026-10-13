import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState} from '../src/family-service.mjs';
// Fictional records only. Nothing is erased.
const actor=(id,extra={})=>({id,status:'active',group:'family',roles:[],canPost:true,isLeader:false,...extra});
const admin=actor('owner',{roles:['admin','moderator','planner','treasurer'],isLeader:true});
const send=(DB,who,type,data={})=>command(DB,typeof who==='string'?actor(who):who,{type,requestId:crypto.randomUUID(),...data});
function setup(){const {sqlite,DB}=database();seed(sqlite);return {sqlite,DB}}
test('a guardian removes and restores a child record privately; others cannot touch it',async()=>{
 const {DB,sqlite}=setup();await send(DB,'alice','ADD_PERSON',{child:true,member:{name:'Fictional Child',birthday:'2020-04-05',gender:'Prefer not to say'}});
 const child=(await familyState(DB,actor('alice'))).members.find(m=>m.origin==='dependent');
 await assert.rejects(()=>send(DB,'bob','REMOVE_DEPENDENT',{id:child.id}),e=>e.status===404);
 await send(DB,'alice','REMOVE_DEPENDENT',{id:child.id});let s=await familyState(DB,actor('alice'));
 assert.equal(s.members.some(m=>m.id===child.id),false);assert.deepEqual(s.removedDependents.map(d=>d.id),[child.id]);
 assert.deepEqual((await familyState(DB,actor('bob'))).removedDependents,[],'removed records stay private');
 await send(DB,'alice','RESTORE_DEPENDENT',{id:child.id});assert.ok((await familyState(DB,actor('alice'))).members.some(m=>m.id===child.id));
 await send(DB,'alice','REMOVE_DEPENDENT',{id:child.id});sqlite.prepare("UPDATE dependents SET deleted_at=datetime('now','-40 days') WHERE id=?").run(child.id);
 await assert.rejects(()=>send(DB,'alice','RESTORE_DEPENDENT',{id:child.id}),e=>e.status===409);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM dependents').get().n,1,'never erased');
});
test('memorials archive and restore for their managers only',async()=>{
 const {DB}=setup();const m=await send(DB,admin,'ADD_MEMORIAL',{memorial:{name:'Fictional Ancestor'}});
 await assert.rejects(()=>send(DB,'alice','ARCHIVE_MEMORIAL',{id:m.id}),e=>e.status===403);
 await send(DB,admin,'ARCHIVE_MEMORIAL',{id:m.id});
 assert.equal((await familyState(DB,actor('alice'))).memorials.length,0);assert.deepEqual((await familyState(DB,admin)).archivedMemorials.map(x=>x.id),[m.id]);
 await send(DB,admin,'RESTORE_MEMORIAL',{id:m.id});assert.equal((await familyState(DB,actor('alice'))).memorials.length,1);
});
test('a founder archives a household only when alone; admins can always; restore brings it back',async()=>{
 const {DB}=setup();const h=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Fictional Oak household'});const inv=await send(DB,'alice','INVITE_HOUSEHOLD_MEMBER',{householdId:h.id,memberId:'bob'});await send(DB,'bob','RESOLVE_HOUSEHOLD_REQUEST',{id:inv.id,accept:true});
 await assert.rejects(()=>send(DB,'bob','ARCHIVE_HOUSEHOLD',{householdId:h.id}),e=>e.status===403);
 await assert.rejects(()=>send(DB,'alice','ARCHIVE_HOUSEHOLD',{householdId:h.id}),e=>e.status===409);
 await send(DB,'bob','LEAVE_HOUSEHOLD',{householdId:h.id});await send(DB,'alice','ARCHIVE_HOUSEHOLD',{householdId:h.id});
 assert.equal((await familyState(DB,actor('bob'))).households.length,0);assert.deepEqual((await familyState(DB,actor('alice'))).archivedHouseholds.map(x=>x.id),[h.id]);
 await assert.rejects(()=>send(DB,'alice','SAVE_HOUSEHOLD',{householdId:h.id,name:'x'}),e=>e.status===403);
 await assert.rejects(()=>send(DB,'bob','REQUEST_HOUSEHOLD_JOIN',{householdId:h.id}),e=>e.status===404);
 await send(DB,'alice','RESTORE_HOUSEHOLD',{householdId:h.id});assert.equal((await familyState(DB,actor('bob'))).households.length,1);
});
test('export and deletion are requests an admin acknowledges; nothing is deleted',async()=>{
 const {DB,sqlite}=setup();const r=await send(DB,'alice','REQUEST_ACCOUNT_DATA',{kind:'deletion',note:'Fictional reason'});
 await assert.rejects(()=>send(DB,'alice','REQUEST_ACCOUNT_DATA',{kind:'deletion'}),e=>e.status===409);
 assert.equal((await familyState(DB,admin)).openAccountRequests[0].id,r.id);assert.equal((await familyState(DB,actor('bob'))).openAccountRequests,undefined);
 await assert.rejects(()=>send(DB,'bob','ACKNOWLEDGE_ACCOUNT_REQUEST',{id:r.id}),e=>e.status===403);
 await send(DB,admin,'ACKNOWLEDGE_ACCOUNT_REQUEST',{id:r.id});assert.equal((await familyState(DB,actor('alice'))).accountRequests[0].status,'acknowledged');
 assert.equal(sqlite.prepare("SELECT status FROM members WHERE id='alice'").get().status,'active','a request never removes the account');
});
