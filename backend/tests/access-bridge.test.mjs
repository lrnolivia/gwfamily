import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessBridge} from '../src/access-bridge.mjs';
import {accessProviderConfig} from '../src/auth-providers.mjs';
const origin='https://family.example.test';
function harness(id='microsoft'){
 const entries=new Map(),cookies=new Map(),users=[],accounts=[],sessions=[];
 const env={EMAIL:{},AUTH_EMAIL_ENABLED:'true',AUTH_ORIGIN:origin,[`AUTH_${id.toUpperCase()}_ACCESS_AUD`]:'b'.repeat(64),[`AUTH_${id.toUpperCase()}_ACCESS_ENABLED`]:'true',DB:{prepare(sql){return{bind(...values){return{async run(){assert.match(sql,/^INSERT INTO verification/);entries.set(values[1],{id:values[0],value:values[2],expires:values[3]})},async first(){assert.match(sql,/^DELETE FROM verification/);const row=entries.get(values[0]);if(!row||row.value!==values[1]||row.expires<=values[2])return null;entries.delete(values[0]);return row}}}}}}};
 let identity={sub:'person-id',email:'person@example.test',name:'Alex White'},owned=null,existing=null,verifiedAudience=null;
 class APIError extends Error{constructor(code,detail){super(detail.message);this.code=code}}
 const adapter={async findAccountOwnerByKey(key){accounts.push(key);return owned},async findUserByEmail(){return existing},async createOAuthUser(user,account){users.push(user);accounts.push(account);return{user:{id:'created',...user}}},async createSession(id){sessions.push(id);return{id:'session',userId:id}}};
 const plugin=buildAccessBridge(env,accessProviderConfig(env,id),{createAuthEndpoint:(path,options,handler)=>({path,options,handler}),APIError,setSessionCookie:async(ctx,data)=>{ctx.session=data},verify:async(token,audience)=>{verifiedAudience=audience;if(token!=='synthetic-proof')throw Error('invalid');return identity}});
 const [start,finish]=Object.values(plugin.endpoints);
 const context=(url,method='GET',from=origin,token='synthetic-proof')=>({request:new Request(url,{method,headers:{Origin:from,'cf-access-jwt-assertion':token}}),context:{internalAdapter:adapter},setCookie:(name,value,options)=>cookies.set(name,{value,options}),getCookie:name=>cookies.get(name)?.value,json:x=>x,redirect:location=>({redirect:location})});
 async function begin(){return start.handler(context(origin+'/api/auth'+start.path,'POST'))}
 async function complete(url,token){const ctx=context(url,'GET',origin,token);await assert.rejects(finish.handler(ctx),error=>error.redirect===origin);return ctx}
 return{env,plugin,start,finish,context,begin,complete,cookies,entries,users,accounts,sessions,setIdentity:value=>identity=value,setOwned:value=>owned=value,setExisting:value=>existing=value,audience:()=>verifiedAudience};
}
test('bridge uses isolated callback/cookie/state and verified audience, then consumes state once',async()=>{
 const h=harness(),r=await h.begin(),u=new URL(r.url);assert.equal(u.pathname,'/api/auth/callback/cloudflare-microsoft');
 assert.equal(h.cookies.get('__Host-gw_microsoft_state').options.httpOnly,true);assert.equal(h.cookies.get('__Host-gw_microsoft_state').options.secure,true);
 const ctx=await h.complete(r.url);assert.equal(h.audience(),'b'.repeat(64));assert.equal(ctx.session.user.name,'Alex White');assert.equal(h.users[0].emailVerified,true);
 assert.equal(h.accounts[0].providerId,'cloudflare-microsoft');assert.equal(h.entries.size,0);assert.equal(h.sessions.length,1);
 await assert.rejects(h.finish.handler(h.context(r.url)),/expired/);
});
test('bad origin, missing/wrong cookie and invalid proof cannot create an account',async()=>{
 const h=harness();await assert.rejects(h.start.handler(h.context(origin,'POST','https://evil.example')),/family website/);
 const r=await h.begin();await assert.rejects(h.finish.handler(h.context(r.url,'GET',origin,'forged')),/could not be verified/);
 assert.equal(h.entries.size,1);h.cookies.clear();await assert.rejects(h.finish.handler(h.context(r.url)),/expired/);assert.equal(h.users.length,0);
});
test('state expires and cross-provider state value is rejected',async()=>{
 const h=harness('yahoo'),r=await h.begin();for(const row of h.entries.values())row.value='google';await assert.rejects(h.finish.handler(h.context(r.url)),/used or expired/);assert.equal(h.sessions.length,0);
 for(const row of h.entries.values()){row.value='yahoo';row.expires=1}await assert.rejects(h.finish.handler(h.context(r.url)),/used or expired/);
});
test('missing display name stays empty; returning user retains edited name',async()=>{
 const h=harness();h.setIdentity({sub:'person-id',email:'person@example.test'});await h.complete((await h.begin()).url);assert.equal(h.users[0].name,'');
 const r=harness();r.setOwned({kind:'owned',user:{id:'existing',name:'Chosen Name',email:'person@example.test'}});const ctx=await r.complete((await r.begin()).url);assert.equal(ctx.session.user.name,'Chosen Name');assert.equal(r.users.length,0);
});
test('same email never silently links to another provider or creates membership',async()=>{
 const h=harness();h.setExisting({user:{id:'email-owner'}});await assert.rejects(h.finish.handler(h.context((await h.begin()).url)),/not linked automatically/);assert.equal(h.users.length,0);assert.equal(h.sessions.length,0);
 const r=harness();r.setOwned({kind:'conflict'});await assert.rejects(r.finish.handler(r.context((await r.begin()).url)),/recovery/);assert.equal(r.users.length,0);
});
