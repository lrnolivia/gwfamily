import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {deviceCapability,createDevicePushController,applicationServerKeyBytes} from '../src/push-client.js';
function capable(ua=''){return {window:{isSecureContext:true,PushManager:{prototype:{subscribe(){},getSubscription(){}}},ServiceWorkerRegistration:{prototype:{showNotification(){}}},matchMedia:()=>({matches:false})},navigator:{userAgent:ua,serviceWorker:{}},Notification:{permission:'default',requestPermission(){}}}}
test('all five OS use real API capability rather than a browser-name allowlist',()=>{
 for(const ua of ['Mozilla Android Chrome','Mozilla Android EdgA','Mozilla Android Firefox','Mozilla Macintosh Safari','Mozilla Macintosh Chrome','Mozilla Macintosh Edg','Mozilla Macintosh Firefox','Mozilla Windows NT Chrome','Mozilla Windows NT Edg','Mozilla Windows NT Firefox','Mozilla CrOS Chrome']){const fixture=capable(ua);assert.equal(deviceCapability(fixture).available,true,ua);fixture.window.PushManager=undefined;assert.equal(deviceCapability(fixture).available,false,ua)}
 const ios=capable('Mozilla iPhone Safari');assert.equal(deviceCapability(ios).reason,'install-ios-first');ios.navigator.standalone=true;assert.equal(deviceCapability(ios).available,true);ios.Notification.permission='denied';assert.equal(deviceCapability(ios).reason,'permission-denied');
 const ipad=capable('Mozilla Macintosh');Object.assign(ipad.navigator,{platform:'MacIntel',maxTouchPoints:5});assert.equal(deviceCapability(ipad).reason,'install-ios-first');
});
test('in-app browsers, embedded frames, insecure contexts and missing methods fail with usable reasons',()=>{
 for(const ua of ['Mozilla Android wv','Instagram iPhone','FBAN iPhone','Line/ Android'])assert.equal(deviceCapability(capable(ua)).reason,'open-full-browser');
 const f=capable('Mozilla Windows');f.window.top={};f.window.self={};assert.equal(deviceCapability(f).reason,'open-full-browser');delete f.window.top;delete f.window.self;f.window.isSecureContext=false;assert.equal(deviceCapability(f).reason,'secure-context-required');f.window.isSecureContext=true;f.Notification.requestPermission=undefined;assert.equal(deviceCapability(f).reason,'unsupported');
});
test('public application key is passed as portable bytes without generating keys',()=>{const structural=Buffer.from([4,...Array(64).fill(0)]).toString('base64url');assert.equal(applicationServerKeyBytes(structural).length,65);assert.throws(()=>applicationServerKeyBytes('invalid'));});
test('disabled controller never requests permission, saves or subscribes',async()=>{let calls=0;const c=createDevicePushController({Notification:{requestPermission:()=>calls++},registration:{},save:()=>calls++,revoke:()=>calls++,currentAccountId:()=> 'fictional'});await assert.rejects(()=>c.enable({ready:false},'fictional'));assert.equal(calls,0)});
test('actual SW shows only generic text and rejects payload URL injection',async()=>{const handlers={},shown=[],opened=[];const self={skipWaiting:async()=>{},location:{origin:'https://fictional.example.test'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)}};vm.runInNewContext(readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8'),{self,URL,Date,caches:{keys:async()=>[]}});let pending;handlers.push({data:{json:()=>({v:1,noticeId:'fictional-notice',expiresAt:Date.now()+60000,title:'private name',body:'private message',url:'https://evil.example.test'})},waitUntil:p=>pending=p});await pending;assert.equal(shown[0][0],'Green & White Family');assert.ok(!JSON.stringify(shown).includes('private'));handlers.notificationclick({notification:{close:()=>{},data:{noticeId:'fictional-notice',url:'https://evil.example.test'}},waitUntil:p=>pending=p});await pending;assert.equal(opened[0],'https://fictional.example.test/?gwNotice=fictional-notice');assert.equal(handlers.fetch,undefined)});

test('explicit enable requests permission before awaited setup and retains the saved device identity for a test',async()=>{
 const calls=[],account='fixture-user',key=Buffer.from([4,...Array(64).fill(0)]).toString('base64url');
 const subscription={toJSON:()=>({endpoint:'fictional-offline',keys:{}}),unsubscribe:async()=>calls.push('unsubscribe')};
 const controller=createDevicePushController({Notification:{requestPermission:()=>{calls.push('permission');return Promise.resolve('granted')}},registration:{pushManager:{getSubscription:async()=>null,subscribe:async options=>{calls.push('subscribe');assert.equal(options.userVisibleOnly,true);assert.ok(options.applicationServerKey instanceof Uint8Array);return subscription}}},save:async body=>{calls.push('save');assert.equal(body.expectedAccountId,account);return {id:'fixture-device'}},revoke:async()=>{},currentAccountId:()=>account});
 const pending=controller.enable({ready:true,publicKey:key,keyVersion:'v1'},account);assert.deepEqual(calls,['permission']);assert.deepEqual(await pending,{enabled:true,deviceId:'fixture-device'});assert.deepEqual(calls,['permission','subscribe','save']);
});
test('denied permission does not subscribe or save',async()=>{let calls=0;const controller=createDevicePushController({Notification:{requestPermission:async()=> 'denied'},registration:{pushManager:{getSubscription:()=>calls++}},save:()=>calls++,currentAccountId:()=> 'fixture'});const key=Buffer.from([4,...Array(64).fill(0)]).toString('base64url');assert.deepEqual(await controller.enable({ready:true,publicKey:key,keyVersion:'v1'},'fixture'),{enabled:false,reason:'denied'});assert.equal(calls,0)});

test('reopening settings resolves only this browser subscription and current key without permission or enrollment',async()=>{
 const {resolveBrowserPush}=await import('../src/push-client.js');
 const endpoint='https://web.push.apple.com/fictional-offline-only';
 const fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))).toString('hex');
 const status={ready:true,keyVersion:'v1',devices:[{id:'other-browser',endpointFingerprint:'0'.repeat(64),keyVersion:'v1'},{id:'this-browser',endpointFingerprint:fingerprint,keyVersion:'v1'}]};
 let reads=0;const registration={pushManager:{getSubscription:async()=>{reads++;return {endpoint}}}};
 assert.equal(typeof resolveBrowserPush,'function');
 assert.deepEqual(await resolveBrowserPush(status,registration),{pushEnabled:true,testDeviceId:'this-browser'});
 assert.deepEqual(await resolveBrowserPush({...status,keyVersion:'v2'},registration),{pushEnabled:false,testDeviceId:null});
 assert.deepEqual(await resolveBrowserPush(status,{pushManager:{getSubscription:async()=>null}}),{pushEnabled:false,testDeviceId:null});
 assert.deepEqual(await resolveBrowserPush({...status,ready:false},registration),{pushEnabled:false,testDeviceId:null});assert.equal(reads,2);
});

test('push failures preserve a safe request reference and never render untrusted reference text',async()=>{
 const {requestPush}=await import('../src/push-client.js');assert.equal(typeof requestPush,'function');
 const requestId='12345678-1234-4234-8234-123456789abc';
 await assert.rejects(()=>requestPush('/fictional','POST',{},async()=>new Response(JSON.stringify({error:'Request could not be completed',requestId}),{status:500})),error=>error.message.includes(requestId));
 await assert.rejects(()=>requestPush('/fictional','POST',{},async()=>new Response(JSON.stringify({error:'Safe failure',requestId:'private-endpoint-cookie'}),{status:500})),error=>error.message==='Safe failure');
});
