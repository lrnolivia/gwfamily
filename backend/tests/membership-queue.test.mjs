import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {command} from '../src/family-service.mjs';
const owner={id:'owner',status:'active',group:'family',roles:['admin'],canPost:true,isLeader:true};
const input=(extra={})=>({type:'APPROVE_MEMBER',id:'pending',status:'active',roles:[],canPost:true,expectedAccountId:'owner',expectedStatus:'pending',expectedRevision:0,requestId:crypto.randomUUID(),...extra});
function setup(){const f=database();seed(f.sqlite);return f}
const row=f=>f.sqlite.prepare("SELECT * FROM members WHERE id='pending'").get();

test('guarded quick approval uses existing atomic command and idempotent receipt',async()=>{
 const f=setup(),action=input(),first=await command(f.DB,owner,action),again=await command(f.DB,owner,action);assert.deepEqual(again,first);assert.equal(row(f).status,'active');assert.equal(row(f).membership_revision,1);assert.equal(row(f).roles_json,'[]');assert.equal(row(f).can_post,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM membership_change_log').get().n,1);
});
test('quick approval fails closed for changed account, revision, state, role grants and self target',async()=>{
 for(const patch of [{expectedAccountId:'alice'},{expectedRevision:1},{expectedRevision:undefined},{roles:['admin']},{canPost:false},{status:'suspended'},{id:'owner'}]){const f=setup();await assert.rejects(()=>command(f.DB,owner,input(patch)));assert.equal(row(f).status,'pending')}
 for(const sql of ["UPDATE members SET status='active' WHERE id='pending'","UPDATE members SET status='suspended' WHERE id='pending'","UPDATE members SET status='suspended',removed_at=CURRENT_TIMESTAMP WHERE id='pending'","UPDATE members SET membership_revision=1 WHERE id='pending'"]){const f=setup();f.sqlite.exec(sql);await assert.rejects(()=>command(f.DB,owner,input()),e=>e.status===409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM membership_change_log').get().n,0)}
});
test('existing pending organizer roles are preserved without new roles',async()=>{
 const f=setup();f.sqlite.exec("UPDATE members SET roles_json='[\"planner\"]' WHERE id='pending'");await assert.rejects(()=>command(f.DB,owner,input()),e=>e.status===409);await command(f.DB,owner,input({roles:['planner']}));assert.equal(row(f).roles_json,'["planner"]');
});
test('current server admin check and atomic actor/target guards still own every queued action',async()=>{
 for(const sql of ["UPDATE members SET roles_json='[]' WHERE id='owner'","UPDATE members SET status='suspended' WHERE id='owner'","UPDATE user SET emailVerified=0 WHERE id='owner'"]){const f=setup();f.sqlite.exec("UPDATE members SET roles_json='[\"admin\"]' WHERE id='alice'");f.sqlite.exec(sql);await assert.rejects(()=>command(f.DB,owner,input()),e=>e.status===403);assert.equal(row(f).status,'pending')}
 for(const sql of ["UPDATE members SET status='suspended' WHERE id='pending'","UPDATE members SET roles_json='[]' WHERE id='owner'"]){const f=setup(),batch=f.DB.batch;f.sqlite.exec("UPDATE members SET roles_json='[\"admin\"]' WHERE id='alice'");f.DB.batch=async statements=>{if(statements.some(s=>s.sql.includes('membership_write_guards')))f.sqlite.exec(sql);return batch(statements)};await assert.rejects(()=>command(f.DB,owner,input()),e=>e.status===409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM membership_change_log').get().n,0)}
});
