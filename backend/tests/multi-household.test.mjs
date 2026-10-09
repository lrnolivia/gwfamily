import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState} from '../src/family-service.mjs';
const actor=id=>({id,status:'active',group:'family',roles:[],canPost:true,isLeader:false});
const send=(db,id,type,values={})=>command(db,actor(id),{type,...values,requestId:crypto.randomUUID()});
test('migration proves old single-membership failure, preserves every existing row and dependent trigger',()=>{
 let previous,triggers;
 const {sqlite}=database({beforeMigration(file,db){if(!file.startsWith('0023'))return;seed(db);db.exec("INSERT INTO households(id,name,founder_id) VALUES('a','A','alice'),('b','B','bob'); INSERT INTO household_members(household_id,member_id,role,joined_at) VALUES('a','alice','head','2020-01-02 03:04:05'),('b','bob','head','2021-02-03 04:05:06')");assert.throws(()=>db.exec("INSERT INTO household_members(household_id,member_id,role) VALUES('b','alice','member')"),/UNIQUE constraint failed/);previous=db.prepare('SELECT * FROM household_members ORDER BY household_id').all();triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();}});
 assert.deepEqual(sqlite.prepare('SELECT * FROM household_members ORDER BY household_id').all(),previous);
 assert.deepEqual(sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all(),triggers);
 assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(sqlite.prepare("SELECT primary_household_id FROM profiles WHERE member_id='alice'").get().primary_household_id,'a');
 sqlite.exec("INSERT INTO household_members(household_id,member_id,role) VALUES('b','alice','member')");assert.throws(()=>sqlite.exec("INSERT INTO household_members(household_id,member_id,role) VALUES('b','alice','head')"),/UNIQUE constraint failed/);
});
test('recipient acceptance joins B while preserving A, primary preference and household-scoped heads',async()=>{
 const {DB,sqlite}=database();seed(sqlite);const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'A'}),b=await send(DB,'bob','CREATE_HOUSEHOLD',{name:'B'});
 const invitation=await send(DB,'bob','INVITE_HOUSEHOLD_MEMBER',{householdId:b.id,memberId:'alice'});
 await assert.rejects(()=>send(DB,'bob','RESOLVE_HOUSEHOLD_REQUEST',{id:invitation.id,accept:true}),e=>e.status===403);
 await send(DB,'alice','RESOLVE_HOUSEHOLD_REQUEST',{id:invitation.id,accept:true});let state=await familyState(DB,actor('alice'));
 assert.deepEqual(new Set(state.householdIds),new Set([a.id,b.id]));assert.equal(state.householdId,a.id);assert.equal(state.households.find(h=>h.id===a.id).canManage,true);assert.equal(state.households.find(h=>h.id===b.id).canManage,false);
 await assert.rejects(()=>send(DB,'alice','SAVE_HOUSEHOLD',{householdId:b.id,name:'Unauthorized',color:'#123456'}),e=>e.status===403);
 await send(DB,'alice','SET_PRIMARY_HOUSEHOLD',{householdId:b.id});assert.equal((await familyState(DB,actor('alice'))).householdId,b.id);
 await send(DB,'bob','REQUEST_HOUSEHOLD_HEAD',{householdId:b.id,memberId:'alice'});assert.equal((await familyState(DB,actor('alice'))).households.find(h=>h.id===b.id).canManage,true);
 await send(DB,'alice','LEAVE_HOUSEHOLD',{householdId:b.id});state=await familyState(DB,actor('alice'));assert.deepEqual(state.householdIds,[a.id]);assert.equal(state.householdId,a.id);assert.deepEqual(state.households.find(h=>h.id===a.id).headIds,['alice']);
});
test('pending invitations and membership duplicates are scoped per household; strangers cannot select a primary',async()=>{
 const {DB,sqlite}=database();seed(sqlite);const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'A'}),b=await send(DB,'bob','CREATE_HOUSEHOLD',{name:'B'}),c=await send(DB,'owner','CREATE_HOUSEHOLD',{name:'C'});
 const first=await send(DB,'alice','INVITE_HOUSEHOLD_MEMBER',{householdId:a.id,memberId:'bob'}),second=await send(DB,'owner','INVITE_HOUSEHOLD_MEMBER',{householdId:c.id,memberId:'bob'});
 assert.notEqual(first.id,second.id);await assert.rejects(()=>send(DB,'alice','INVITE_HOUSEHOLD_MEMBER',{householdId:a.id,memberId:'bob'}),/already waiting/);
 await send(DB,'bob','RESOLVE_HOUSEHOLD_REQUEST',{id:first.id,accept:true});await send(DB,'bob','RESOLVE_HOUSEHOLD_REQUEST',{id:second.id,accept:false});assert.equal((await familyState(DB,actor('bob'))).householdId,b.id);
 await assert.rejects(()=>send(DB,'alice','INVITE_HOUSEHOLD_MEMBER',{householdId:a.id,memberId:'bob'}),/already belongs to this household/);
 await assert.rejects(()=>send(DB,'bob','SET_PRIMARY_HOUSEHOLD',{householdId:c.id}),e=>e.status===403);
 await send(DB,'alice','REMOVE_HOUSEHOLD_MEMBER',{householdId:a.id,memberId:'bob'});assert.deepEqual((await familyState(DB,actor('bob'))).householdIds,[b.id]);
});
test('creating an additional household never replaces the existing primary or existing head role',async()=>{
 const {DB,sqlite}=database();seed(sqlite);const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'A'}),b=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'B'}),state=await familyState(DB,actor('alice'));
 assert.equal(state.householdId,a.id);assert.deepEqual(new Set(state.householdIds),new Set([a.id,b.id]));assert.ok(state.households.filter(h=>h.memberIds.includes('alice')).every(h=>h.canManage));
 sqlite.exec("UPDATE profiles SET birthday='2020-01-01' WHERE member_id='owner'");await assert.rejects(()=>send(DB,'owner','CREATE_HOUSEHOLD',{name:'Child'}),/Registered adults/);
});
