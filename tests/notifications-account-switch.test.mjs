// Pure VM contracts for the exact hosted account-switch scenario and routes.
// These synthetic controls do not claim real-browser evidence or replace CI.
import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initialState} from '../src/data-adapter.js';
import {DEFAULT_NOTIFICATION_CATEGORIES} from '../src/notification-model.js';
import {sharedPageDefaults} from '../src/shared-content-schema.js';
const source=readFileSync(new URL('./notifications-browser.mjs',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const scenarioFrom=text=>text.slice(text.indexOf("await check('account switch rejects"),text.indexOf("await check('notification controls fit"));
const scenario=scenarioFrom(source);

async function fixture(text=source){
 const context=vm.createContext({URL,structuredClone,initialState,DEFAULT_NOTIFICATION_CATEGORIES,sharedPageDefaults,
  assert:{equal:assert.equal,ok:assert.ok,deepEqual:(actual,expected,message)=>assert.deepEqual(plain(actual),plain(expected),message)}});
 const routes=text.slice(text.indexOf('const oldPost='),text.indexOf('async function pageFor('));
 vm.runInContext(`const base='https://fixture.test',requests=[];${routes};`+
  'globalThis.fixture={accounts,requests,attachRoutes,setArrival(value){holdSettingsArrival=value},getArrival(){return holdSettingsArrival}};',context);
 let handler;const viewer={id:'alice'},f=context.fixture;
 await f.attachRoutes({async route(pattern,callback){assert.equal(pattern,'**/*');handler=callback}},viewer);
 const request=(path,{method='GET',payload={}}={})=>handler({request:()=>({url:()=> 'https://fixture.test'+path,method:()=>method,postDataJSON:()=>vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(payload))})`,context)}),
  fulfill:async({status,body})=>({status,body:JSON.parse(body)}),abort:()=>assert.fail('Unexpected external origin'),continue:()=>assert.fail('Unexpected static request')});
 return {context,viewer,request,...f};
}

async function runScenario(text=source,{preClickRefreshes=0}={}){
 const f=await fixture(text),before=plain(f.accounts);let pending,clicks=0,viewId='alice',settings=plain(f.accounts.alice.settings),inbox=[];
 const control={checked:true,defaultChecked:true,disabled:false};
 const install=async()=>{const result=await f.request('/api/notifications');viewId=result.body.accountId;settings=result.body.settings;control.checked=settings.categories.reactions;inbox=result.body.notifications;};
 const settle=async()=>{if(pending){const waiting=pending;pending=null;await waiting;await install();control.disabled=false;}};
 const reactions={async click(){
  clicks++;for(let index=0;index<preClickRefreshes;index++)await install();
  // Native activation proposes a new checked property. A controlled pending
  // render retains the authoritative value until the request settles.
  const proposed=!control.checked;control.checked=!proposed;control.disabled=true;
  const payload={expectedAccountId:viewId,revision:settings.revision,categories:{reactions:proposed}};
  pending=f.request('/api/me/notifications',{method:'PUT',payload});
 }};
 const expect=target=>({
  async toBeChecked(){assert.equal(target,reactions);assert.equal(control.checked,true,'The DOM checked property must match authoritative choices');},
  async toBeEnabled(){if(pending)await settle();assert.equal(control.disabled,false);},
  async toBeDisabled(){assert.equal(control.disabled,true);},
  async toHaveAttribute(name,value){assert.equal(target,'bell');assert.equal(name,'aria-label');await settle();const snapshot=(await f.request('/api/notifications')).body;assert.equal(snapshot.unreadCount?`Notifications, ${snapshot.unreadCount} unread`:'Notifications',value);},
  async toHaveAccessibleName(value){await settle();assert.equal(value,'Notifications, 2 unread');assert.equal((await f.request('/api/notifications')).body.unreadCount,2);},
  async toHaveCount(count){assert.equal(inbox.filter(item=>item.id.startsWith(target)).length,count);},
 });
 expect.poll=read=>({async toBe(value){assert.equal(read(),value);}});
 Object.assign(f.context,{viewer:f.viewer,alice:{getByRole:()=>({getByRole:()=>reactions})},expect,check:async(name,run)=>run(),
  settingsWrites:()=>f.requests.filter(request=>request.path==='/api/me/notifications'&&request.method==='PUT'),
  openSettings:async()=>{await install();return 'https://fixture.test/#/home'},returnFromSettings:async()=>{await settle()},backgroundBell:()=> 'bell',bell:()=> 'bell',showInbox:install,
  panel:()=>({locator:selector=>selector.includes('alice-')?'alice-':'bob-'})});
 try{await vm.runInContext(`(async()=>{${scenarioFrom(text)}})()`,f.context);return {f,before,control,clicks};}
 catch(error){error.syntheticEvidence={writes:plain(f.requests.filter(request=>request.method==='PUT')),accounts:plain(f.accounts),control:{...control}};throw error;}
 finally{await settle();assert.equal(f.getArrival(),null,'The captured arrival must always be released and consumed');}
}

test('the pre-click account switch can legitimately edit Bob after an ordinary refresh',async()=>{
 // Reconstruct only the old check ordering, retaining the same intercepted API.
 const start=scenario.indexOf('  let release,started=false;'),end=scenario.indexOf("  await expect(backgroundBell(alice))",start);
 assert.ok(start>=0&&end>start);
 const oldScenario=scenario.slice(0,start)+"  viewer.id='bob';await reactions.click();\n"+scenario.slice(end);
 const old=source.replace(scenario,oldScenario);
 await assert.rejects(runScenario(old,{preClickRefreshes:1}),error=>{
  assert.match(error.message,/DOM checked property/);
  assert.deepEqual(error.syntheticEvidence.writes.map(({viewer,payload})=>({viewer,payload})),[{viewer:'bob',payload:{expectedAccountId:'bob',revision:0,categories:{reactions:false}}}]);
  assert.equal(error.syntheticEvidence.accounts.bob.settings.categories.reactions,false);
  assert.deepEqual(error.syntheticEvidence.control,{checked:false,defaultChecked:true,disabled:false});return true;
 });
});

test('the exact hosted scenario captures Alice intent before the server switch across pre-click refresh interleavings',async()=>{
 for(const preClickRefreshes of [0,1,10]){
  const {f,before,control,clicks}=await runScenario(source,{preClickRefreshes});assert.equal(clicks,1);
  assert.deepEqual(plain(f.accounts),before,'Neither account settings nor notices may be changed');
  assert.deepEqual(plain(f.requests.filter(request=>request.method==='PUT')),[{viewer:'bob',path:'/api/me/notifications',method:'PUT',payload:{expectedAccountId:'alice',revision:0,categories:{reactions:false}}}]);
  assert.deepEqual(control,{checked:true,defaultChecked:true,disabled:false});
 }
});

test('the arrival gate captures the complete immutable request before authentication and cannot mutate either account',async()=>{
 const f=await fixture(),before=plain(f.accounts),payload={expectedAccountId:'alice',revision:0,categories:{reactions:false}};let release,captured;
 f.setArrival({promise:new Promise(resolve=>release=resolve),started:request=>captured=plain(request)});
 const pending=f.request('/api/me/notifications',{method:'PUT',payload});
 try{
  assert.deepEqual(captured,payload);assert.equal(f.getArrival(),null);assert.deepEqual(plain(f.requests),[]);assert.deepEqual(plain(f.accounts),before);
  f.viewer.id='bob';
 }finally{release();}
 assert.equal((await pending).status,409);assert.deepEqual(plain(f.accounts),before);
 assert.deepEqual(plain(f.requests),[{viewer:'bob',path:'/api/me/notifications',method:'PUT',payload}]);
});

test('same-account writes and stale revisions retain normal authorization and commit behavior',async()=>{
 const f=await fixture();
 const first=await f.request('/api/me/notifications',{method:'PUT',payload:{expectedAccountId:'alice',revision:0,categories:{reactions:false}}});
 assert.equal(first.status,200);assert.equal(first.body.categories.reactions,false);assert.equal(first.body.revision,1);
 const stale=await f.request('/api/me/notifications',{method:'PUT',payload:{expectedAccountId:'alice',revision:0,categories:{reactions:true}}});assert.equal(stale.status,409);
 assert.equal(f.accounts.alice.settings.categories.reactions,false);assert.equal(f.accounts.bob.settings.categories.reactions,true);
});

test('the exact scenario fails if the server account mismatch guard is removed or the captured owner is wrong',async()=>{
 const bypass=source.replace("if(payload.expectedAccountId&&payload.expectedAccountId!==viewer.id)return json(route,{error:'Your signed-in account changed. Refresh before trying again.'},409);",'');
 assert.notEqual(bypass,source);await assert.rejects(runScenario(bypass),/DOM checked property/);
 const wrongOwner=source.replace("pending.started(payload);await pending.promise;","pending.started({...payload,expectedAccountId:'bob'});await pending.promise;");
 assert.notEqual(wrongOwner,source);await assert.rejects(runScenario(wrongOwner),/Expected values to be strictly deep-equal/);
});

test('the hosted ordering uses one normal click, preserves checked-property/account/inbox assertions and never resets DOM',()=>{
 assert.equal((scenario.match(/\.click\(\)/g)||[]).length,1);
 assert.ok(scenario.indexOf('await expect.poll(()=>started).toBe(true)')<scenario.indexOf("viewer.id='bob'"));
 assert.ok(source.indexOf('pending.started(payload);await pending.promise;')<source.indexOf('payload.expectedAccountId!==viewer.id'));
 for(const invariant of ['await expect(reactions).toBeDisabled();await expect(reactions).toBeChecked()',
  'await expect(reactions).toBeEnabled();await expect(reactions).toBeChecked()',
  'assert.deepEqual(accounts.alice.settings,oldSettings);assert.deepEqual(accounts.bob.settings,previous)',
  "{viewer:'bob',payload:{expectedAccountId:'alice',revision:oldSettings.revision,categories:{reactions:false}}}",
  "[data-notice-id^=\"alice-\"]", "[data-notice-id^=\"bob-\"]",'finally{holdSettingsArrival=null;release();}'])assert.ok(scenario.includes(invariant),invariant);
 assert.doesNotMatch(scenario,/\.uncheck\(|\.check\(|force\s*:|waitForTimeout|setTimeout|\.evaluate\(|\.checked\s*=/);
});
