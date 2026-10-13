import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
test('real auth plugin verifies one-use email code, enrolls owner and gates another member',async()=>{
 const {DB,sqlite}=database(),mail=[];
 const env={D1:DB,PAYLOAD_SECRET:'synthetic-local-test-secret-not-used-in-any-service',AUTH_ORIGIN:'https://family.example.test',AUTH_EMAIL_ENABLED:'true',BOOTSTRAP_OWNER_EMAIL:'owner@example.test',EMAIL:{send:async value=>mail.push(value)}};
 const app=createApp();
 const request=(path,body,cookie='')=>app.request(env.AUTH_ORIGIN+path,{method:body?'POST':'GET',headers:{Origin:env.AUTH_ORIGIN,'Content-Type':'application/json',Cookie:cookie,'cf-connecting-ip':'192.0.2.1'},...(body?{body:JSON.stringify(body)}:{})},env);
 async function signin(email){
  const send=await request('/api/auth/email-otp/send-verification-otp',{email,type:'sign-in'});assert.equal(send.status,200,await send.clone().text());
  const otp=mail.at(-1).text.match(/\b\d{6}\b/)[0];const login=await request('/api/auth/sign-in/email-otp',{email,otp,name:email.split('@')[0]});assert.equal(login.status,200,await login.clone().text());
  const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookie.includes('session_token'));assert.match(login.headers.getSetCookie().join(' '),/Secure/);assert.match(login.headers.getSetCookie().join(' '),/HttpOnly/);
  const replay=await request('/api/auth/sign-in/email-otp',{email,otp});assert.ok(replay.status>=400);
  return cookie;
 }
 const cookie=await signin('owner@example.test');const session=await(await request('/api/session',null,cookie)).json();assert.equal(session.status,'new');
 const enroll=await request('/api/enroll',{name:'Test Owner',birthday:'1990-01-01',privacyAccepted:true,birthdayCelebration:false},cookie);assert.equal(enroll.status,200,await enroll.clone().text());
 assert.equal((await request('/api/state',null,cookie)).status,200);
 const other=await signin('relative@example.test');assert.equal((await request('/api/enroll',{name:'Test Relative',birthday:'1990-01-01',privacyAccepted:true},other)).status,200);assert.equal((await request('/api/state',null,other)).status,403);
 const logout=await request('/api/auth/sign-out',{},cookie);assert.equal(logout.status,200);assert.equal((await request('/api/state',null,cookie)).status,401);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user').get().n,2);
});
