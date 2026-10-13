// Dependency-backed canonical CI only. All identities and email deliveries are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {betterAuth} from 'better-auth';
import {generateKeyPair,SignJWT} from 'jose';
import {microsoftAccess,verifyMicrosoftAccess} from '../src/microsoft-access.mjs';
import {database} from './test-db.mjs';
const origin='https://family.example.test',tid='9188040d-6c67-4c5b-b112-36a304b66dad',oid='12345678-1111-2222-3333-123456789abc',aud='b'.repeat(64);
test('Microsoft proof bridge works through actual Better Auth request parsing and secure sessions',async()=>{
 const {DB,sqlite}=database(),sent=[];
 const env={DB,AUTH_ORIGIN:origin,BETTER_AUTH_SECRET:'synthetic-only-mailbox-integration-secret',AUTH_EMAIL_ENABLED:'true',EMAIL:{},AUTH_MICROSOFT_ACCESS_ENABLED:'true',AUTH_MICROSOFT_ACCESS_AUD:aud};
 const auth=betterAuth({database:DB,secret:env.BETTER_AUTH_SECRET,baseURL:origin,trustedOrigins:[origin],account:{accountLinking:{enabled:false}},advanced:{useSecureCookies:true},plugins:[microsoftAccess(env,{consumeRate:async()=>({allowed:true}),verify:async()=>({accountId:tid+':'+oid,name:'Alex White',emailHint:'hint@example.test'}),sendCode:async(email,code)=>sent.push({email,code})})]});
 const jar=new Map();async function req(path,{body,csrf}={}){const r=await auth.handler(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(csrf?{'X-GW-Auth-CSRF':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})}));for(const item of r.headers.getSetCookie()){const [pair]=item.split(';'),i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}return r}
 async function begin(){const r=await req('/api/auth/sign-in/cloudflare-microsoft',{body:{}});assert.equal(r.status,200,await r.clone().text());const u=new URL((await r.json()).url);return req(u.pathname+u.search)}
 assert.equal((await begin()).status,302);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,0);const status=await (await req('/api/auth/microsoft-proof/status')).json();
 const send=await req('/api/auth/microsoft-proof/send-code',{csrf:status.csrf,body:{email:'relative@example.test'}});assert.equal(send.status,200,await send.clone().text());assert.equal(sent.length,1);const proof=await send.json();
 assert.equal((await req('/api/auth/microsoft-proof/complete',{csrf:status.csrf,body:{code:sent[0].code,connectMicrosoft:false,email:proof.email,generation:proof.generation}})).status,400);
 const done=await req('/api/auth/microsoft-proof/complete',{csrf:status.csrf,body:{code:sent[0].code,connectMicrosoft:true,email:proof.email,generation:proof.generation}});assert.equal(done.status,200,await done.clone().text());assert.match(done.headers.getSetCookie().join(' '),/HttpOnly/);assert.match(done.headers.getSetCookie().join(' '),/Secure/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM members').get().n,0);assert.equal(sqlite.prepare('SELECT email FROM user').get().email,'relative@example.test');const again=await begin();assert.equal(again.headers.get('location'),origin);assert.equal(sent.length,1);
});
test('Microsoft signed stable claims are validated without assuming email_verified exists',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const sign=changes=>new SignJWT({type:'app',sub:'access-sub',iss:'https://loewfi.cloudflareaccess.com',aud,exp:Math.floor(Date.now()/1000)+60,custom:{tid,oid,name:'Alex White'},...changes}).setProtectedHeader({alg:'RS256'}).sign(privateKey);
 assert.equal((await verifyMicrosoftAccess(await sign(),aud,publicKey)).accountId,tid+':'+oid);
 for(const changes of [{aud:'wrong'},{iss:'https://attacker.example'},{exp:1},{type:'org'},{custom:{tid,oid:'mutable-email@example.test'}},{custom:{tid:'enterprise',oid}}])await assert.rejects(verifyMicrosoftAccess(await sign(changes),aud,publicKey));
});
