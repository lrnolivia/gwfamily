import test from 'node:test';
import assert from 'node:assert/strict';
import {betterAuth} from 'better-auth';
import {generateKeyPair,SignJWT} from 'jose';
import {googleAccess,verifyGoogleAccess} from '../src/google-access.mjs';
import {database} from './test-db.mjs';
const origin='https://family.example.test';
test('Google Access JWT requires correct signature, issuer, audience, expiry and identity',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const sign=(changes={})=>new SignJWT({email:'relative@example.test',sub:'google-person',iss:'https://loewfi.cloudflareaccess.com',aud:'gw-only',exp:Math.floor(Date.now()/1000)+60,...changes}).setProtectedHeader({alg:'RS256'}).sign(privateKey);
 assert.equal((await verifyGoogleAccess(await sign(),'gw-only',publicKey)).email,'relative@example.test');
 for(const changes of [{aud:'another-app'},{iss:'https://attacker.example'},{exp:1},{email:'non_identity@example.test'},{sub:''}])await assert.rejects(verifyGoogleAccess(await sign(changes),'gw-only',publicKey));
 const other=await generateKeyPair('RS256');await assert.rejects(verifyGoogleAccess(await sign(),'gw-only',other.publicKey));
});
test('Google bridge binds one-use state, creates secure session, and never links by email',async()=>{
 const {DB,sqlite}=database();
 const env={DB,AUTH_ORIGIN:origin,AUTH_GOOGLE_ACCESS_AUD:'test-audience'};
 const auth=betterAuth({database:DB,secret:'synthetic-test-only-google-auth-secret',baseURL:origin,trustedOrigins:[origin],advanced:{useSecureCookies:true},plugins:[googleAccess(env,async token=>{if(token!=='signed-test-identity')throw Error('invalid');return {sub:'google-person',email:'relative@example.test'}})]});
 const req=(path,{body,cookie='',token='signed-test-identity',from=origin}={})=>auth.handler(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:from,'Content-Type':'application/json',Cookie:cookie,'cf-access-jwt-assertion':token},...(body?{body:JSON.stringify(body)}:{})}));
 async function begin(){const r=await req('/api/auth/sign-in/cloudflare-google',{body:{}});assert.equal(r.status,200,await r.clone().text());const url=new URL((await r.json()).url);return {path:url.pathname+url.search,cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')}}
 assert.ok((await req('/api/auth/sign-in/cloudflare-google',{body:{},from:'https://evil.example'})).status>=400);
 const first=await begin();assert.ok((await req(first.path,{cookie:'wrong'})).status>=400);assert.ok((await req(first.path,{cookie:first.cookie,token:'forged'})).status>=400);
 const login=await req(first.path,first);assert.equal(login.status,302,await login.clone().text());assert.equal(login.headers.get('location'),origin);assert.match(login.headers.getSetCookie().join(' '),/HttpOnly/);assert.match(login.headers.getSetCookie().join(' '),/Secure/);
 assert.ok((await req(first.path,first)).status>=400);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM members').get().n,0);
 const returning=await begin();assert.equal((await req(returning.path,returning)).status,302);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,1);
 sqlite.exec('DELETE FROM session;DELETE FROM account;');const collision=await begin();assert.equal((await req(collision.path,collision)).status,409);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM session').get().n,0);
 const expired=await begin();sqlite.exec('UPDATE verification SET expiresAt=1');assert.ok((await req(expired.path,expired)).status>=400);
});
