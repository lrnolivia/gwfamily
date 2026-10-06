// Execute the hosted fixture and cutoff scenario without a browser or network.
// These contracts do not replace the required hosted Chromium/WebKit checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DEFAULT_NOTIFICATION_CATEGORIES} from '../src/notification-model.js';

const source=readFileSync(new URL('./notifications-browser.mjs',import.meta.url),'utf8');
const routeSource=source.slice(source.indexOf('const oldPost='),source.indexOf('async function pageFor('));
const checkSource=source.slice(source.indexOf("await check('read-all uses"),source.indexOf("await check('account switch"));
const later={id:'alice-new-after-cutoff',sequence:136,kind:'reply.created',category:'replies',title:'A later fixture arrival'};
const plain=value=>structuredClone(value);

async function fixture({mutateRoute=value=>value}={}){
 const context=vm.createContext({URL,structuredClone,DEFAULT_NOTIFICATION_CATEGORIES,
  assert:{equal:assert.equal,ok:assert.ok,deepEqual:(actual,expected,message)=>assert.deepEqual(plain(actual),plain(expected),message)},
 });
 vm.runInContext(`const base='http://127.0.0.1:4173',requests=[];\n${mutateRoute(routeSource)}\n`+
  'globalThis.fixture={accounts,requests,attachRoutes,setReadAllHold(value){holdReadAll=value},getReadAllHold(){return holdReadAll}};',context);
 let handler;
 const state=context.fixture;
 await state.attachRoutes({async route(pattern,callback){assert.equal(pattern,'**/*');handler=callback;}},{id:'alice'});
 async function request(path,{method='GET',payload={}}={}){
  const body=vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(payload))})`,context);
  return handler({request:()=>({url:()=> 'http://127.0.0.1:4173'+path,method:()=>method,postDataJSON:()=>body}),
   fulfill:async({status,body})=>({status,body:JSON.parse(body)}),
   abort(){assert.fail('The isolated fixture must not access an external origin');},
   continue(){assert.fail('This contract uses only intercepted notification APIs');},
  });
 }
 return {context,...state,request};
}

test('inserting before the click can legitimately advance the server cutoff and leave zero unread',async()=>{
 const f=await fixture();
 const initial=(await f.request('/api/notifications')).body;assert.equal(initial.readAllCutoff,135);
 f.accounts.alice.notices.push({...later});
 // A normal refresh between insertion and the click observes the new arrival.
 const refreshed=(await f.request('/api/notifications')).body;assert.equal(refreshed.readAllCutoff,136);
 await f.request('/api/notifications/read-all',{method:'POST',payload:{cutoff:refreshed.readAllCutoff,expectedAccountId:'alice'}});
 assert.equal((await f.request('/api/notifications')).body.unreadCount,0);
 assert.ok(f.accounts.alice.notices.at(-1).readAt);
 const hook=readFileSync(new URL('../src/use-notifications.js',import.meta.url),'utf8');
 assert.match(hook,/setInterval\(tick,15000\)/);
 assert.match(hook,/readAllCutoff:Number\.isSafeInteger\(first\.readAllCutoff\)\?first\.readAllCutoff:null/);
 assert.match(hook,/const cutoff=snapshot\.identity===identity\?snapshot\.readAllCutoff:null/);
});

test('the one-shot gate observes the unchanged request before any server mutation and applies its cutoff after release',async()=>{
 const f=await fixture(),before=plain(f.accounts.alice.notices);let release,started=0;
 f.setReadAllHold({promise:new Promise(resolve=>release=resolve),started:()=>{started++;}});
 const pending=f.request('/api/notifications/read-all',{method:'POST',payload:{cutoff:135,expectedAccountId:'alice'}});
 try{
  assert.equal(started,1);assert.equal(f.getReadAllHold(),null);
  assert.deepEqual(plain(f.requests),[{viewer:'alice',path:'/api/notifications/read-all',method:'POST',payload:{cutoff:135,expectedAccountId:'alice'}}]);
  assert.deepEqual(plain(f.accounts.alice.notices),before);
  f.accounts.alice.notices.push({...later});
 }finally{release();}
 assert.deepEqual(await pending,{status:200,body:{accountId:'alice',ok:true}});
 assert.equal((await f.request('/api/notifications')).body.unreadCount,1);
 assert.equal(f.accounts.alice.notices.at(-1).readAt,undefined);
 assert.ok(f.accounts.alice.notices.slice(0,-1).every(notice=>notice.readAt));
});

async function runHostedScenario({refreshes=0,sentCutoff,mutateRoute}={}){
 const f=await fixture({mutateRoute});let pending,clicks=0;
 const button={async click(){
  clicks++;
  let snapshot=(await f.request('/api/notifications')).body;
  for(let index=0;index<refreshes;index++)snapshot=(await f.request('/api/notifications')).body;
  assert.equal(snapshot.readAllCutoff,135,'No later arrival may exist before the actual outgoing request');
  assert.ok(!f.accounts.alice.notices.some(notice=>notice.id===later.id));
  pending=f.request('/api/notifications/read-all',{method:'POST',payload:{cutoff:sentCutoff??snapshot.readAllCutoff,expectedAccountId:'alice'}});
  // Even a list request while read-all is held cannot move the captured cutoff.
  assert.equal((await f.request('/api/notifications')).body.readAllCutoff,135);
 }};
 const expect=()=>({async toHaveAccessibleName(name){
  assert.ok(pending,'The normal click must send read-all');await pending;
  const snapshot=(await f.request('/api/notifications')).body;
  assert.equal(snapshot.unreadCount?`Notifications, ${snapshot.unreadCount} unread`:'Notifications',name);
 }});
 expect.poll=read=>({async toBe(value){assert.equal(read(),value);}});
 Object.assign(f.context,{expect,alice:{},check:async(name,run)=>run(),showInbox:async()=>{},bell:()=>button,
  panel:()=>({getByRole(role,options){assert.equal(role,'button');assert.deepEqual(plain(options),{name:'Mark all read',exact:true});return button;}}),
 });
 try{await vm.runInContext(`(async()=>{${checkSource}})()`,f.context);}
 finally{if(pending)await pending;assert.equal(f.getReadAllHold(),null,'The scenario must always release and clear its one-shot hold');}
 return {f,clicks};
}

test('the actual hosted scenario keeps exactly one later arrival unread across pre-click refresh interleavings',async()=>{
 for(const refreshes of [0,1,10]){
  const {f,clicks}=await runHostedScenario({refreshes});assert.equal(clicks,1);
  assert.deepEqual(plain(f.requests.filter(request=>request.path==='/api/notifications/read-all')),
   [{viewer:'alice',path:'/api/notifications/read-all',method:'POST',payload:{cutoff:135,expectedAccountId:'alice'}}]);
  assert.deepEqual(plain(f.accounts.alice.notices.filter(notice=>!notice.readAt).map(notice=>notice.id)),[later.id]);
 }
});

test('the hosted scenario rejects wrong request cutoffs and both over-broad and incomplete server mutations',async()=>{
 await assert.rejects(runHostedScenario({sentCutoff:136}),/Expected values to be strictly deep-equal/);
 await assert.rejects(runHostedScenario({mutateRoute:value=>value.replace('notice.sequence<=payload.cutoff&&','notice.sequence<=payload.cutoff+1&&')}),/Notifications/);
 await assert.rejects(runHostedScenario({mutateRoute:value=>value.replace('notice.sequence<=payload.cutoff&&','notice.sequence<payload.cutoff&&')}),/Notifications/);
});

test('the cutoff scenario retains one real click and strict API, held-state and final unread assertions without retries',()=>{
 assert.equal((checkSource.match(/\.click\(\)/g)||[]).length,1);
 assert.ok(checkSource.indexOf('await expect.poll(()=>started).toBe(true)')<checkSource.indexOf('accounts.alice.notices.push('));
 for(const required of ["method:'POST',payload:{cutoff,expectedAccountId:'alice'}",'assert.deepEqual(accounts.alice.notices,previous',
  "toHaveAccessibleName('Notifications, 1 unread')",'assert.equal(accounts.alice.notices.at(-1).readAt,undefined)',
  "['alice-new-after-cutoff']",'finally{holdReadAll=null;release();}',
 ])assert.ok(checkSource.includes(required),required);
 assert.doesNotMatch(checkSource,/waitForTimeout|setTimeout|force\s*:|dispatchEvent|\.refresh\(/);
});
