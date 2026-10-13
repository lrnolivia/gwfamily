import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState} from '../src/family-service.mjs';import {householdHistory} from '../src/household-succession.mjs';
// Fictional households only.
const actor=(id,roles=[])=>({id,status:'active',group:'family',roles,canPost:true,isLeader:false});
const admin=actor('owner',['admin','moderator','planner','treasurer']);
const send=(DB,who,type,value={})=>command(DB,typeof who==='string'?actor(who):who,{type,...value,requestId:crypto.randomUUID()});
async function setup(){const {DB,sqlite}=database();seed(sqlite);const h=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Fictional household'});const invite=await send(DB,'alice','INVITE_HOUSEHOLD_MEMBER',{householdId:h.id,memberId:'bob'});await send(DB,'bob','RESOLVE_HOUSEHOLD_REQUEST',{id:invite.id,accept:true});return {DB,sqlite,h}}
const founder=(sqlite,id)=>sqlite.prepare('SELECT founder_id f FROM households WHERE id=?').get(id).f;
test('the founder hands over only with the named member’s consent, and history records each step',async()=>{
 const {DB,sqlite,h}=await setup();
 await assert.rejects(()=>send(DB,'bob','OFFER_HOUSEHOLD_FOUNDER',{householdId:h.id,memberId:'bob'}),e=>e.status===403);
 await assert.rejects(()=>send(DB,'alice','OFFER_HOUSEHOLD_FOUNDER',{householdId:h.id,memberId:'pending'}),e=>e.status===400,'outsiders cannot be named');
 const offer=await send(DB,'alice','OFFER_HOUSEHOLD_FOUNDER',{householdId:h.id,memberId:'bob'});
 await assert.rejects(()=>send(DB,'alice','OFFER_HOUSEHOLD_FOUNDER',{householdId:h.id,memberId:'bob'}),e=>e.status===409);
 assert.equal((await familyState(DB,actor('bob'))).founderTransfers[0].id,offer.id);assert.equal(founder(sqlite,h.id),'alice');
 await assert.rejects(()=>send(DB,'alice','RESPOND_HOUSEHOLD_FOUNDER',{id:offer.id,accept:true}),e=>e.status===403);
 await send(DB,'bob','RESPOND_HOUSEHOLD_FOUNDER',{id:offer.id,accept:true});
 assert.equal(founder(sqlite,h.id),'bob');const state=await familyState(DB,actor('alice'));assert.deepEqual(state.households[0].headIds.sort(),['alice','bob'],'the previous founder stays a head');
 await assert.rejects(()=>send(DB,'bob','RESPOND_HOUSEHOLD_FOUNDER',{id:offer.id,accept:true}),e=>e.status===409);
 await send(DB,'alice','LEAVE_HOUSEHOLD',{householdId:h.id});
 const history=(await householdHistory(DB,actor('bob'),h.id)).map(r=>r.action);for(const a of ['founded','founder-offered','founder-accepted','member-left'])assert.ok(history.includes(a),a+' in '+history);
 await assert.rejects(()=>householdHistory(DB,actor('alice'),h.id),e=>e.status===403);
});
test('a household always keeps an active head, and a declined or cancelled handover changes nothing',async()=>{
 const {DB,sqlite,h}=await setup();
 await assert.rejects(()=>send(DB,'alice','LEAVE_HOUSEHOLD',{householdId:h.id}),/Hand the founding role/);
 const offer=await send(DB,'alice','OFFER_HOUSEHOLD_FOUNDER',{householdId:h.id,memberId:'bob'});await send(DB,'bob','RESPOND_HOUSEHOLD_FOUNDER',{id:offer.id,accept:false});assert.equal(founder(sqlite,h.id),'alice');
 const again=await send(DB,'alice','OFFER_HOUSEHOLD_FOUNDER',{householdId:h.id,memberId:'bob'});await send(DB,'alice','CANCEL_HOUSEHOLD_FOUNDER',{id:again.id});
 await assert.rejects(()=>send(DB,'bob','RESPOND_HOUSEHOLD_FOUNDER',{id:again.id,accept:true}),e=>e.status===409);assert.equal(founder(sqlite,h.id),'alice');
 // Bob is the founder but paused; alice is the only active head and must stay.
 sqlite.prepare("UPDATE household_members SET role='head' WHERE member_id='bob'").run();sqlite.prepare("UPDATE members SET status='suspended' WHERE id='bob'").run();
 sqlite.prepare("UPDATE households SET founder_id='bob' WHERE id=?").run(h.id);
 await assert.rejects(()=>send(DB,'alice','LEAVE_HOUSEHOLD',{householdId:h.id}),e=>e.status===409,'the last active head cannot leave');
});
test('admin recovery is scoped to orphaned households, needs the member’s consent and never makes the admin a head',async()=>{
 const {DB,sqlite,h}=await setup();
 await assert.rejects(()=>send(DB,admin,'RECOVER_HOUSEHOLD',{householdId:h.id,memberId:'bob',reason:'Founder unavailable'}),e=>e.status===409,'active founder: no recovery');
 assert.deepEqual((await familyState(DB,admin)).householdRecovery,[]);
 sqlite.prepare("UPDATE members SET status='suspended',removed_at='2026-01-01' WHERE id='alice'").run();
 assert.deepEqual((await familyState(DB,admin)).householdRecovery,[{householdId:h.id,reason:'founder-inactive'}]);
 await assert.rejects(()=>send(DB,'bob','RECOVER_HOUSEHOLD',{householdId:h.id,memberId:'bob',reason:'Taking over'}),e=>e.status===403);
 await assert.rejects(()=>send(DB,admin,'RECOVER_HOUSEHOLD',{householdId:h.id,memberId:'bob',reason:''}),e=>e.status===400);
 await assert.rejects(()=>send(DB,admin,'RECOVER_HOUSEHOLD',{householdId:h.id,memberId:'owner',reason:'Admin takeover'}),e=>e.status===400,'an admin outside the household cannot take it');
 const recovery=await send(DB,admin,'RECOVER_HOUSEHOLD',{householdId:h.id,memberId:'bob',reason:'Founder membership removed'});
 const offered=(await familyState(DB,actor('bob'))).founderTransfers[0];assert.equal(offered.kind,'recovery');assert.equal(offered.reason,'Founder membership removed');
 await send(DB,'bob','RESPOND_HOUSEHOLD_FOUNDER',{id:recovery.id,accept:true});
 assert.equal(founder(sqlite,h.id),'bob');assert.equal(sqlite.prepare("SELECT count(*) n FROM household_members WHERE member_id='owner'").get().n,0);
 assert.ok((await householdHistory(DB,admin,h.id)).some(r=>r.action==='recovery-offered'&&r.detail.reason==='Founder membership removed'));
});
