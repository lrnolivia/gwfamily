import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reducer} from '../src/data-adapter.js';
import {LIVE_DRAFT_PREFIX,LIVE_REQUEST_PREFIX,saveLiveDrafts,readLiveDrafts,clearLiveDrafts,retainDraftAccount,hasLocalDrafts,commandFingerprint,readCommandRequests,saveCommandRequests,preserveNewerDrafts} from '../src/draft-storage.js';
import {sendCommand,isAmbiguousCommandError} from '../src/live-adapter.js';
const storage=()=>{const values=new Map();return {get length(){return values.size},key:index=>[...values.keys()][index],getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
const live=(selfId='alice')=>({...initialState(),mode:'live',selfId});

test('live post, comment, reply and message drafts survive reload only for their own account',()=>{
 const target=storage(),state=live();state.drafts={post:'Post draft',comments:{p1:'Comment draft'},replies:{c1:'Reply draft'},messages:{conversation1:'Private draft'},files:{'comments:p1':[{id:'media-1234',url:'/api/media/media-1234',name:'Family photo',type:'image/png'}]}};state.compose={poll:{question:'Which day?',options:['Saturday','Sunday'],mode:'single'},background:'forest'};
 assert.equal(saveLiveDrafts('alice',state,target).ok,true);
 assert.deepEqual(readLiveDrafts('alice',target),{drafts:state.drafts,compose:state.compose});
 assert.deepEqual(readLiveDrafts('bob',target),{});
 assert.equal(target.getItem('gwfamily:preview:v2'),null);
});
test('draft persistence stores no family state, auth fields or unrelated local preferences',()=>{
 const target=storage(),state=live();state.drafts.post='Remember this';state.members=[{secret:'private directory'}];state.accessToken='do not persist';state.payment={destination:'none'};
 saveLiveDrafts('alice',state,target);const raw=target.getItem(LIVE_DRAFT_PREFIX+'alice');
 assert.doesNotMatch(raw,/private directory|accessToken|payment|destination/);
 assert.equal(saveLiveDrafts('bob',state,target).ok,false);assert.equal(saveLiveDrafts('alice',initialState(),target).ok,false);
});
test('temporary blob media is omitted honestly while typed text and uploaded references survive',()=>{
 const target=storage(),state=live();state.drafts.post='data: is a valid topic';state.drafts.files={'comments:p1':[{name:'Temporary',url:'blob:gone-on-reload'},{name:'Uploaded',url:'/api/media/media-1234'}]};state.compose={backgroundMedia:{url:'blob:background',type:'video/mp4'}};
 const status=saveLiveDrafts('alice',state,target),restored=readLiveDrafts('alice',target);
 assert.equal(status.ok,true);assert.equal(status.omittedMedia,true);assert.equal(restored.drafts.post,'data: is a valid topic');assert.equal(restored.drafts.files['comments:p1'].length,1);assert.equal(restored.compose.backgroundMedia,undefined);assert.doesNotMatch(target.getItem(LIVE_DRAFT_PREFIX+'alice'),/blob:/);
});
test('signout and account switch clear only private account drafts and retry identifiers',()=>{
 const target=storage();for(const id of ['alice','bob']){saveLiveDrafts(id,live(id),target);saveCommandRequests(id,{['f'.repeat(64)]:'request-1234'},target)}
 target.setItem('gw-theme','light');retainDraftAccount('bob',target);
 assert.deepEqual(readLiveDrafts('alice',target),{});assert.deepEqual(readCommandRequests('alice',target),{});assert.ok(readLiveDrafts('bob',target).drafts);
 clearLiveDrafts('bob',target);assert.deepEqual(readLiveDrafts('bob',target),{});assert.deepEqual(readCommandRequests('bob',target),{});assert.equal(target.getItem('gw-theme'),'light');
});
test('corrupt draft storage and unavailable storage fail safely without erasing the last checkpoint',()=>{
 const target=storage(),state=live();state.drafts.post='Keep me';saveLiveDrafts('alice',state,target);const previous=target.getItem(LIVE_DRAFT_PREFIX+'alice');
 assert.equal(saveLiveDrafts('alice',state,{...target,setItem(){throw new Error('quota')}}).ok,false);assert.equal(target.getItem(LIVE_DRAFT_PREFIX+'alice'),previous);
 target.setItem(LIVE_DRAFT_PREFIX+'alice','bad JSON');assert.deepEqual(readLiveDrafts('alice',target),{});
 target.setItem(LIVE_DRAFT_PREFIX+'alice',JSON.stringify({schema:1,accountId:'bob',drafts:state.drafts,compose:{}}));assert.deepEqual(readLiveDrafts('alice',target),{});
 target.setItem(LIVE_DRAFT_PREFIX+'alice',JSON.stringify({schema:1,accountId:'alice',drafts:{post:{not:'text'},comments:{p1:{not:'text'}}},compose:{}}));assert.equal(readLiveDrafts('alice',target).drafts.post,'');assert.deepEqual(readLiveDrafts('alice',target).drafts.comments,{});
});
test('draft detection covers text, uploaded attachments, poll-only and message drafts',()=>{
 const state=live();assert.equal(hasLocalDrafts(state),false);state.drafts.messages={conversation1:'A private thought'};assert.equal(hasLocalDrafts(state),true);state.drafts.messages={};state.compose={poll:{options:['','']}};assert.equal(hasLocalDrafts(state),true);state.compose={};state.drafts.files={post:[{url:'/api/media/1'}]};assert.equal(hasLocalDrafts(state),true);
});
test('a confirmed command clears only its own submitted draft snapshot',()=>{
 const before=live();before.drafts.comments={p1:'Submitting this',p2:'Other conversation'};before.drafts.files={'comments:p1':[{url:'/api/media/123'}]};const action={type:'ADD_COMMENT',targetId:'p1',text:'Submitting this'};
 const settled=preserveNewerDrafts(before,before,reducer({...before,mode:'preview'},action),action);
 assert.equal(settled.drafts.comments.p1,'');assert.equal(settled.drafts.comments.p2,'Other conversation');assert.deepEqual(settled.drafts.files['comments:p1'],[]);
 const changed={...before,drafts:{...before.drafts,comments:{...before.drafts.comments,p1:'New unsent draft'},files:{...before.drafts.files,'comments:p1':[{url:'/api/media/new'}]}}};const newer=preserveNewerDrafts(changed,before,reducer({...changed,mode:'preview'},action),action);
 assert.equal(newer.drafts.comments.p1,'New unsent draft');assert.equal(newer.drafts.files['comments:p1'][0].url,'/api/media/new');
});
test('new post text and compose settings survive a prior post acknowledgement',()=>{
 const before=live();before.drafts.post='First';before.compose={background:'forest'};const changed={...before,drafts:{...before.drafts,post:'Next'},compose:{background:'sage'}};const action={type:'ADD_POST',post:{authorId:'alice',text:'First'}};const settled=preserveNewerDrafts(changed,before,reducer({...changed,mode:'preview'},action),action);
 assert.equal(settled.drafts.post,'Next');assert.equal(settled.compose.background,'sage');
});
test('command fingerprints are stable across object ordering but distinct across edits and targets',async()=>{
 const first=await commandFingerprint({type:'ADD_COMMENT',targetId:'p1',text:'Hello',requestId:'old'}),again=await commandFingerprint({text:'Hello',targetId:'p1',type:'ADD_COMMENT',requestId:'new'});
 assert.equal(first,again);assert.notEqual(first,await commandFingerprint({type:'ADD_COMMENT',targetId:'p2',text:'Hello'}));assert.notEqual(first,await commandFingerprint({type:'ADD_COMMENT',targetId:'p1',text:'Hello!'}));
 const target=storage();saveCommandRequests('alice',{[first]:'request-1234'},target);assert.equal(readCommandRequests('alice',target)[again],'request-1234');assert.doesNotMatch(target.getItem(LIVE_REQUEST_PREFIX+'alice'),/Hello|ADD_COMMENT/);
});
test('ambiguous command retry sends the same requestId and body exactly once more',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(path,options)=>{calls.push(JSON.parse(options.body));if(calls.length===1)throw new TypeError('Connection lost');return new Response(JSON.stringify({ok:true,id:'saved'}),{status:200})};
 try{assert.deepEqual(await sendCommand({type:'ADD_COMMENT',requestId:'fixed-request-id',text:'Once only'}),{ok:true,id:'saved'});assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1])}finally{globalThis.fetch=original}
});
test('definite validation failure does not retry and ambiguous errors stay distinguishable',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'Too long'}),{status:400})};
 try{await assert.rejects(()=>sendCommand({requestId:'fixed-request-id'}),/Too long/);assert.equal(calls,1)}finally{globalThis.fetch=original}
 assert.equal(isAmbiguousCommandError({status:400}),false);assert.equal(isAmbiguousCommandError({status:503}),true);assert.equal(isAmbiguousCommandError(new TypeError('offline')),true);assert.equal(isAmbiguousCommandError({status:200,ambiguous:true}),true);
});

// Run the actual adapter's async state transitions without a browser or a DOM.
// The tiny hook host stores values only; network requests remain deterministic.
let adapterBundle;
async function adapterHarness(state,fetcher,target=storage()){
 if(!adapterBundle){const {build}=await import('esbuild');const result=await build({entryPoints:[new URL('../src/live-adapter.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-hooks',setup(build){build.onResolve({filter:/^react$/},()=>({path:'react',namespace:'test-hooks'}));build.onLoad({filter:/.*/,namespace:'test-hooks'},()=>({contents:'const h=globalThis.__gwDraftHarness;export const useState=h.useState,useRef=h.useRef,useEffect=()=>{};export default {};'}))}}]});adapterBundle=result.outputFiles[0].text}
 const original={fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage,localStorage:globalThis.localStorage,harness:globalThis.__gwDraftHarness},slots=[];let cursor=0;
 const harness={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=index===0?state:typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value}]},useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]}};
 globalThis.__gwDraftHarness=harness;globalThis.fetch=fetcher;globalThis.sessionStorage=target;globalThis.localStorage=storage();
 const module=await import('data:text/javascript;base64,'+Buffer.from(adapterBundle).toString('base64')+'#'+crypto.randomUUID());
 return {render(){cursor=0;return module.useFamilyData()},storage:target,close(){globalThis.fetch=original.fetch;globalThis.sessionStorage=original.sessionStorage;globalThis.localStorage=original.localStorage;if(original.harness===undefined)delete globalThis.__gwDraftHarness;else globalThis.__gwDraftHarness=original.harness}};
}
test('acknowledged comment clears draft and returns success even when its read-back is offline',async()=>{
 const state=live();state.drafts.comments={p1:'Only once'};let writes=0;const host=await adapterHarness(state,async path=>{if(path==='/api/commands'){writes++;return new Response('{"ok":true}',{status:200})}throw new TypeError('Read-back offline')});
 try{const first=host.render();assert.equal(await first.dispatch({type:'ADD_COMMENT',targetId:'p1',text:'Only once'}),true);const current=host.render();assert.equal(current.state.drafts.comments.p1,'');assert.equal(current.pending,false);assert.match(current.error,/change was saved/);assert.equal(writes,1);assert.deepEqual(readCommandRequests('alice',host.storage),{})}finally{host.close()}
});
test('two ambiguous attempts retain draft and explicit retry reuses the exact prior receipt',async()=>{
 const state=live();state.drafts.comments={p1:'Recover safely'};const writes=[];let failing=true;const host=await adapterHarness(state,async(path,options)=>{if(path==='/api/commands'){writes.push(JSON.parse(options.body));if(failing)throw new TypeError('Connection lost after send');return new Response('{"ok":true}',{status:200})}return new Response(JSON.stringify(state),{status:200})});
 try{
  const action={type:'ADD_COMMENT',targetId:'p1',text:'Recover safely'};assert.equal(await host.render().dispatch(action),false);assert.equal(host.render().state.drafts.comments.p1,'Recover safely');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(Object.keys(readCommandRequests('alice',host.storage)).length,1);
  failing=false;assert.equal(await host.render().dispatch(action),true);assert.equal(writes.length,3);assert.deepEqual(writes[0],writes[2]);assert.equal(host.render().state.drafts.comments.p1,'');
 }finally{host.close()}
});
test('adapter rejects concurrent sends and preserves a new edit made during acknowledgement',async()=>{
 const state=live();state.drafts.comments={p1:'First draft'};let acknowledge;const host=await adapterHarness(state,async path=>{if(path==='/api/commands')return new Promise(resolve=>{acknowledge=()=>resolve(new Response('{"ok":true}',{status:200}))});return new Response(JSON.stringify(state),{status:200})});
 try{
  const data=host.render(),pending=data.dispatch({type:'ADD_COMMENT',targetId:'p1',text:'First draft'});assert.equal(await data.dispatch({type:'ADD_COMMENT',targetId:'p1',text:'First draft'}),false);
  while(!acknowledge)await new Promise(resolve=>setTimeout(resolve,0));await data.dispatch({type:'SET_DRAFT',kind:'comments',key:'p1',value:'Second draft'});acknowledge();assert.equal(await pending,true);assert.equal(host.render().state.drafts.comments.p1,'Second draft');assert.equal(readLiveDrafts('alice',host.storage).drafts.comments.p1,'Second draft');
 }finally{host.close()}
});
test('signout clears both composer and private-message drafts only after success',async()=>{
 const state=live(),target=storage();state.drafts.comments={p1:'Clear when signed out'};saveLiveDrafts('alice',state,target);target.setItem('gwfamily:chat-draft:v1:alice:conversation1',JSON.stringify({text:'Private draft'}));let fail=true;
 const host=await adapterHarness(state,async()=>new Response(JSON.stringify(fail?{error:'Try again'}:{ok:true}),{status:fail?503:200}),target);
 try{await host.render().signOut();assert.ok(readLiveDrafts('alice',target).drafts);assert.ok(target.getItem('gwfamily:chat-draft:v1:alice:conversation1'));fail=false;await host.render().signOut();assert.deepEqual(readLiveDrafts('alice',target),{});assert.equal(target.getItem('gwfamily:chat-draft:v1:alice:conversation1'),null);assert.equal(host.render().state.mode,'preview');assert.equal(host.render().pending,false)}finally{host.close()}
});

let activityBundle;
async function presenceHarness(responder,{mode='live',status='active'}={}){
 if(!activityBundle){const {build}=await import('esbuild');const result=await build({entryPoints:[new URL('../src/activity.jsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'presence-hooks',setup(build){build.onResolve({filter:/^(react|\.\/ui-core\.jsx|\.\/live-adapter\.js)$/},args=>({path:args.path,namespace:'presence-hooks'}));build.onLoad({filter:/.*/,namespace:'presence-hooks'},args=>({contents:args.path==='react'?'const h=globalThis.__gwPresenceHarness;export const useState=h.useState,useRef=h.useRef,useEffect=h.useEffect,useCallback=f=>f;export default {};':args.path.includes('ui-core')?'export const useApp=()=>globalThis.__gwPresenceHarness.app;':'export const api=(...args)=>globalThis.__gwPresenceHarness.api(...args);'}))}}]});activityBundle=result.outputFiles[0].text}
 const original={document:globalThis.document,window:globalThis.window,harness:globalThis.__gwPresenceHarness},slots=[],effects=[],cleanup=[],calls=[];let cursor=0,first=true;
 const harness={app:{state:{mode,selfId:'alice'},data:{session:{status}}},api:async(...args)=>{calls.push(args);return responder(...args)},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=value}]},useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]},useEffect(fn){if(first)effects.push(fn)}};
 globalThis.__gwPresenceHarness=harness;globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});globalThis.window=new EventTarget();
 const module=await import('data:text/javascript;base64,'+Buffer.from(activityBundle).toString('base64')+'#'+crypto.randomUUID());
 return {calls,render(){cursor=0;const value=module.useTypingPresence({scope:'posts',id:'post-123'});if(first){first=false;for(const effect of effects)cleanup.push(effect())}return value},async flush(){for(let i=0;i<8;i++)await Promise.resolve()},close(){for(const fn of cleanup)fn?.();globalThis.document=original.document;globalThis.window=original.window;if(original.harness===undefined)delete globalThis.__gwPresenceHarness;else globalThis.__gwPresenceHarness=original.harness}};
}
test('typing renews only on real input callbacks, stops after idle and never transmits draft text',async t=>{
 const host=await presenceHarness(()=>({typing:[{memberId:'bob',name:'Bob',expiresAt:9000}],serverNow:Date.now()}));t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 try{
  host.render();await host.flush();assert.equal(host.render().typers[0].name,'Bob');assert.equal(host.calls.filter(([,options])=>options?.method==='POST').length,0);
  host.render().signal();await host.flush();assert.deepEqual(host.calls.filter(([,options])=>options?.method==='POST').map(([,options])=>JSON.parse(options.body)),[{typing:true}]);
  t.mock.timers.tick(3000);await host.flush();assert.equal(host.calls.filter(([,options])=>options?.method==='POST').length,1,'polling is not a fake typing heartbeat');
  t.mock.timers.tick(1500);await host.flush();assert.deepEqual(host.calls.filter(([,options])=>options?.method==='POST').map(([,options])=>JSON.parse(options.body)),[{typing:true},{typing:false}]);
  t.mock.timers.tick(4000);await host.flush();assert.deepEqual(host.render().typers,[]);
 }finally{host.close();await host.flush();t.mock.timers.reset()}
});
test('preview and unauthenticated typing hooks never touch the network',async()=>{
 for(const options of [{mode:'preview'},{status:'signed_out'}]){const host=await presenceHarness(()=>({typing:[]}),options);try{host.render().signal();await host.flush();assert.deepEqual(host.calls,[]);assert.deepEqual(host.render().typers,[])}finally{host.close()}}
});
test('a late typing response cannot revive an already expired writer',async t=>{
 let respond;const host=await presenceHarness(()=>new Promise(resolve=>{respond=resolve}));t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 try{host.render();await host.flush();t.mock.timers.tick(9000);respond({typing:[{memberId:'bob',name:'Bob',expiresAt:9000}],serverNow:1000});await host.flush();assert.deepEqual(host.render().typers,[])}finally{host.close();await host.flush();t.mock.timers.reset()}
});
