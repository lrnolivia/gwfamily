import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState} from '../src/family-service.mjs';
// Fictional people and branch names only.
const actor=id=>id==='owner'?{id,status:'active',group:'family',roles:['admin'],canPost:true,isLeader:true}:{id,status:'active',group:'family',roles:[],canPost:true,isLeader:false};
const send=(db,id,type,values={})=>command(db,actor(id),{type,...values,requestId:crypto.randomUUID()});
const snapshot=sqlite=>({members:sqlite.prepare('SELECT * FROM household_members ORDER BY household_id,member_id').all(),requests:sqlite.prepare('SELECT * FROM household_requests ORDER BY id').all(),primaries:sqlite.prepare('SELECT member_id,primary_household_id FROM profiles ORDER BY member_id').all(),roles:sqlite.prepare('SELECT id,roles_json,is_leader FROM members ORDER BY id').all()});

test('0027 is additive: existing households, memberships and primaries are untouched',()=>{
 let before;const {sqlite}=database({beforeMigration(file,db){if(!file.startsWith('0027_'))return;seed(db);db.exec("INSERT INTO households(id,name,founder_id) VALUES('h1','Harbor Home','alice'); INSERT INTO household_members(household_id,member_id,role,joined_at) VALUES('h1','alice','head','2020-01-02 03:04:05'); UPDATE profiles SET primary_household_id='h1' WHERE member_id='alice'");before=snapshot(db)}});
 assert.deepEqual(snapshot(sqlite),before);
 assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'branch%' ORDER BY name").all().map(r=>r.name),['branch_households','branches']);
 assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>sqlite.exec("INSERT INTO branches(id,name,name_key,created_by) VALUES('x','Quill','quill','alice'),('y','The Quill Family','quill','bob')"),/UNIQUE constraint failed/);
});

test('any active member creates a branch only when no branch has that name',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 const quill=await send(DB,'bob','CREATE_BRANCH',{name:'Quill Branch'});
 for(const name of ['quill','The Quill Family','  QUILL  branch ','Quíll'])await assert.rejects(()=>send(DB,'alice','CREATE_BRANCH',{name}),e=>e.status===409&&/Quill Branch already exists/.test(e.message));
 await assert.rejects(()=>send(DB,'alice','CREATE_BRANCH',{name:'   '}),e=>e.status===400);
 const state=await familyState(DB,actor('alice'));
 assert.deepEqual(state.branches,[{id:quill.id,name:'Quill Branch',createdBy:'bob',householdIds:[]}]);assert.equal(state.branchManager,false);
 assert.equal((await familyState(DB,actor('owner'))).branchManager,true);
});

test('heads place their own household; leaders place any; placement never changes membership',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Harbor Home'}),b=await send(DB,'bob','CREATE_HOUSEHOLD',{name:'Juniper House'});
 const quill=await send(DB,'alice','CREATE_BRANCH',{name:'Quill',householdId:a.id});
 await assert.rejects(()=>send(DB,'bob','CREATE_BRANCH',{name:'Marsh',householdId:a.id}),e=>e.status===403);
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM branches WHERE name='Marsh'").get().n,0,'a rejected placement creates nothing');
 const before=snapshot(sqlite);
 await assert.rejects(()=>send(DB,'alice','ATTACH_BRANCH_HOUSEHOLD',{branchId:quill.id,householdId:b.id}),e=>e.status===403);
 await assert.rejects(()=>send(DB,'alice','ATTACH_BRANCH_HOUSEHOLD',{branchId:quill.id,householdId:a.id}),/already in Quill/);
 await send(DB,'bob','ATTACH_BRANCH_HOUSEHOLD',{branchId:quill.id,householdId:b.id});
 const marsh=await send(DB,'owner','CREATE_BRANCH',{name:'Marsh'});await send(DB,'owner','ATTACH_BRANCH_HOUSEHOLD',{branchId:marsh.id,householdId:a.id});
 let state=await familyState(DB,actor('bob'));
 assert.deepEqual(state.branches.map(x=>[x.name,[...x.householdIds].sort()]),[['Marsh',[a.id]],['Quill',[a.id,b.id].sort()]],'a household may belong to several branches');
 assert.deepEqual(snapshot(sqlite),before,'no joins, heads, requests or primary changes');
 await assert.rejects(()=>send(DB,'alice','DETACH_BRANCH_HOUSEHOLD',{branchId:quill.id,householdId:b.id}),e=>e.status===403);
 await send(DB,'alice','DETACH_BRANCH_HOUSEHOLD',{branchId:marsh.id,householdId:a.id});
 await assert.rejects(()=>send(DB,'alice','DETACH_BRANCH_HOUSEHOLD',{branchId:marsh.id,householdId:a.id}),e=>e.status===404);
 state=await familyState(DB,actor('alice'));assert.deepEqual(state.branches.find(x=>x.id===marsh.id).householdIds,[]);assert.deepEqual([...state.branches.find(x=>x.id===quill.id).householdIds].sort(),[a.id,b.id].sort());
 await assert.rejects(()=>send(DB,'bob','ATTACH_BRANCH_HOUSEHOLD',{branchId:'missing',householdId:b.id}),e=>e.status===404);
});

test('only leaders rename or remove branches, and removal waits for an empty branch',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Harbor Home'}),quill=await send(DB,'alice','CREATE_BRANCH',{name:'Quill',householdId:a.id}),marsh=await send(DB,'alice','CREATE_BRANCH',{name:'Marsh'});
 await assert.rejects(()=>send(DB,'alice','RENAME_BRANCH',{branchId:quill.id,name:'Quill-Marsh'}),e=>e.status===403);
 await assert.rejects(()=>send(DB,'owner','RENAME_BRANCH',{branchId:quill.id,name:'the marsh family'}),e=>e.status===409);
 await send(DB,'owner','RENAME_BRANCH',{branchId:quill.id,name:'Quill-Marsh'});
 await assert.rejects(()=>send(DB,'alice','REMOVE_BRANCH',{branchId:marsh.id}),e=>e.status===403);
 await assert.rejects(()=>send(DB,'owner','REMOVE_BRANCH',{branchId:quill.id}),/Move its households out/);
 await send(DB,'owner','REMOVE_BRANCH',{branchId:marsh.id});
 assert.deepEqual((await familyState(DB,actor('bob'))).branches.map(b=>b.name),['Quill-Marsh']);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM households').get().n,1,'branch removal never touches households');
});

test('a former head loses placement authority once they leave the head role',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Harbor Home'}),quill=await send(DB,'bob','CREATE_BRANCH',{name:'Quill'});
 sqlite.exec(`UPDATE household_members SET role='member' WHERE household_id='${a.id}' AND member_id='alice'`);
 await assert.rejects(()=>send(DB,'alice','ATTACH_BRANCH_HOUSEHOLD',{branchId:quill.id,householdId:a.id}),e=>e.status===403);
});

test('starting a household inside a branch makes the creator founding head and lists it atomically',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 const quill=await send(DB,'bob','CREATE_BRANCH',{name:'Quill'});
 await assert.rejects(()=>send(DB,'alice','CREATE_HOUSEHOLD',{name:'Lost Home',branchId:'missing'}),e=>e.status===404);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM households').get().n,0);
 const a=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Harbor Home',branchId:quill.id});
 const state=await familyState(DB,actor('alice'));
 assert.deepEqual(state.households.find(h=>h.id===a.id).headIds,['alice']);assert.equal(state.households.find(h=>h.id===a.id).founderId,'alice');
 assert.deepEqual(state.branches.find(b=>b.id===quill.id).householdIds,[a.id]);
});
