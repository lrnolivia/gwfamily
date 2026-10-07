import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createMicrosoftProofStore,codeDigest,pendingCookie,microsoftProviderId} from '../src/microsoft-proof-store.mjs';
import {microsoftIdentityFromVerifiedClaims} from '../src/microsoft-proof-identity.mjs';
import {buildMicrosoftProofFlow} from '../src/microsoft-proof-flow.mjs';
const origin='https://family.example.test',tid='9188040d-6c67-4c5b-b112-36a304b66dad',oid='12345678-1111-2222-3333-123456789abc';
function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,emailVerified INTEGER NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL); CREATE TABLE account(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,providerId TEXT NOT NULL,userId TEXT NOT NULL REFERENCES user(id),createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL); CREATE TABLE verification(id TEXT PRIMARY KEY,identifier TEXT NOT NULL,value TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL); CREATE TABLE members(id TEXT PRIMARY KEY,status TEXT,roles_json TEXT);');
 const statement=(sql,args=[])=>({bind:(...values)=>statement(sql,values),async first(){return sqlite.prepare(sql).get(...args)||null},async run(){return sqlite.prepare(sql).run(...args)}});
 let queue=Promise.resolve();const DB={prepare:sql=>statement(sql),batch(statements){const result=queue.then(async()=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(error){sqlite.exec('ROLLBACK');throw error}});queue=result.catch(()=>{});return result}};return{DB,sqlite};
}
function harness(){
 const {DB,sqlite}=database(),cookies=new Map(),messages=[],sessions=[];let time=1000000,rateAllowed=true,sendFailure=false,identity={accountId:tid+':'+oid,name:'Alex White',emailHint:'hint@example.test'};
 const env={DB,AUTH_ORIGIN:origin,AUTH_MICROSOFT_ACCESS_AUD:'b'.repeat(64),BETTER_AUTH_SECRET:'synthetic-only-mailbox-test-secret'},store=createMicrosoftProofStore(DB,()=>time);
 class APIError extends Error{constructor(code,{message}){super(message);this.code=code}}
 const plugin=buildMicrosoftProofFlow(env,{createAuthEndpoint:(path,options,handler)=>({path,options,handler}),APIError,setSessionCookie:async(ctx,data)=>{ctx.session=data;sessions.push(data)},verify:async(token,aud)=>{assert.equal(aud,env.AUTH_MICROSOFT_ACCESS_AUD);if(token!=='synthetic-proof')throw Error('invalid');return identity},consumeRate:async()=>({allowed:rateAllowed}),sendCode:async(email,code)=>{if(sendFailure)throw Error('synthetic send failure');messages.push({email,code})},store,now:()=>time});
 const ctx=(path,{method='POST',body={},from=origin,csrf='',token='synthetic-proof'}={})=>({request:new Request(origin+path,{method,headers:{Origin:from,'X-GW-Auth-CSRF':csrf,'cf-access-jwt-assertion':token}}),body,context:{internalAdapter:{async createSession(userId){return{id:'session',userId}}}},setCookie:(key,value)=>cookies.set(key,value),getCookie:key=>cookies.get(key),json:value=>value,redirect:location=>({redirect:location})});
 const endpoint=name=>plugin.endpoints[name].handler;
 async function begin(){const r=await endpoint('startMicrosoftAccess')(ctx('/api/auth/sign-in/cloudflare-microsoft'));const u=new URL(r.url);const c=ctx(u.pathname+u.search,{method:'GET'});try{await endpoint('finishMicrosoftAccess')(c)}catch(error){assert.ok(error.redirect);return{redirect:error.redirect,context:c,path:u.pathname+u.search}}throw Error('missing redirect')}
 async function status(){return endpoint('microsoftProofStatus')(ctx('/api/auth/microsoft-proof/status',{method:'GET'}))}
 async function send(email='person@example.test'){const p=await status();return endpoint('sendMicrosoftProofCode')(ctx('/api/auth/microsoft-proof/send-code',{csrf:p.csrf,body:{email}}))}
 async function complete(code=messages.at(-1)?.code,consent=true){const p=await status(),c=ctx('/api/auth/microsoft-proof/complete',{csrf:p.csrf,body:{code,connectMicrosoft:consent,email:p.email,generation:p.generation}});const result=await endpoint('completeMicrosoftProof')(c);return{result,context:c}}
 return{sqlite,DB,env,store,cookies,messages,sessions,ctx,endpoint,begin,status,send,complete,advance:n=>time+=n,setIdentity:value=>identity=value,setRateAllowed:value=>rateAllowed=value,setSendFailure:value=>sendFailure=value};
}
test('Microsoft verified claims use immutable personal oid/tid; email is only a suggestion',()=>{
 const p={type:'app',sub:'access-sub',email:'Hint@example.test',custom:{tid,oid,name:'Alex White'}};
 assert.deepEqual(microsoftIdentityFromVerifiedClaims(p),{accountId:tid+':'+oid,name:'Alex White',emailHint:'hint@example.test'});
 assert.equal(microsoftIdentityFromVerifiedClaims({...p,sub:'changed-access-sub',email:'changed@example.test'}).accountId,tid+':'+oid);
 assert.equal(microsoftIdentityFromVerifiedClaims({...p,email:undefined}).emailHint,'');
 for(const changes of [{tid:'enterprise'},{oid:undefined},{oid:'email@example.test'}])assert.throws(()=>microsoftIdentityFromVerifiedClaims({...p,custom:{...p.custom,...changes}}));
});
test('first sign-in creates only a pending proof, verifies an editable mailbox, then creates one linked account',async()=>{
 const h=harness();assert.equal((await h.begin()).redirect,origin+'/?auth=microsoft-verify');
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,0);assert.equal(h.messages.length,0);assert.equal(h.sessions.length,0);
 await h.send('actual@example.test');assert.equal(h.messages.length,1);const raw=h.sqlite.prepare('SELECT value FROM verification').get().value;assert.ok(!raw.includes(h.messages[0].code));
 const done=await h.complete();assert.equal(done.result.complete,true);assert.equal(done.context.session.user.email,'actual@example.test');assert.equal(done.context.session.user.name,'Alex White');
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM account').get().n,1);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM members').get().n,0);
 await assert.rejects(h.complete(),/expired/);
});
test('existing verified account needs explicit consent and keeps chosen name, membership and permissions',async()=>{
 const h=harness();h.sqlite.exec("INSERT INTO user VALUES('owner','Chosen Name','owner@example.test',1,0,0);INSERT INTO members VALUES('owner','active','[\"admin\"]');");
 await h.begin();await h.send('owner@example.test');await assert.rejects(h.complete(undefined,false),/Confirm/);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM account').get().n,0);
 const done=await h.complete();assert.equal(done.context.session.user.id,'owner');assert.equal(done.context.session.user.name,'Chosen Name');assert.equal(h.sqlite.prepare('SELECT roles_json FROM members').get().roles_json,'["admin"]');
});
test('returning sign-in uses immutable identity without OTP, even if provider email/name changed',async()=>{
 const h=harness();await h.begin();await h.send();await h.complete();h.setIdentity({accountId:tid+':'+oid,emailHint:'changed@example.test',name:'Different Provider Name'});
 const r=await h.begin();assert.equal(r.redirect,origin);assert.equal(h.messages.length,1);assert.equal(r.context.session.user.email,'person@example.test');assert.equal(r.context.session.user.name,'Alex White');
});
test('wrong origin, CSRF, replay and three concurrent wrong guesses cannot finish or create accounts',async()=>{
 const h=harness();await assert.rejects(h.endpoint('startMicrosoftAccess')(h.ctx('/',{from:'https://evil.example'})),/family website/);const b=await h.begin();await assert.rejects(h.endpoint('finishMicrosoftAccess')(h.ctx(b.path,{method:'GET'})),/expired/);
 const p=await h.status();await assert.rejects(h.endpoint('sendMicrosoftProofCode')(h.ctx('/',{csrf:'wrong',body:{email:'person@example.test'}})),/Refresh/);await h.send();
 const wrong=h.messages[0].code==='000000'?'111111':'000000';await Promise.allSettled(Array.from({length:10},()=>h.complete(wrong)));
 const row=await h.store.read(h.cookies.get(pendingCookie));assert.equal(row.data.attempts,3);await assert.rejects(h.complete(),/attempt limit/);assert.equal(h.sessions.length,0);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,0);
});
test('replacement code invalidates earlier proof, cancellation clears pending identity, and expiry fails closed',async()=>{
 const h=harness();await h.begin();await h.send('first@example.test');const first=h.messages[0].code;await assert.rejects(h.send(),/Wait a minute/);h.advance(61000);await h.send('second@example.test');await assert.rejects(h.complete(first),/did not match/);
 const p=await h.status();await h.endpoint('cancelMicrosoftProof')(h.ctx('/',{csrf:p.csrf}));await assert.rejects(h.status(),/expired/);assert.equal(h.sessions.length,0);
 await h.begin();h.advance(600001);await assert.rejects(h.status(),/expired/);
});
test('pre-account creation and cross-mailbox identity relinking are blocked',async()=>{
 const h=harness();await h.begin();await h.send('victim@example.test');assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,0);
 await h.complete();const original=h.sqlite.prepare('SELECT userId FROM account').get().userId;
 await assert.rejects(h.store.finalize({accountId:tid+':'+oid,email:'other@example.test',name:'Other'}),/already connected/);
 assert.equal(h.sqlite.prepare('SELECT userId FROM account').get().userId,original);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,1);
});
test('unverified existing users are never silently activated by linking',async()=>{
 const h=harness();h.sqlite.exec("INSERT INTO user VALUES('pending','Old','person@example.test',0,0,0)");await h.begin();await h.send();await assert.rejects(h.complete(),/Sign in with an email code/);assert.equal(h.sqlite.prepare('SELECT emailVerified FROM user').get().emailVerified,0);assert.equal(h.sessions.length,0);
});
test('concurrent proof completions for one identity cannot create duplicate accounts',async()=>{
 const h=harness();await Promise.all([h.store.finalize({accountId:tid+':'+oid,email:'person@example.test',name:'Name'}),h.store.finalize({accountId:tid+':'+oid,email:'person@example.test',name:'Name'})]);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM account').get().n,1);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM user').get().n,1);
});
test('a stale tab cannot confirm a different email or replacement proof generation',async()=>{
 const h=harness();await h.begin();await h.send('first@example.test');const old=await h.status();h.advance(61000);await h.send('second@example.test');const fresh=await h.status();
 await assert.rejects(h.endpoint('completeMicrosoftProof')(h.ctx('/',{csrf:old.csrf,body:{code:h.messages.at(-1).code,connectMicrosoft:true,email:old.email,generation:old.generation}})),/another tab/);
 assert.equal((await h.store.read(h.cookies.get(pendingCookie))).data.attempts,0);const done=await h.complete();assert.equal(done.context.session.user.email,fresh.email);
});
test('delivery failure is not presented as code sent, retains limits, and can be retried later',async()=>{
 const h=harness();await h.begin();h.setSendFailure(true);await assert.rejects(h.send(),/could not be sent/);const failed=await h.status();assert.equal(failed.codeSent,false);assert.equal(failed.delivery,'failed');await assert.rejects(h.send(),/Wait a minute/);
 h.advance(61000);h.setSendFailure(false);await h.send();assert.equal((await h.status()).codeSent,true);await h.complete();
});
test('rate denial prevents mail and near-expiry proofs require starting again',async()=>{
 const h=harness();await h.begin();h.setRateAllowed(false);await assert.rejects(h.send(),/Too many/);assert.equal(h.messages.length,0);h.setRateAllowed(true);h.advance(541000);await assert.rejects(h.send(),/nearly expired/);assert.equal(h.messages.length,0);
});
test('two concurrent full completion endpoints issue only one session',async()=>{
 const h=harness();await h.begin();await h.send();const results=await Promise.allSettled([h.complete(),h.complete()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.sessions.length,1);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM account').get().n,1);
});
test('ambiguous existing Microsoft owners fail closed and expired transient proofs are cleaned on next start',async()=>{
 const h=harness();h.sqlite.exec(`INSERT INTO user VALUES('a','A','a@example.test',1,0,0),('b','B','b@example.test',1,0,0);INSERT INTO account VALUES('one','${tid}:${oid}','${microsoftProviderId}','a',0,0),('two','${tid}:${oid}','${microsoftProviderId}','b',0,0);`);await assert.rejects(h.store.owner(tid+':'+oid),/recovery/);
 const n=harness();await n.store.create({accountId:'synthetic-subject'});n.advance(600001);await n.store.create({accountId:'next-subject'});assert.equal(n.sqlite.prepare('SELECT COUNT(*) n FROM verification').get().n,1);
});
test('a resend racing attempt reservation cannot consume the replacement generation guess budget',async()=>{
 const h=harness();await h.begin();await h.send('first@example.test');const attempt=h.store.attempt.bind(h.store);let intercepted=false;
 h.store.attempt=async(token,expected)=>{if(!intercepted){intercepted=true;h.advance(61000);await h.send('second@example.test')}return attempt(token,expected)};
 await assert.rejects(h.complete(),/expired|attempt limit/);const row=await h.store.read(h.cookies.get(pendingCookie));assert.equal(row.data.email,'second@example.test');assert.equal(row.data.attempts,0);await h.complete();
});
