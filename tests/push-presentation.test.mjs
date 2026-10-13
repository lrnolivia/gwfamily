import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {boundedPushText,pushActivity,pushCopy,pushPresentation} from '../src/push-presentation.js';
import {readPushOpenTarget,pushOpenRoute} from '../src/push-open.js';
const now=1700000000000;
const payload={v:1,presentationVersion:2,noticeId:'fixture-notice',expiresAt:now+60000,activity:'message'};
function worker({maxActions=0,rejectActions=false,clients=[]}={}){
 const handlers={},shown=[],opened=[],navigated=[],focused=[];let attempts=0;
 const self={Notification:{maxActions},skipWaiting:async()=>{},location:{origin:'https://fictional.example.test'},addEventListener:(name,fn)=>handlers[name]=fn,
 registration:{showNotification:async(title,options)=>{attempts++;if(rejectActions&&options.actions)throw new TypeError('Unsupported actions');shown.push({title,options:structuredClone(options)})}},
 clients:{claim:async()=>{},matchAll:async()=>clients,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8'),{self,URL,Date:{now:()=>now},caches:{keys:async()=>[]}});
 return {handlers,shown,opened,navigated,focused,attempts:()=>attempts,async push(data){let pending;handlers.push({data:{json:()=>data},waitUntil:p=>pending=p});await pending},async click(data,action='',reply){let pending;handlers.notificationclick({action,reply,notification:{data,close(){}},waitUntil:p=>pending=p});await pending}};
}
test('category copy identifies the actual activity and test rather than repeating the app name',()=>{
 for(const [category,kind,activity,title]of [['messages','message.created','message','New message'],['messages','conversation.invited','invitation','Conversation invitation'],['messages','conversation.name_changed','conversation','Conversation updated'],['following','memory.published','memory','New shared memory'],['following','post.published','post','New family post'],['announcements','','announcement','Family announcement'],['replies','','reply','New reply']]){assert.equal(pushActivity(category,kind),activity);assert.equal(pushCopy(activity).title,title)}
 assert.deepEqual(pushCopy('test'),{title:'Test notification',body:'GW can send notifications to this device.'});
});
test('only a fresh approved version-two chat preview can display bounded sender and content',()=>{
 const rich={...payload,preview:{consent:true,sender:'Fictional Alice',text:'Are we meeting at noon?'}};
 assert.equal(pushPresentation(rich,now).title,'Fictional Alice');assert.equal(pushPresentation(rich,now).body,'Are we meeting at noon?');
 for(const change of [{presentationVersion:undefined},{v:2},{activity:'invitation'},{expiresAt:now},{noticeId:'https://evil.test'}, {preview:{sender:'Fictional Alice',text:'Are we meeting at noon?'}},{preview:{consent:true,sender:'',text:'Are we meeting at noon?'}}])assert.doesNotMatch(JSON.stringify(pushPresentation({...rich,...change},now)),/Fictional Alice|meeting at noon/);
 assert.equal(pushPresentation({...payload,title:'Unapproved name',body:'Unapproved content'},now).title,'New message');
});
test('preview text is bounded, single-line and strips control/directional spoofing without splitting emoji',()=>{
 assert.equal(boundedPushText('  Hi\nthere\u202e!\u0000 ',160),'Hi there !');
 const text=boundedPushText('😀'.repeat(200),160);assert.equal(Array.from(text).length,160);assert.ok(text.endsWith('…'));assert.equal(text.includes('\ufffd'),false);
 const display=pushPresentation({...payload,preview:{consent:true,sender:'A'.repeat(200),text:'B'.repeat(4000)}},now);assert.equal(display.title.length,80);assert.equal(display.body.length,160);
});
test('expired, missing, malformed and injected payloads stay generic with no bearer URL',async()=>{
 const w=worker();for(const data of [null,{}, {...payload,expiresAt:now}, {...payload,noticeId:'../../private',url:'https://evil.test'}, {...payload,presentationVersion:undefined,title:'Fictional secret',body:'Fictional message'}])await w.push(data);
 for(const {title,options}of w.shown){assert.equal(title,'Family update');assert.equal(options.actions,undefined);assert.doesNotMatch(JSON.stringify(options),/secret|Fictional message|evil\.test/)}
 await w.click({noticeId:'https://evil.test',url:'https://evil.test'});assert.equal(w.opened[0],'https://fictional.example.test/');
});
test('iPhone-style capability shows sender preview without pretending to support reply actions',async()=>{
 const w=worker();await w.push({...payload,preview:{consent:true,sender:'Fictional Alice',text:'Hello'}});
 assert.equal(w.shown[0].title,'Fictional Alice');assert.equal(w.shown[0].options.body,'Hello');assert.equal(w.shown[0].options.actions,undefined);
 await w.click(w.shown[0].options.data);assert.equal(w.opened[0],'https://fictional.example.test/?gwNotice=fixture-notice');
});
test('supported notification action opens exact authenticated composer with no automatic send',async()=>{
 const w=worker({maxActions:2});await w.push(payload);assert.deepEqual(w.shown[0].options.actions,[{action:'reply',title:'Reply in GW'}]);
 await w.click(w.shown[0].options.data,'reply','Unexpected typed content');assert.equal(w.opened[0],'https://fictional.example.test/?gwNotice=fixture-notice&gwReply=1');assert.doesNotMatch(w.opened[0],/Unexpected|content/);assert.equal(w.handlers.fetch,undefined);
 const target=readPushOpenTarget(w.opened[0]);assert.deepEqual(target,{id:'fixture-notice',reply:true});assert.deepEqual(pushOpenRoute(target,{available:true,route:{type:'chat',id:'authorized-conversation'}}),{type:'chat',id:'authorized-conversation',section:'reply'});
 assert.equal(pushOpenRoute(target,{available:false}),null);assert.deepEqual(pushOpenRoute(target,{available:true,route:{type:'inbox',section:'invitations'}}),{type:'inbox',section:'invitations'});
});
test('action rendering failure falls back to ordinary notification; unrelated events have no reply',async()=>{
 const w=worker({maxActions:2,rejectActions:true});await w.push(payload);assert.equal(w.attempts(),2);assert.equal(w.shown[0].options.actions,undefined);
 await w.push({...payload,activity:'membership'});assert.equal(w.shown[1].options.actions,undefined);
});
test('test is accurately labeled, routes to settings, and never claims a real message arrived',async()=>{
 const w=worker({maxActions:2});await w.push({v:1,presentationVersion:2,test:true,expiresAt:now+60000});assert.equal(w.shown[0].title,'Test notification');assert.equal(w.shown[0].options.body,'GW can send notifications to this device.');assert.equal(w.shown[0].options.actions,undefined);await w.click(w.shown[0].options.data);assert.equal(w.opened[0],'https://fictional.example.test/?gwPushTest=1');
});
test('separate incoming messages retain independent notification identities',()=>{
 assert.notEqual(pushPresentation(payload,now).tag,pushPresentation({...payload,noticeId:'fixture-other'},now).tag);
});
test('a disappearing same-origin window falls back to opening the safe exact URL',async()=>{
 const w=worker({clients:[{url:'https://evil.test',navigate(){throw Error('must not navigate another origin')}},{url:'https://fictional.example.test/',navigate:async()=>{throw Error('closed')}}]});await w.click({noticeId:'fixture-notice'});assert.equal(w.opened[0],'https://fictional.example.test/?gwNotice=fixture-notice');
});

test('an expired sign-in or offline reload preserves only the opaque pending destination until resolved',async()=>{
 const {pendingPushOpen,clearPendingPushOpen}=await import('../src/push-open.js');const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const target=pendingPushOpen('https://fictional.example.test/?gwNotice=fixture-notice&gwReply=1',storage,now);assert.deepEqual(target,{id:'fixture-notice',reply:true});
 assert.deepEqual(pendingPushOpen('https://fictional.example.test/#/home',storage,now+1000),target);assert.doesNotMatch([...values.values()].join(''),/body|messageText|accountId|conversationId/);
 clearPendingPushOpen(storage);assert.equal(pendingPushOpen('https://fictional.example.test/',storage,now+2000),null);
 pendingPushOpen('https://fictional.example.test/?gwNotice=fixture-notice',storage,now);assert.equal(pendingPushOpen('https://fictional.example.test/',storage,now+86400000),null);
});

test('new payload preserves opaque deep-link compatibility in the exact legacy service worker',async()=>{
 const {genericPayload,deliveryPayload}=await import('../backend/src/push-policy.mjs');
 const oldSource=readFileSync(new URL('./fixtures/push-sw-8bddc0a.js',import.meta.url),'utf8');
 const handlers={},shown=[],opened=[],self={location:{origin:'https://fictional.example.test'},addEventListener:(type,fn)=>handlers[type]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(oldSource,{self,URL,Date:{now:()=>now}});
 for(const outgoing of [genericPayload('fixture-generic',now+60000,{category:'messages',kind:'message.created'}),deliveryPayload({notification_id:'fixture-rich',category:'messages',kind:'message.created',preview_enabled:1,preview_allowed:1,preview_sender:'Fictional Alice',preview_text:'Private fictional text'},now+60000)]){
  let pending;handlers.push({data:{json:()=>outgoing},waitUntil:value=>pending=value});await pending;const notification=shown.at(-1);assert.equal(notification.options.data.noticeId,outgoing.noticeId);assert.doesNotMatch(JSON.stringify(notification),/Fictional Alice|Private fictional text/);
  handlers.notificationclick({notification:{data:notification.options.data,close(){}},waitUntil:value=>pending=value});await pending;assert.equal(opened.at(-1),'https://fictional.example.test/?gwNotice='+outgoing.noticeId);
 }
});

test('emitted worker activates immediately, clears only obsolete public caches, and never intercepts authenticated fetch',async()=>{
 const handlers={},removed=[];let skipped=0,claimed=0;
 const self={skipWaiting:async()=>skipped++,location:{origin:'https://fictional.example.test'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>claimed++}};
 vm.runInNewContext(readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8'),{self,URL,Date,caches:{keys:async()=>['gw-static-old','unrelated-app-cache'],delete:async key=>removed.push(key)}});
 for(const event of ['install','activate']){let pending;handlers[event]({waitUntil:value=>pending=value});await pending;}
 assert.equal(skipped,1);assert.equal(claimed,1);assert.deepEqual(removed,['gw-static-old']);assert.equal(handlers.fetch,undefined);
});
