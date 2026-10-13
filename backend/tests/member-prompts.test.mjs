import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState} from '../src/family-service.mjs';
// Fictional accounts only.
const actor=id=>id==='owner'?{id,status:'active',group:'family',roles:['admin'],canPost:true,isLeader:true}:{id,status:'active',group:'family',roles:[],canPost:true,isLeader:false};
const send=(db,id,type,values={})=>command(db,actor(id),{type,...values,requestId:crypto.randomUUID()});

test('0027 offers the optional family refinement to existing active members only',()=>{
 const {sqlite}=database({beforeMigration(file,db){if(file.startsWith('0027_'))seed(db)}});
 assert.deepEqual(sqlite.prepare('SELECT member_id,prompt,version,status FROM member_prompts ORDER BY member_id').all().map(r=>({...r})),
  ['alice','bob','owner'].map(member_id=>({member_id,prompt:'family-setup',version:1,status:'due'})),'pending members get nothing; nobody existing gets the welcome');
});

test('approving a pending member makes only their welcome due, once',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 assert.deepEqual((await familyState(DB,actor('alice'))).prompts,{},'fixture members seeded after migration have no prompts');
 await command(DB,actor('owner'),{type:'APPROVE_MEMBER',id:'pending',status:'active',roles:[],canPost:true,expectedAccountId:'owner',expectedStatus:'pending',expectedRevision:0,requestId:crypto.randomUUID()});
 assert.deepEqual((await familyState(DB,actor('pending'))).prompts,{welcome:{version:1,status:'due'}});
 sqlite.exec("UPDATE members SET status='suspended' WHERE id='alice'");sqlite.exec("UPDATE members SET status='active' WHERE id='alice'");
 assert.deepEqual((await familyState(DB,actor('alice'))).prompts,{},'resuming paused access is not a new arrival');
});

test('members answer only their own prompts; Not now and Done stop automatic prompts',async()=>{
 const {DB,sqlite}=database();seed(sqlite);sqlite.exec("INSERT INTO member_prompts(member_id,prompt,version,status) VALUES('alice','welcome',1,'due'),('alice','family-setup',1,'due'),('bob','family-setup',1,'due')");
 const before=sqlite.prepare('SELECT * FROM households').all();
 await send(DB,'alice','SET_PROMPT_STATUS',{prompt:'welcome',status:'completed'});
 await send(DB,'alice','SET_PROMPT_STATUS',{prompt:'family-setup',status:'dismissed'});
 assert.deepEqual((await familyState(DB,actor('alice'))).prompts,{welcome:{version:1,status:'completed'},'family-setup':{version:1,status:'dismissed'}});
 assert.deepEqual((await familyState(DB,actor('bob'))).prompts,{'family-setup':{version:1,status:'due'}},'another account is untouched');
 await assert.rejects(()=>send(DB,'alice','SET_PROMPT_STATUS',{prompt:'welcome',status:'due'}),e=>e.status===400);
 await assert.rejects(()=>send(DB,'alice','SET_PROMPT_STATUS',{prompt:'admin-tour',status:'completed'}),e=>e.status===400);
 assert.deepEqual(sqlite.prepare('SELECT * FROM households').all(),before);
});
