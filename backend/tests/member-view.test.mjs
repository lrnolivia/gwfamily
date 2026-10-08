import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {createApp} from '../src/worker.mjs';import {memberViewActor} from '../src/member-view.mjs';
test('request-only authority reduction cannot grant roles, never mutates actor and rejects other accounts/nonleaders',()=>{
 const actor={id:'owner',isLeader:true,roles:['admin'],canPost:true};const member=memberViewActor(actor,{enabled:true,expectedAccountId:'owner'});assert.equal(member.isLeader,false);assert.deepEqual(member.roles,[]);assert.equal(member.viewAsMember,true);assert.deepEqual(actor.roles,['admin']);assert.equal(actor.isLeader,true);
 assert.throws(()=>memberViewActor(actor,{enabled:true,expectedAccountId:'other'}),e=>e.status===409);assert.throws(()=>memberViewActor({...actor,isLeader:false},{enabled:true,expectedAccountId:'owner'}),e=>e.status===403);
});
test('actual Leader reads use member-filtered contact data; privileged reads and mutations denied, roles unchanged, exit restores access',async()=>{
 const {DB,sqlite}=database();seed(sqlite);sqlite.prepare('UPDATE profiles SET contact_json=? WHERE member_id=?').run(JSON.stringify({name:'Synthetic private contact',email:'private@example.test',optIn:true,visibility:'Family leaders'}),'alice');
 const env={DB,BETTER_AUTH_SECRET:'synthetic-member-view-secret',AUTH_ORIGIN:'https://family.example.test'};
 const app=createApp(()=>({api:{getSession:async({headers})=>{const id=headers.get('Cookie')?.split('=')[1];return ['owner','alice'].includes(id)?{user:{id,emailVerified:true}}:null}}}));
 const call=async(path,{view=false,user='owner',method='GET',body}={})=>{const res=await app.request(env.AUTH_ORIGIN+path,{method,headers:{Cookie:'fixture='+user,Origin:env.AUTH_ORIGIN,...(view?{'X-GW-Member-View':'true','X-GW-Member-View-Account':user}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env);return {status:res.status,value:await res.json()}};
 assert.equal((await call('/api/directory')).value.cards.some(c=>c.email==='private@example.test'),true);
 assert.equal((await call('/api/directory',{view:true})).value.cards.some(c=>c.email==='private@example.test'),false);
 assert.equal((await call('/api/calendar')).status,200);assert.equal((await call('/api/calendar',{view:true})).status,403);
 assert.equal((await call('/api/session',{view:true})).value.canViewAsMember,true);
 const state=await call('/api/state',{view:true});assert.equal(state.status,200);assert.equal(state.value.viewAsMember,true);assert.equal(state.value.capabilities.editPages,false);assert.equal(state.value.capabilities.manageCalendar,false);
 assert.equal((await call('/api/commands',{view:true,method:'POST',body:{type:'DETAILS',details:{location:'must not save'}}})).status,403);
 assert.equal((await call('/api/directory',{view:true,user:'alice'})).status,403);
 assert.equal(sqlite.prepare('SELECT roles_json,is_leader FROM members WHERE id=?').get('owner').is_leader,1);assert.match(sqlite.prepare('SELECT roles_json FROM members WHERE id=?').get('owner').roles_json,/admin/);
 assert.equal((await call('/api/calendar')).status,200);
});
