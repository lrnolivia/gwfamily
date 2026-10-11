import test from 'node:test';import assert from 'node:assert/strict';
import {can} from '../src/policy.mjs';import {ROLE_MATRIX} from '../src/role-matrix.mjs';
import {database,seed} from './test-db.mjs';import {command} from '../src/family-service.mjs';
// Every combination of holders, checked against the documented matrix.
const holders=['admin','moderator','planner','treasurer','leader','canPost','author'];
const actorFor=set=>({id:'actor',status:'active',group:'family',roles:['admin','moderator','planner','treasurer'].filter(r=>set.has(r)),isLeader:set.has('leader'),canPost:set.has('canPost')});
test('policy.can matches the bounded role matrix for every holder combination',()=>{
 for(let mask=0;mask<1<<holders.length;mask++){
  const set=new Set(holders.filter((_,i)=>mask&1<<i)),actor=actorFor(set),resource={authorId:set.has('author')?'actor':'someone-else'};
  for(const [action,allowed] of Object.entries(ROLE_MATRIX))assert.equal(can(actor,action,resource),allowed.some(h=>h==='member'||set.has(h)),`${action} for ${[...set].join('+')||'member'}`);
 }
 assert.equal(can({...actorFor(new Set(['admin'])),status:'pending'},'read_family'),false,'inactive members hold nothing');
});
const admin={id:'owner',status:'active',group:'family',roles:['admin','moderator','planner','treasurer'],canPost:true,isLeader:true};
const send=(DB,actor,input)=>command(DB,actor,{requestId:crypto.randomUUID(),...input});
const leaderOf=(sqlite,id)=>sqlite.prepare('SELECT is_leader FROM members WHERE id=?').get(id).is_leader;
const revision=(sqlite,id)=>sqlite.prepare('SELECT membership_revision r FROM members WHERE id=?').get(id).r;
test('Family Leader is granted and revoked explicitly; removal clears it and restore never brings it back',async()=>{
 const {sqlite,DB}=database();seed(sqlite);
 await send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true,leader:true});assert.equal(leaderOf(sqlite,'alice'),1);
 await send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'suspended',roles:[],canPost:true});assert.equal(leaderOf(sqlite,'alice'),1,'pause keeps it');
 await assert.rejects(()=>send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'suspended',roles:[],canPost:true,leader:true}),e=>e.status===400);
 await send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true});
 await send(DB,admin,{type:'REMOVE_MEMBER',id:'alice',confirmedMemberId:'alice',expectedAccountId:'owner',expectedRevision:revision(sqlite,'alice')});assert.equal(leaderOf(sqlite,'alice'),0);
 await send(DB,admin,{type:'RESTORE_MEMBER',id:'alice',confirmedMemberId:'alice',expectedAccountId:'owner',expectedRevision:revision(sqlite,'alice')});
 await send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true});assert.equal(leaderOf(sqlite,'alice'),0,'restore and approval do not regrant');
 await send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true,leader:true});await send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true,leader:false});assert.equal(leaderOf(sqlite,'alice'),0);
 const log=sqlite.prepare("SELECT action FROM membership_change_log WHERE member_id='alice' ORDER BY created_at,rowid").all().map(r=>r.action);
 assert.ok(log.includes('membership-active-leader-granted')&&log.includes('membership-active-leader-revoked'),log.join());
 await assert.rejects(()=>send(DB,{...admin,id:'bob',roles:['moderator']},{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true,leader:true}),e=>e.status===403);
 await assert.rejects(()=>send(DB,admin,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:[],canPost:true,leader:'yes'}),e=>e.status===400);
});
