import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {createApp} from '../src/worker.mjs';import {command} from '../src/family-service.mjs';
// Fictional addresses; EMAIL is an in-memory stub, nothing leaves the test.
function fixture(flags={}){const {DB,sqlite}=database();seed(sqlite);sqlite.exec("INSERT INTO profiles(member_id,birthday,completed) VALUES('pending','1990-01-01',1)");let account='alice',verified=true;const messages=[];const env={DB,BETTER_AUTH_SECRET:'test-only-secret-that-is-never-production',AUTH_ORIGIN:'https://family.example.test',FAMILY_INVITATIONS_ENABLED:'true',EMAIL:{send:async message=>messages.push(message)},...flags};const app=createApp(()=>({api:{getSession:async()=>account?{user:{id:account,email:account+'@example.test',emailVerified:verified},session:{id:'test-session-'+account}}:null}}));const request=(path,body,method=body?'POST':'GET',origin=env.AUTH_ORIGIN)=>app.request('https://family.example.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env);return {DB,sqlite,env,messages,request,as:(id,value=true)=>{account=id;verified=value}}}
const json=async r=>({status:r.status,data:await r.json()});
const age=(f,table,id)=>f.sqlite.prepare(`UPDATE ${table} SET created_at=? WHERE id=?`).run(table==='family_invitations'?Date.now()-3600000:'2020-01-01 00:00:00',id);
test('sent invitations list, duplicate protection, revoke and safe resend for family email invitations',async()=>{
 const f=fixture();const first=await json(await f.request('/api/family-invitations',{expectedAccountId:'alice',email:'cousin@example.test',sendEmail:true}));assert.equal(first.status,201);
 assert.match(f.messages[0].html,/content="light dark"/);assert.match(f.messages[0].subject,/invited/);assert.ok(f.messages[0].text.includes(first.data.url));
 assert.equal((await f.request('/api/family-invitations',{expectedAccountId:'alice',email:'cousin@example.test',sendEmail:true})).status,409,'no second live invite to the same address');
 let sent=(await json(await f.request('/api/invitations/sent'))).data;assert.deepEqual(sent.invitations.map(i=>[i.email,i.status]),[['cousin@example.test','pending']]);assert.equal(JSON.stringify(sent).includes(first.data.url),false,'tokens are never listed');
 assert.equal((await f.request('/api/invitations/resend',{expectedAccountId:'alice',kind:'family',id:first.data.id})).status,429,'resend waits a few minutes');
 age(f,'family_invitations',first.data.id);
 const resent=await json(await f.request('/api/invitations/resend',{expectedAccountId:'alice',kind:'family',id:first.data.id}));assert.equal(resent.status,200);assert.equal(f.messages.length,2);
 sent=(await json(await f.request('/api/invitations/sent'))).data;assert.deepEqual(sent.invitations.map(i=>i.status).sort(),['pending','revoked'],'the old link ends when a new one is sent');
 f.as('bob');assert.equal((await f.request('/api/invitations/revoke',{expectedAccountId:'bob',kind:'family',id:resent.data.id})).status,404,'only the sender manages it');
 f.as('alice');assert.equal((await f.request('/api/invitations/revoke',{expectedAccountId:'alice',kind:'family',id:resent.data.id})).status,200);
 sent=(await json(await f.request('/api/invitations/sent'))).data;assert.deepEqual(sent.invitations.map(i=>i.status),['revoked','revoked']);
 assert.equal((await f.request('/api/family-invitations',{expectedAccountId:'alice',email:'cousin@example.test'})).status,201,'after revoking, a fresh invite is allowed');
});
test('household email invitations: duplicate protection, resend by a current head, and one-use acceptance',async()=>{
 const f=fixture();const actor=id=>({id,status:'active',group:'family',roles:[],canPost:true,isLeader:false});
 const h=await command(f.DB,actor('alice'),{type:'CREATE_HOUSEHOLD',name:'Fictional Oak household',requestId:crypto.randomUUID()});
 const first=await json(await f.request('/api/household-invites',{householdId:h.id,email:'bob@example.test',sendEmail:true}));assert.equal(first.status,200);assert.match(f.messages[0].subject,/Fictional Oak household/);
 assert.equal((await f.request('/api/household-invites',{householdId:h.id,email:'bob@example.test',sendEmail:true})).status,409);
 const listed=(await json(await f.request('/api/invitations/sent'))).data.invitations.find(i=>i.kind==='household');age(f,'household_email_invites',listed.id);
 const resent=await json(await f.request('/api/invitations/resend',{expectedAccountId:'alice',kind:'household',id:listed.id}));assert.equal(resent.status,200);
 const token=f.messages[1].text.match(/household-invite\/([a-f0-9]{64})/)[1],old=f.messages[0].text.match(/household-invite\/([a-f0-9]{64})/)[1];
 f.as('bob');assert.equal((await f.request('/api/household-invites/accept',{token:old})).status,404,'the replaced link no longer works');
 assert.equal((await f.request('/api/household-invites/accept',{token})).status,200);
 assert.equal((await f.request('/api/household-invites/accept',{token})).status,404,'one use only');
});
test('a person can withdraw their own waiting household request',async()=>{
 const f=fixture();const actor=id=>({id,status:'active',group:'family',roles:[],canPost:true,isLeader:false}),send=(id,input)=>command(f.DB,actor(id),{requestId:crypto.randomUUID(),...input});
 const h=await send('alice',{type:'CREATE_HOUSEHOLD',name:'Fictional Oak household'});const r=await send('bob',{type:'REQUEST_HOUSEHOLD_JOIN',householdId:h.id});
 await assert.rejects(()=>send('alice',{type:'CANCEL_HOUSEHOLD_REQUEST',id:r.id}),e=>e.status===403);
 f.as('bob');assert.equal((await json(await f.request('/api/invitations/sent'))).data.requests.length,1);
 await send('bob',{type:'CANCEL_HOUSEHOLD_REQUEST',id:r.id});assert.equal((await json(await f.request('/api/invitations/sent'))).data.requests.length,0);
 await assert.rejects(()=>send('alice',{type:'RESOLVE_HOUSEHOLD_REQUEST',id:r.id,accept:true}),e=>e.status===404);
});
