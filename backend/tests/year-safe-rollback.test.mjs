import test from 'node:test';
import assert from 'node:assert/strict';
import {yearSafeRollback} from '../src/year-safe-rollback.mjs';
import {createApp} from '../src/worker.mjs';
import {database,seed} from './test-db.mjs';
import {command} from '../src/family-service.mjs';
test('prior-client recovery keeps legacy reads separate after new-year writes and blocks mutations',async()=>{
 const {DB,sqlite}=database();seed(sqlite);
 const owner={id:'owner',status:'active',group:'family',roles:['admin','planner','treasurer'],isLeader:true},member={id:'alice',status:'active',group:'family',roles:[],canPost:true};
 const write=(actor,type,extra={})=>command(DB,actor,{type,requestId:crypto.randomUUID(),...extra});
 await write(owner,'CREATE_REUNION',{year:2028});await write(owner,'SET_PAYMENT',{reunionId:'legacy',value:{amount:'$50'}});await write(owner,'SET_PAYMENT',{reunionId:'reunion-2028',value:{amount:'$90'}});
 await write(member,'RSVP',{reunionId:'legacy',value:{status:'Planning to come',count:2}});await write(member,'RSVP',{reunionId:'reunion-2028',value:{status:'Planning to come',count:4}});await write(owner,'ACTIVATE_REUNION',{id:'reunion-2028',archivePrevious:true});
 let signouts=0;
 const app=createApp(()=>({api:{getSession:async()=>({user:{id:'alice',email:'alice@example.test',emailVerified:true}})},handler:async()=>{signouts++;return Response.json({ok:true})}}));
 const recovery=yearSafeRollback({fetch:(...args)=>app.fetch(...args),scheduled(){throw Error('Recovery must not schedule writes')}}),env={DB,BETTER_AUTH_SECRET:'synthetic-only-secret-xxxxxxxxxxx',AUTH_ORIGIN:'https://family.example.test',FAMILY_INVITATIONS_ENABLED:'true',LAUNCH_PROVISIONAL_READ_ENABLED:'true'},ctx={waitUntil(){throw Error('No background delivery during recovery')}};
 const request=(path,method='GET')=>recovery.fetch(new Request('https://family.example.test'+path,{method,headers:{Origin:env.AUTH_ORIGIN}}),env,ctx);
 for(const path of ['/api/state','/api/state?reunionId=reunion-2028']){const response=await request(path);assert.equal(response.status,200);const data=await response.json();assert.equal(data.selectedReunionId,'legacy');assert.equal(data.payment.amount,'$50');assert.equal(data.rsvp.count,2)}
 const receipts=sqlite.prepare('SELECT count(*) n FROM command_receipts').get().n;
 for(const [path,method] of [['/api/commands','POST'],['/api/posts','POST'],['/api/family-invitations','POST'],['/api/media','POST'],['/api/me/favorites/bob','PUT'],['/api/me/favorites/bob','DELETE'],['/api/auth/sign-in/email','POST'],['/api/auth/callback/google','GET']])assert.equal((await request(path,method)).status,503);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM command_receipts').get().n,receipts);assert.equal(sqlite.prepare("SELECT count FROM reunion_rsvps WHERE reunion_id='reunion-2028' AND member_id='alice'").get().count,4);
 assert.equal((await (await request('/api/config')).json()).familyInvitations,false);assert.equal((await request('/api/auth/sign-out','POST')).status,200);assert.equal(signouts,1);recovery.scheduled({},env,ctx);sqlite.close();
});
