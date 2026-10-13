import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {documentReadLifecycle} from '../src/document-read-lifecycle.js';
import {mergeMessages,conversationIndexReads} from '../src/messaging-model.js';
const source=await readFile(new URL('../src/messaging.jsx',import.meta.url),'utf8');
const same=(a,b)=>a?.length===b?.length&&a?.every((value,index)=>Object.is(value,b[index]));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {resolve,reject,promise}};
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
async function harness(name){
 const start=source.indexOf(name==='useConversation'?'function useConversation(':'export function useMessaging('),end=source.indexOf(name==='useConversation'?'function ChatComposer(':'export function MessagesButton(',start);
 const logic=source.slice(start,end).replace(/^function useConversation/,'export function useConversation');
 const slots=[],effects=[],requests=[],app={state:{mode:'live',selfId:'alice',onboarding:'done',members:[]},messaging:{revision:0}};let cursor=0;
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState="visible";const messagingDocument=documentReadLifecycle(win,doc);
 const globals={h:globalThis.__messageScopeHarness};
 globalThis.__messageScopeHarness={useApp:()=>app,mergeMessages,conversationIndexReads,messagingDocument,
  useState(initial){const n=cursor++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return [slots[n].value,value=>{slots[n].value=typeof value==='function'?value(slots[n].value):value}]},
  useRef(value){const n=cursor++;if(!(n in slots))slots[n]={current:value};return slots[n]},
  useCallback(fn,deps){const n=cursor++;if(!same(slots[n]?.deps,deps))slots[n]={deps,value:fn};return slots[n].value},
  useEffect(fn,deps){const n=cursor++,old=slots[n];if(!same(old?.deps,deps)){slots[n]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[n].cleanup=fn()})}},
  chatApi(path){const wait=deferred();requests.push({path,...wait});return wait.promise}
 };
 const js=`const {useApp,useState,useRef,useEffect,useCallback,chatApi,mergeMessages,conversationIndexReads,messagingDocument}=globalThis.__messageScopeHarness;const window={addEventListener(){},removeEventListener(){}},document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};const setInterval=()=>1,clearInterval=()=>{};${logic}`;
 const module=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64')+'#'+crypto.randomUUID());
 return {app,requests,win,render({flush=true,id='room'}={}){cursor=0;const value=module[name](name==='useMessaging'?app.state:id);if(flush)this.flush();return value},flush(){for(const effect of effects.splice(0))effect()},close(){messagingDocument.dispose();for(const slot of slots)slot?.cleanup?.();if(globals.h===undefined)delete globalThis.__messageScopeHarness;else globalThis.__messageScopeHarness=globals.h}};
}
test('actual inbox index suppresses previous-account messages before effect cleanup',async()=>{
 const h=await harness('useMessaging');try{h.render();await settle();h.requests.find(r=>r.path==='/api/conversations').resolve({conversations:[{id:'alice-private',unreadCount:1}],invitations:[]});h.requests.find(r=>r.path.endsWith('/recipients')).resolve({members:[]});await settle();assert.equal(h.render().conversations[0].id,'alice-private');h.app.state={...h.app.state,selfId:'bob'};const switched=h.render({flush:false});assert.deepEqual(switched.conversations,[]);assert.equal(switched.unread,0);assert.equal(switched.loading,true);h.flush()}finally{h.close()}
});
test('confirmed read updates known unread counts without another fetch and preserves newer messages',async()=>{
 const h=await harness('useMessaging');try{
  h.render();await settle();h.requests.find(r=>r.path==='/api/conversations').resolve({conversations:[{id:'room',latestSequence:4,readSequence:1,unreadCount:3},{id:'other',latestSequence:8,readSequence:7,unreadCount:1}],invitations:[],unreadCount:9});
  h.requests.find(r=>r.path.endsWith('/recipients')).resolve({members:[]});await settle();
  const ui=h.render(),requests=h.requests.length;
  ui.acknowledgeRead('room',3);assert.equal(h.render().unread,9,'A receipt behind the latest known message cannot clear the conversation.');
  ui.acknowledgeRead('room',4);let next=h.render();assert.equal(next.unread,6);assert.equal(next.conversations[0].unreadCount,0);assert.equal(next.conversations[0].readSequence,4);assert.equal(next.conversations[1].unreadCount,1);
  ui.acknowledgeRead('room',4);assert.equal(h.render().unread,6,'Repeated receipts cannot subtract twice.');assert.equal(h.requests.length,requests,'Receipt completion does not start an unload-time fetch.');
  h.app.state={...h.app.state,selfId:'bob'};h.render();await settle();h.requests.slice(requests).find(r=>r.path==='/api/conversations').resolve({conversations:[{id:'room',latestSequence:4,readSequence:0,unreadCount:4}],invitations:[],unreadCount:4});h.requests.slice(requests).find(r=>r.path.endsWith('/recipients')).resolve({members:[]});await settle();
  ui.acknowledgeRead('room',4);assert.equal(h.render().unread,4,'A late receipt from Alice cannot clear Bob’s unread count.');
 }finally{h.close()}
});
test('actual conversation suppresses previous-account messages and rejects late older-page results',async()=>{
 const h=await harness('useConversation');try{h.render();await settle();h.requests.find(r=>r.path==='/api/conversations/room').resolve({conversation:{id:'room',name:'Alice private'}});h.requests.find(r=>r.path.endsWith('/messages')).resolve({messages:[{id:'alice-current',sequence:2}],hasMore:true,nextBefore:2});await settle();const ui=h.render();assert.equal(ui.messages[0].id,'alice-current');const old=ui.loadOlder(),request=h.requests.find(r=>r.path.includes('?before='));h.app.state={...h.app.state,selfId:'bob'};let switched=h.render({flush:false});assert.deepEqual(switched.messages,[]);assert.equal(switched.conversation,null);assert.equal(switched.loading,true);request.resolve({messages:[{id:'alice-older',sequence:1}],hasMore:false});await old;switched=h.render({flush:false});assert.deepEqual(switched.messages,[]);h.flush();await settle();assert.equal(h.render().messages.some(m=>m.id==='alice-older'),false)}finally{h.close()}
});
test('actual conversation rejects delayed refresh when the account switches before cleanup',async()=>{
 const h=await harness('useConversation');try{h.render();const stale=[...h.requests];h.app.state={...h.app.state,selfId:'bob'};h.render({flush:false});stale.find(r=>r.path.endsWith('/room')).resolve({conversation:{id:'room',name:'Wrong account'}});stale.find(r=>r.path.endsWith('/messages')).resolve({messages:[{id:'wrong-account',sequence:1}],hasMore:false});await settle();assert.deepEqual(h.render({flush:false}).messages,[]);h.flush();assert.deepEqual(h.render().messages,[])}finally{h.close()}
});

test('actual inbox cancels queued polling on unload and resumes after pageshow',async()=>{
 const h=await harness('useMessaging');try{
  const ui=h.render();h.win.dispatchEvent(new Event('beforeunload'));await settle();
  assert.equal(h.requests.some(r=>r.path==='/api/conversations'),false);
  ui.refresh();await settle();assert.equal(h.requests.some(r=>r.path==='/api/conversations'),false);
  h.win.dispatchEvent(new Event('pagehide'));h.win.dispatchEvent(new Event('focus'));ui.refresh();await settle();
  assert.equal(h.requests.some(r=>r.path==='/api/conversations'),false);
  h.win.dispatchEvent(new Event('pageshow'));await settle();
  assert.equal(h.requests.filter(r=>r.path==='/api/conversations').length,1);
 }finally{h.close()}
});
