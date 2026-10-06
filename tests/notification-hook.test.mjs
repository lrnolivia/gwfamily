import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {initialState,reducer} from '../src/data-adapter.js';
import {normalizeNotificationSettings,mergeNotificationResource} from '../src/notification-model.js';
import {notificationApi} from '../src/live-adapter.js';
let bundle;
const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function page(accountId='alice',{count=135,revision=0,items=3,...rest}={}){return {accountId,notifications:Array.from({length:items},(_,i)=>({id:accountId+'-'+(items-i),sequence:items-i,kind:'reply.created',category:'replies',title:'Private '+accountId,readAt:null,target:{kind:'post',id:'p'}})),unreadCount:count,readAllCutoff:300,nextCursor:null,settings:{...normalizeNotificationSettings(),revision},...rest};}
function dataFor(accountId='alice',overrides={}){
 const data={state:{...initialState(),mode:'live',selfId:accountId,onboarding:'done',profileComplete:true},session:{status:'active'},preview:false,refreshes:0,hydrations:0,pending:0,
 notificationApi:{list:async()=>page(accountId),read:async()=>({accountId,ok:true}),dismiss:async()=>({accountId,ok:true}),readAll:async()=>({accountId,ok:true}),saveSettings:async()=>({accountId,ok:true}),open:async()=>({accountId,available:true,target:{kind:'post',id:'p'},post:{id:'p'}}),...overrides}};
 data.getCurrentState=()=>data.state;data.dispatch=async action=>{data.state=reducer(data.state,action);return true};data.refresh=async()=>{data.refreshes++;return data.session};data.beginPending=()=>{data.pending++;return()=>data.pending--};data.hydrateNotificationResource=(result,{accountId})=>{if(accountId!==data.state.selfId||result.accountId&&accountId!==result.accountId)return false;data.hydrations++;data.state=mergeNotificationResource(data.state,result);return true};return data;
}
async function harness(data){
 if(!bundle){const result=await build({entryPoints:[new URL('../src/use-notifications.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'notification-hooks',setup(build){build.onResolve({filter:/^react$/},()=>({path:'react',namespace:'notification-hooks'}));build.onLoad({filter:/.*/,namespace:'notification-hooks'},()=>({contents:'const h=globalThis.__gwNotificationHarness;export const useState=h.useState,useRef=h.useRef,useEffect=h.useEffect,useCallback=h.useCallback;'}))}}]});bundle=result.outputFiles[0].text;}
 const saved={document:globalThis.document,window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),BroadcastChannel:globalThis.BroadcastChannel,host:globalThis.__gwNotificationHarness},slots=[],queue=[],channels=[];let cursor=0,currentData=data;
 const hooks={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}]},
  useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]},
  useCallback(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps))slots[index]={deps,fn};return slots[index].fn},
  useEffect(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps)){const previous=slots[index];slots[index]={deps,cleanup:previous?.cleanup};queue.push(()=>{previous?.cleanup?.();slots[index].cleanup=fn()})}}
 };
 class Channel{constructor(name){this.name=name;this.sent=[];channels.push(this)}postMessage(value){this.sent.push(value)}close(){this.closed=true}}
 globalThis.__gwNotificationHarness=hooks;globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});globalThis.window=new EventTarget();globalThis.BroadcastChannel=Channel;Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 const module=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64')+'#'+crypto.randomUUID());
 return {channels,render(nextData){if(nextData)currentData=nextData;cursor=0;const result=module.useNotifications(currentData);for(const effect of queue.splice(0))effect();return result},async flush(){for(let index=0;index<15;index++)await Promise.resolve()},close(){for(const slot of slots)slot?.cleanup?.();globalThis.document=saved.document;globalThis.window=saved.window;globalThis.BroadcastChannel=saved.BroadcastChannel;if(saved.navigator)Object.defineProperty(globalThis,'navigator',saved.navigator);else delete globalThis.navigator;if(saved.host===undefined)delete globalThis.__gwNotificationHarness;else globalThis.__gwNotificationHarness=saved.host}};
}

test('actual hook uses authoritative full count, stable paged merge, and captured read-all cutoff',async()=>{
 const calls=[];let cutoff;const data=dataFor('alice',{list:async options=>{calls.push(options);return options.before?page('alice',{items:2,notifications:[{id:'old-1',sequence:1,kind:'reply.created'}],count:135}):page('alice',{items:3,nextCursor:2})},readAll:async value=>{cutoff=value;return {accountId:'alice',ok:true}}});const host=await harness(data);
 try{host.render();await host.flush();assert.equal(host.render().unreadCount,135);assert.equal(host.render().items.length,3);await host.render().loadMore();assert.equal(host.render().items.length,4);assert.equal(host.render().unreadCount,135);assert.equal(calls.at(-1).before,2);await host.render().readAll();assert.equal(cutoff,300);assert.equal(data.pending,0)}finally{host.close()}
});
test('late list response cannot restore an old account after synchronous view reset',async()=>{
 const old=deferred(),fresh=deferred(),alice=dataFor('alice',{list:()=>old.promise}),bob=dataFor('bob',{list:()=>fresh.promise}),host=await harness(alice);
 try{host.render();const immediately=host.render(bob);assert.equal(immediately.items.length,0);assert.equal(immediately.unreadCount,0);assert.equal(host.channels[0].closed,true);fresh.resolve(page('bob',{count:2}));await host.flush();assert.equal(host.render().items[0].id,'bob-3');old.resolve(page('alice'));await host.flush();assert.equal(host.render().items[0].id,'bob-3');assert.equal(host.render().unreadCount,2)}finally{host.close()}
});
test('shared-cookie account mismatch clears activity and blocks later actions before family refresh resolves',async()=>{
 let writes=0;const data=dataFor('alice',{list:async()=>page('bob'),read:async()=>{writes++;return {accountId:'bob'}}}),host=await harness(data);
 try{host.render();await host.flush();assert.equal(host.render().items.length,0);assert.equal(host.render().ready,false);assert.match(host.render().error,/account changed/);assert.equal(data.refreshes,1);assert.equal(await host.render().read('private-alice'),false);assert.equal(writes,0)}finally{host.close()}
});
test('late open never hydrates or marks read in a newly selected account',async()=>{
 const opening=deferred();let reads=0;const alice=dataFor('alice',{open:()=>opening.promise,read:async()=>{reads++;return {accountId:'alice'}}}),bob=dataFor('bob'),host=await harness(alice);
 try{host.render();await host.flush();const operation=host.render().open('alice-3');host.render(bob);opening.resolve({accountId:'alice',available:true,target:{kind:'post',id:'old'},post:{id:'old'}});assert.equal(await operation,false);await host.flush();assert.equal(alice.hydrations,0);assert.equal(bob.hydrations,0);assert.equal(reads,0);assert.equal(alice.pending,0);assert.ok(host.render().items.every(n=>n.id.startsWith('bob-')))}finally{host.close()}
});
test('settings conflict reloads latest revision without retrying or replacing another device choice',async()=>{
 let attempts=0,version=1;const data=dataFor('alice',{list:async()=>page('alice',{revision:version,settings:{...normalizeNotificationSettings(),revision:version,categories:{reactions:false}}}),saveSettings:async()=>{attempts++;version=8;throw Object.assign(new Error('Revision conflict'),{status:409})}}),host=await harness(data);
 try{host.render();await host.flush();assert.equal(await host.render().saveSettings({scope:'all'}),false);assert.equal(attempts,1);assert.equal(host.render().settings.revision,8);assert.equal(host.render().settings.categories.reactions,false);assert.match(host.render().error,/changed on another device/);assert.equal(data.pending,0)}finally{host.close()}
});
test('settings remain authoritative and busy through a delayed write and its delayed read-back',async()=>{
 const saving=deferred(),reading=deferred(),readStarted=deferred(),writes=[];let lists=0;
 const previous=normalizeNotificationSettings({scope:'loved_ones',revision:4}),next={...previous,revision:5,categories:{...previous.categories,replies:false}};
 const data=dataFor('alice',{
  list:()=>{lists++;if(lists===1)return Promise.resolve(page('alice',{settings:previous}));readStarted.resolve();return reading.promise},
  saveSettings:(patch,revision,accountId)=>{writes.push({patch,revision,accountId});return saving.promise},
 }),host=await harness(data);
 try{
  host.render();await host.flush();const operation=host.render().saveSettings({categories:{replies:false}});
  assert.equal(host.render().busy,true);assert.equal(data.pending,1);assert.deepEqual(host.render().settings,previous);
  assert.deepEqual(writes,[{patch:{categories:{replies:false}},revision:4,accountId:'alice'}]);
  assert.equal(await host.render().saveSettings({globalOff:true}),false,'A second write must not race the pending revision');
  window.dispatchEvent(new Event('online'));host.channels[0].onmessage({data:{type:'invalidate',version:1}});await host.flush();assert.equal(lists,1);
  saving.resolve({accountId:'alice',...next});await readStarted.promise;
  assert.equal(host.render().busy,true);assert.equal(data.pending,1);assert.deepEqual(host.render().settings,previous,'A PUT result alone does not replace the authoritative inbox snapshot');
  reading.resolve(page('alice',{count:0,items:0,settings:next}));await operation;
  assert.equal(host.render().busy,false);assert.equal(data.pending,0);assert.deepEqual(host.render().settings,next);assert.equal(host.render().unreadCount,0);assert.equal(lists,2);assert.equal(writes.length,1);
  assert.deepEqual(host.channels[0].sent,[{type:'invalidate',version:1}]);
 }finally{saving.resolve({accountId:'alice'});reading.resolve(page('alice',{settings:previous}));host.close()}
});
test('stale-account settings rejection cannot change either account or retry against the replacement account',async()=>{
 const saving=deferred(),writes=[];let switched=false;
 const previous=normalizeNotificationSettings({scope:'loved_ones',revision:4}),replacement=normalizeNotificationSettings({scope:'leaders',revision:9});
 const alice=dataFor('alice',{
  list:async()=>switched?page('bob',{count:2,settings:replacement}):page('alice',{settings:previous}),
  saveSettings:(patch,revision,accountId)=>{writes.push({patch,revision,accountId});return saving.promise},
 }),bob=dataFor('bob',{list:async()=>page('bob',{count:2,settings:replacement})}),host=await harness(alice);
 try{
  host.render();await host.flush();const operation=host.render().saveSettings({categories:{reactions:false}});
  assert.equal(host.render().busy,true);assert.equal(host.render().settings.categories.reactions,true);switched=true;
  saving.reject(Object.assign(new Error('Your signed-in account changed.'),{status:409}));assert.equal(await operation,false);
  assert.equal(host.render().ready,false);assert.equal(host.render().items.length,0);assert.equal(host.render().unreadCount,0);assert.equal(alice.refreshes,1);assert.equal(alice.pending,0);
  assert.equal(await host.render().saveSettings({categories:{reactions:false}}),false,'An invalidated account stays blocked until the session refresh');
  host.render(bob);await host.flush();assert.equal(host.render().busy,false);assert.deepEqual(host.render().settings,replacement);assert.equal(host.render().settings.categories.reactions,true);assert.equal(host.render().unreadCount,2);
  assert.deepEqual(writes,[{patch:{categories:{reactions:false}},revision:4,accountId:'alice'}]);
 }finally{host.close()}
});
test('online and visible refresh are lightweight; hidden tabs wait and channel shares no content',async()=>{
 let calls=0;const data=dataFor('alice',{list:async()=>{calls++;return page('alice')}}),host=await harness(data);
 try{host.render();await host.flush();const first=calls;document.visibilityState='hidden';window.dispatchEvent(new Event('online'));await host.flush();assert.equal(calls,first);document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));await host.flush();assert.equal(calls,first+1);host.channels[0].onmessage({data:{type:'invalidate',version:1}});await host.flush();assert.equal(calls,first+2);await host.render().read('alice-3');assert.deepEqual(host.channels[0].sent,[{type:'invalidate',version:1}]);assert.equal(data.refreshes,0)}finally{host.close()}
});
test('preview hook persists local read/settings/reset and never touches live APIs or channels',async()=>{
 const unexpected=()=>{throw new Error('Live API called from preview')},data=dataFor('alice',{list:unexpected,read:unexpected,dismiss:unexpected,saveSettings:unexpected,open:unexpected});data.state={...initialState(),onboarding:'done'};data.preview=true;const host=await harness(data);
 try{host.render();await host.flush();assert.equal(host.render().unreadCount,3);await host.render().read('preview-notice-reply');assert.equal(host.render().unreadCount,2);await host.render().saveSettings({globalOff:true});assert.equal(host.render().unreadCount,0);await host.render().resetPreview();assert.equal(host.render().unreadCount,3);assert.equal(host.channels.length,0);assert.equal(data.pending,0)}finally{host.close()}
});
test('static preview fallback becomes ready after unconfigured bootstrap without an explicit preview session flag',async()=>{
 const unexpected=()=>{throw new Error('Live API called from static preview')},data=dataFor('alice',{list:unexpected,read:unexpected,dismiss:unexpected,readAll:unexpected,saveSettings:unexpected,open:unexpected});
 // This is the adapter state after the isolated static host returns no API.
 // Loading a saved preview does not set the explicit gw-active-mode flag.
 data.state={...initialState(),onboarding:'done'};data.preview=false;data.session=null;data.config={configured:false};data.loading=true;
 const host=await harness(data);
 try{
  host.render();await host.flush();assert.equal(host.render().enabled,false);assert.equal(host.render().ready,false);
  data.loading=false;host.render();await host.flush();assert.equal(host.render().enabled,true);assert.equal(host.render().ready,true);assert.equal(host.render().unreadCount,3);
  await host.render().saveSettings({globalOff:true});assert.equal(host.render().settings.globalOff,true);assert.equal(host.render().unreadCount,0);
  await host.render().saveSettings({globalOff:false});await host.render().read('preview-notice-reply');assert.equal(host.render().unreadCount,2);
  await host.render().resetPreview();assert.equal(host.render().unreadCount,3);assert.equal(host.channels.length,0);assert.equal(data.pending,0);
 }finally{host.close()}
});
test('a saved preview stays inactive while a configured service resolves its signed-in state',async()=>{
 const data=dataFor();data.state={...initialState(),onboarding:'done'};data.preview=false;data.loading=false;data.config={configured:true};data.session={status:'signed_out'};
 const host=await harness(data);
 try{host.render();await host.flush();assert.equal(host.render().enabled,false);assert.equal(host.render().ready,false);assert.equal(host.render().items.length,0);assert.equal(host.channels.length,0)}finally{host.close()}
});
test('unavailable and unknown typed targets stay neutral with no hydration or navigation',async()=>{
 const data=dataFor('alice',{open:async()=>({accountId:'alice',available:true,target:{kind:'url',id:'https://evil.example'}})}),host=await harness(data);
 try{host.render();await host.flush();const result=await host.render().open('alice-3');assert.deepEqual(result,{available:false});assert.equal(data.hydrations,0);assert.equal(result.route,undefined);assert.equal(host.render().error,'This update is no longer available.')}finally{host.close()}
});

// These exercise the actual fetch -> api -> notificationRequest -> refresh
// chain. The Node runner treats any escaping rejection as a test failure.
test('actual adapter transport rejection is handled on initial load and on a later online refresh',async()=>{
 const original=globalThis.fetch,reads=[],data=dataFor(),host=await harness(data);data.notificationApi=notificationApi;
 globalThis.fetch=(path,options)=>{assert.match(path,/^\/api\/notifications\?/);assert.equal(options.credentials,'same-origin');const read=deferred();reads.push({...read,signal:options.signal});return read.promise};
 try{
  host.render();assert.equal(reads.length,1);reads[0].reject(new TypeError('Synthetic transport failure'));await host.flush();await new Promise(setImmediate);
  assert.equal(host.render().ready,false);assert.equal(host.render().refreshing,false);assert.equal(host.render().error,'Synthetic transport failure');
  window.dispatchEvent(new Event('online'));assert.equal(reads.length,2);reads[1].reject(new TypeError('Synthetic later transport failure'));await host.flush();await new Promise(setImmediate);
  assert.equal(host.render().error,'Synthetic later transport failure');assert.equal(host.render().refreshing,false);assert.equal(data.refreshes,0);
 }finally{host.close();globalThis.fetch=original}
});
test('actual adapter cancellation cannot overwrite a forced replacement list or leak an unhandled rejection',async()=>{
 const original=globalThis.fetch,reads=[],data=dataFor(),host=await harness(data);data.notificationApi=notificationApi;
 globalThis.fetch=(path,options)=>{const read=deferred();options.signal.addEventListener('abort',()=>read.reject(new DOMException('Synthetic cancelled fetch','AbortError')),{once:true});reads.push({...read,signal:options.signal});return read.promise};
 try{
  host.render();const replacement=host.render().refresh();assert.equal(reads.length,2);assert.equal(reads[0].signal.aborted,true);assert.equal(reads[1].signal.aborted,false);
  reads[1].resolve({ok:true,status:200,json:async()=>page('alice',{count:7})});assert.equal(await replacement,true);await host.flush();await new Promise(setImmediate);
  assert.equal(host.render().error,'');assert.equal(host.render().unreadCount,7);assert.equal(host.render().refreshing,false);
 }finally{host.close();globalThis.fetch=original}
});
test('actual adapter body rejection is handled, and account replacement aborts only the old pending list',async()=>{
 const original=globalThis.fetch,reads=[],alice=dataFor(),bob=dataFor('bob'),host=await harness(alice);alice.notificationApi=notificationApi;bob.notificationApi=notificationApi;
 globalThis.fetch=(path,options)=>{const body=deferred();options.signal.addEventListener('abort',()=>body.reject(new DOMException('Synthetic cancelled body','AbortError')),{once:true});reads.push({body,signal:options.signal});return Promise.resolve({ok:true,status:200,json:()=>body.promise})};
 try{
  host.render();await host.flush();reads[0].body.reject(new Error('Synthetic interrupted body'));await host.flush();await new Promise(setImmediate);
  assert.match(host.render().error,/unreadable response/);assert.equal(host.render().ready,false);
  const next=host.render().refresh();await host.flush();host.render(bob);await host.flush();assert.equal(reads.length,3);assert.equal(reads[1].signal.aborted,true);assert.equal(reads[2].signal.aborted,false);
  reads[2].body.resolve(page('bob',{count:2}));assert.equal(await next,false);await host.flush();await new Promise(setImmediate);
  assert.equal(host.render().error,'');assert.equal(host.render().unreadCount,2);assert.ok(host.render().items.every(value=>value.id.startsWith('bob-')));
 }finally{host.close();globalThis.fetch=original}
});
