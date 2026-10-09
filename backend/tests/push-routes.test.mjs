import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {createApp} from '../src/worker.mjs';
import {runtimeReady,createPushSender,drainPush} from '../src/push-runtime.mjs';
function setup(){const d=database();seed(d.sqlite);const env={DB:d.DB,BETTER_AUTH_SECRET:'fictional-unused-auth-fixture',AUTH_ORIGIN:'https://fictional.example.test'};const app=createApp(()=>({api:{getSession:async({headers})=>headers.get('x-fictional-user')?{user:{id:headers.get('x-fictional-user'),emailVerified:true},session:{id:'fictional-session'}}:null}}));return {...d,env,call:(user,path,method='GET',body,origin=env.AUTH_ORIGIN)=>app.request(origin+path,{method,headers:{Origin:origin,'x-fictional-user':user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env)}}
test('disabled routes expose no key or device and preserve auth/origin/account guards',async()=>{const {call}=setup();assert.equal((await call('','/api/me/push')).status,401);assert.equal((await call('pending','/api/me/push')).status,403);let r=await call('bob','/api/me/push');assert.deepEqual(await r.json(),{accountId:'bob',ready:false,pushEnabled:false,devices:[],reason:'activation-required'});assert.equal((await call('bob','/api/me/push/devices','POST',{expectedAccountId:'alice'})).status,409);assert.equal((await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob'})).status,503);assert.equal((await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob'},'https://foreign.example.test')).status,403)});
test('disabled sender and drain never read secrets, load package or fetch',async()=>{const env={PUSH_ENABLED:'false',PUSH_SCHEMA_VERSION:'1',get PUSH_VAPID_PRIVATE_KEY(){throw Error('must not inspect')},get DB(){throw Error('must not query')}};assert.equal(runtimeReady(env),false);let count=0;const sender=createPushSender(env,{load:()=>{count++;throw Error('must not load')},fetcher:()=>{count++;throw Error('must not fetch')}});assert.deepEqual(await sender({}),{status:403});assert.deepEqual(await drainPush(env),{attempted:0,disabled:true});assert.equal(count,0)});
test('disabled delete/revoke-session require exact account and do not opt in',async()=>{const {call,sqlite}=setup();assert.equal((await call('bob','/api/me/push/revoke-session','POST',{expectedAccountId:'alice'})).status,409);assert.equal((await call('bob','/api/me/push/revoke-session','POST',{expectedAccountId:'bob'})).status,200);assert.equal((await call('bob','/api/me/push/devices/fictional','DELETE',{expectedAccountId:'bob'})).status,200);assert.equal(sqlite.prepare('SELECT count(*) n FROM push_devices').get().n,0)});

test('prepared transport rejects changed endpoints and enforces redirect/abort/status-only boundary',async()=>{
 const {transmitPreparedPush}=await import('../src/push-runtime.mjs');const endpoint='https://web.push.apple.com/fictional-offline-only';let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,endpoint);assert.equal(options.redirect,'manual');assert.equal(options.method,'POST');assert.ok(options.signal);return new Response('must not be logged',{status:429,headers:{'Retry-After':'90'}})};
 assert.deepEqual(await transmitPreparedPush({endpoint,method:'POST',headers:{},body:'fictional-body'},endpoint,{fetcher}),{status:429,retryAfter:'90'});
 await assert.rejects(()=>transmitPreparedPush({endpoint:'https://evil.example.test',method:'POST'},endpoint,{fetcher}));assert.equal(calls,1);
});
test('revocation stays available with delivery disabled after schema activation',async()=>{const {call,env,sqlite}=setup();env.PUSH_SCHEMA_VERSION='1';sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fictional-session',9999999999999,'fictional-offline-session',0,0,'bob'); INSERT INTO push_devices(id,member_id,session_id,endpoint,p256dh,auth,key_version,created_at,confirmed_at) VALUES('fictional-device','bob','fictional-session','https://web.push.apple.com/fictional','','','future',0,0)");const r=await call('bob','/api/me/push');const status=await r.json();assert.equal(status.ready,false);assert.equal(status.devices.length,1);assert.equal(status.publicKey,undefined);assert.equal((await call('bob','/api/me/push/revoke-session','POST',{expectedAccountId:'bob'})).status,200);assert.ok(sqlite.prepare('SELECT revoked_at FROM push_devices').get().revoked_at)});

test('destination safety is revalidated at transport even when both endpoints match',async()=>{
 const {transmitPreparedPush}=await import('../src/push-runtime.mjs');const {validatePushEndpoint,validateSubscription}=await import('../src/push-policy.mjs');let requests=0;
 const forbidden=['https://evil.example.test/path','https://web.push.apple.com.evil.example.test/path','https://127.0.0.1/path','https://10.0.0.1/path','https://172.16.0.1/path','https://192.168.1.1/path','https://169.254.169.254/latest/meta-data','https://0.0.0.0/path','https://192.0.2.1/path','https://[::1]/path','https://[fc00::1]/path','https://[fe80::1]/path','https://[::ffff:127.0.0.1]/path','https://localhost/path','https://user:password@web.push.apple.com/path','https://web.push.apple.com:444/path','https://web.push.apple.com:443/path','http://web.push.apple.com/path','https://web.push.apple.com/path?','https://web.push.apple.com/path#','https://%77eb.push.apple.com/path'];
 const keys={p256dh:Buffer.from([4,...Array(64).fill(0)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')};
 for(const endpoint of forbidden){assert.throws(()=>validatePushEndpoint(endpoint),endpoint);assert.throws(()=>validateSubscription({endpoint,keys}),endpoint);await assert.rejects(()=>transmitPreparedPush({endpoint,method:'POST'},endpoint,{fetcher:async()=>{requests++;throw Error('must not fetch')}}),endpoint)}
 assert.equal(requests,0);
 for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'])assert.equal(validatePushEndpoint('https://'+host+'/fictional-offline-only'),'https://'+host+'/fictional-offline-only');
});
test('transport uses a redirect mode the Workers runtime accepts',async()=>{
 const {transmitPreparedPush}=await import('../src/push-runtime.mjs');const endpoint='https://web.push.apple.com/fictional-offline-only';
 // Mirrors workerd: any mode other than follow/manual throws before a request is made.
 const workerdFetch=async(_,options)=>{if(!['follow','manual'].includes(options.redirect))throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');assert.equal(options.redirect,'manual');return new Response(null,{status:201})};
 assert.deepEqual(await transmitPreparedPush({endpoint,method:'POST',headers:{},body:'fictional-body'},endpoint,{fetcher:workerdFetch}),{status:201,retryAfter:null});
});
test('redirect response is never followed or considered accepted',async()=>{const {transmitPreparedPush}=await import('../src/push-runtime.mjs');const {retryOutcome}=await import('../src/push-policy.mjs');let requests=0;const endpoint='https://web.push.apple.com/fictional-offline-only';const response=await transmitPreparedPush({endpoint,method:'POST'},endpoint,{fetcher:async(_,options)=>{requests++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'http://169.254.169.254/'}})}});assert.equal(requests,1);assert.equal(response.status,302);assert.equal(retryOutcome(response.status,1,0,100000).state,'failed')});

test('documented Apple and Microsoft provider families are supported without weakening URL trust boundaries',async()=>{
 const {validatePushEndpoint}=await import('../src/push-policy.mjs');
 for(const endpoint of ['https://web.push.apple.com/fictional','https://region.push.apple.com/fictional','https://wns2-fictional.notify.windows.com/w/?token=fictional%2Btoken%3D'])assert.equal(validatePushEndpoint(endpoint),endpoint);
 for(const endpoint of ['https://notify.windows.com/w/?token=fictional','https://fake.notify.windows.com.evil.example/w/?token=fictional','https://evilpush.apple.com/fictional','https://push.apple.com/fictional','https://foo.push.apple.com.evil.example/fictional','https://x.notify.windows.com/w/?token=one&token=two','https://x.notify.windows.com/w/?token=','https://x.notify.windows.com/w/?url=https://evil.example','https://x.notify.windows.com/w/?token=x&url=https://evil.example','https://x.notify.windows.com/other?token=x','https://x.notify.windows.com/w/?token=%0A','https://x.notify.windows.com/w/?token=%zz','https://user@x.notify.windows.com/w/?token=x','https://x.notify.windows.com:444/w/?token=x','https://x.notify.windows.com/w/?token=x#fragment'])assert.throws(()=>validatePushEndpoint(endpoint),endpoint);
});

const structuralKeys={p256dh:Buffer.from([4,...Array(64).fill(0)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')};
const subscription={endpoint:'https://web.push.apple.com/fictional-offline-only',keys:structuralKeys};
const readyConfig={PUSH_ENABLED:'true',PUSH_SCHEMA_VERSION:'1',PUSH_KEY_VERSION:'fixture-v1',PUSH_SUBJECT:'mailto:fixture@example.test',PUSH_VAPID_PUBLIC_KEY:structuralKeys.p256dh,PUSH_VAPID_PRIVATE_KEY:Buffer.alloc(32,1).toString('base64url')};
test('activation requires explicit flag, schema and structurally valid staged configuration',()=>{
 assert.equal(runtimeReady(readyConfig),true);
 for(const change of [{PUSH_ENABLED:'false'},{PUSH_SCHEMA_VERSION:undefined},{PUSH_VAPID_PRIVATE_KEY:'bad'},{PUSH_VAPID_PUBLIC_KEY:'bad'},{PUSH_KEY_VERSION:''},{PUSH_SUBJECT:'https://user:secret@example.test'}])assert.equal(runtimeReady({...readyConfig,...change}),false);
});
test('active routes retain auth, member, origin, account, DB control, session and revocation boundaries',async()=>{
 const {call,env,sqlite}=setup();Object.assign(env,readyConfig);
 sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fictional-session',9999999999999,'fictional-offline-session',0,0,'bob')");
 assert.equal((await (await call('bob','/api/me/push')).json()).ready,false);
 assert.equal((await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob',subscription,keyVersion:'fixture-v1'})).status,503);
 sqlite.exec('UPDATE push_control SET enabled=1');
 assert.equal((await call('','/api/me/push')).status,401);assert.equal((await call('pending','/api/me/push')).status,403);
 const config=await (await call('bob','/api/me/push')).json();assert.equal(config.ready,true);assert.equal(config.publicKey,readyConfig.PUSH_VAPID_PUBLIC_KEY);
 let response=await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob',subscription,keyVersion:'fixture-v1'});assert.equal(response.status,201);const device=await response.json();assert.equal(device.accountId,'bob');
 assert.equal((await (await call('bob','/api/me/push')).json()).pushEnabled,true);
 assert.equal((await call('bob','/api/me/push/devices','POST',{expectedAccountId:'alice',subscription,keyVersion:'fixture-v1'})).status,409);
 assert.equal((await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob',subscription,keyVersion:'fixture-v1'},'https://foreign.example.test')).status,403);
 assert.equal((await call('bob','/api/me/push/devices/'+device.id,'DELETE',{expectedAccountId:'bob'})).status,200);
 assert.equal((await (await call('bob','/api/me/push')).json()).pushEnabled,false);
});
test('real pinned web-push encrypts and signs only the generic payload; provider transport is injected offline',async()=>{
 const {createECDH}=await import('node:crypto');const webpush=(await import('web-push')).default;
 // Ephemeral fictional test keys only. Production staged keys are never loaded or regenerated.
 const keys=webpush.generateVAPIDKeys(),browser=createECDH('prime256v1');browser.generateKeys();
 const sub={...subscription,keys:{p256dh:browser.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,3).toString('base64url')}};let calls=0;
 const send=createPushSender({...readyConfig,PUSH_VAPID_PUBLIC_KEY:keys.publicKey,PUSH_VAPID_PRIVATE_KEY:keys.privateKey},{fetcher:async(url,options)=>{calls++;assert.equal(url,sub.endpoint);assert.equal(options.headers['Content-Encoding'],'aes128gcm');assert.ok(options.headers.Authorization.startsWith('vapid '));assert.ok(Buffer.isBuffer(options.body));assert.ok(!options.body.includes(Buffer.from('fixture-message')));assert.equal(options.redirect,'manual');return new Response(null,{status:201})}});
 assert.deepEqual(await send({subscription:sub,keyVersion:'fixture-v1',payload:{v:1,test:true,expiresAt:Date.now()+60000},ttl:60}),{status:201,retryAfter:null});assert.equal(calls,1);
 assert.deepEqual(await send({keyVersion:'stale'}),{status:403});assert.equal(calls,1);
});
test('test notification is restricted to current-account current-session device with rate limit and acceptance-only receipt',async()=>{
 const {Hono}=await import('hono');const {registerPushRoutes}=await import('../src/push-routes.mjs');const {UserError}=await import('../src/family-service.mjs');
 const {DB,sqlite}=setup();sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fictional-session',9999999999999,'fictional-offline-session',0,0,'bob');UPDATE push_control SET enabled=1;INSERT INTO push_devices(id,member_id,session_id,endpoint,p256dh,auth,key_version,created_at,confirmed_at) VALUES('device','bob','fictional-session','https://web.push.apple.com/fictional-offline-only','','','fixture-v1',0,0)");
 let sent=0;const app=new Hono();app.use('*',async(c,next)=>{c.set('actor',{id:'bob'});c.set('sessionId','fictional-session');await next()});app.onError((e,c)=>c.json({error:'safe'},e instanceof UserError?e.status:500));
 registerPushRoutes(app,{sender:()=>async input=>{sent++;assert.deepEqual(Object.keys(input.payload).sort(),['expiresAt','test','v']);assert.equal(input.payload.test,true);return {status:201}}});
 const call=(id,account='bob')=>app.request('https://fictional.example.test/api/me/push/devices/'+id+'/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedAccountId:account})},{...readyConfig,DB});
 assert.equal((await call('device','alice')).status,409);assert.equal((await call('unknown')).status,404);assert.equal(sent,0);
 const response=await call('device');assert.equal(response.status,200);assert.deepEqual(await response.json(),{accountId:'bob',accepted:true});assert.equal(sent,1);
 sqlite.exec('UPDATE session SET expiresAt=0');assert.equal((await call('device')).status,404);assert.equal(sent,1);
 sqlite.exec('UPDATE session SET expiresAt=9999999999999;UPDATE push_registration_limits SET attempts=5');assert.equal((await call('device')).status,429);assert.equal(sent,1);
});

test('unapplied schema does not inspect staged keys even when the requested flag is on',()=>{assert.equal(runtimeReady({PUSH_ENABLED:'true',get PUSH_VAPID_PRIVATE_KEY(){throw Error('must not inspect')}}),false)});
test('actual database failures during active registration remain server failures',async()=>{const {call,env,sqlite,DB}=setup();Object.assign(env,readyConfig);sqlite.exec("UPDATE push_control SET enabled=1;INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fictional-session',9999999999999,'fictional-offline-session',0,0,'bob')");env.DB={prepare:DB.prepare.bind(DB),batch:async()=>{throw Error('fictional database unavailable')}};const response=await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob',subscription,keyVersion:'fixture-v1'});assert.equal(response.status,500);const body=await response.json();assert.equal(body.error,'Request could not be completed');assert.ok(body.requestId);assert.ok(!JSON.stringify(body).includes('fictional database'))});

test('status supports browser matching after reload without returning endpoint or encryption keys',async()=>{
 const {call,env,sqlite}=setup();Object.assign(env,readyConfig);sqlite.exec("UPDATE push_control SET enabled=1;INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fictional-session',9999999999999,'fictional-offline-session',0,0,'bob')");
 const response=await call('bob','/api/me/push/devices','POST',{expectedAccountId:'bob',subscription,keyVersion:'fixture-v1'});const saved=await response.json();assert.equal(response.status,201);
 const status=await (await call('bob','/api/me/push')).json();const device=status.devices.find(d=>d.id===saved.id);
 const fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint))).toString('hex');assert.equal(device.endpointFingerprint,fingerprint);assert.equal(device.keyVersion,'fixture-v1');assert.equal(device.endpoint,undefined);assert.equal(device.p256dh,undefined);assert.equal(device.auth,undefined);
 assert.equal((await (await call('alice','/api/me/push')).json()).devices.length,0);
});

test('test provider rejection returns bounded status evidence; expired subscription is revoked and cannot be tested again',async()=>{
 const {Hono}=await import('hono');const {registerPushRoutes}=await import('../src/push-routes.mjs');const {UserError}=await import('../src/family-service.mjs');
 const {DB,sqlite}=setup();sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fictional-session',9999999999999,'fictional-offline-session',0,0,'bob');UPDATE push_control SET enabled=1;INSERT INTO push_devices(id,member_id,session_id,endpoint,p256dh,auth,key_version,created_at,confirmed_at) VALUES('device','bob','fictional-session','https://web.push.apple.com/fictional-offline-only','','','fixture-v1',0,0)");
 let providerStatus=403,sent=0;const app=new Hono();app.use('*',async(c,next)=>{c.set('actor',{id:'bob'});c.set('sessionId','fictional-session');c.set('requestId','12345678-1234-4234-8234-123456789abc');await next()});app.onError((e,c)=>c.json({error:'safe'},e instanceof UserError?e.status:500));registerPushRoutes(app,{sender:()=>async()=>{sent++;return {status:providerStatus,body:'private-provider-body'}}});
 const call=()=>app.request('https://fictional.example.test/api/me/push/devices/device/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedAccountId:'bob'})},{...readyConfig,DB});
 let response=await call();assert.equal(response.status,503);let body=await response.json();assert.equal(body.providerStatus,403);assert.equal(body.code,'push-provider-rejected');assert.ok(body.requestId);assert.ok(!JSON.stringify(body).includes('private-provider-body'));assert.equal(sqlite.prepare('SELECT revoked_at FROM push_devices').get().revoked_at,null);
 providerStatus=410;response=await call();assert.equal(response.status,410);body=await response.json();assert.equal(body.code,'push-subscription-expired');assert.ok(sqlite.prepare('SELECT revoked_at FROM push_devices').get().revoked_at);assert.equal((await call()).status,404);assert.equal(sent,2);
});
