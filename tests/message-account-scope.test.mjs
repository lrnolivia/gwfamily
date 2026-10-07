import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeMessages} from '../src/messaging-model.js';
const source=await readFile(new URL('../src/messaging.jsx',import.meta.url),'utf8');
const same=(a,b)=>a?.length===b?.length&&a?.every((value,index)=>Object.is(value,b[index]));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {resolve,reject,promise}};
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
async function harness(name){
 const start=source.indexOf(name==='useConversation'?'function useConversation(':'export function useMessaging('),end=source.indexOf(name==='useConversation'?'function ChatComposer(':'export function MessagesButton(',start);
 const logic=source.slice(start,end).replace(/^function useConversation/,'export function useConversation');
 const slots=[],effects=[],requests=[],app={state:{mode:'live',selfId:'alice',onboarding:'done',members:[]},messaging:{revision:0}};let cursor=0;
 const globals={h:globalThis.__messageScopeHarness};
 globalThis.__messageScopeHarness={useApp:()=>app,mergeMessages,
  useState(initial){const n=cursor++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return [slots[n].value,value=>{slots[n].value=typeof value==='function'?value(slots[n].value):value}]},
  useRef(value){const n=cursor++;if(!(n in slots))slots[n]={current:value};return slots[n]},
  useCallback(fn,deps){const n=cursor++;if(!same(slots[n]?.deps,deps))slots[n]={deps,value:fn};return slots[n].value},
  useEffect(fn,deps){const n=cursor++,old=slots[n];if(!same(old?.deps,deps)){slots[n]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[n].cleanup=fn()})}},
  chatApi(path){const wait=deferred();requests.push({path,...wait});return wait.promise}
 };
 const js=`const {useApp,useState,useRef,useEffect,useCallback,chatApi,mergeMessages}=globalThis.__messageScopeHarness;const window={addEventListener(){},removeEventListener(){}},document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};const setInterval=()=>1,clearInterval=()=>{};${logic}`;
 const module=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64')+'#'+crypto.randomUUID());
 return {app,requests,render({flush=true,id='room'}={}){cursor=0;const value=module[name](name==='useMessaging'?app.state:id);if(flush)this.flush();return value},flush(){for(const effect of effects.splice(0))effect()},close(){for(const slot of slots)slot?.cleanup?.();if(globals.h===undefined)delete globalThis.__messageScopeHarness;else globalThis.__messageScopeHarness=globals.h}};
}
test('actual inbox index suppresses previous-account messages before effect cleanup',async()=>{
 const h=await harness('useMessaging');try{h.render();h.requests.find(r=>r.path==='/api/conversations').resolve({conversations:[{id:'alice-private',unreadCount:1}],invitations:[]});h.requests.find(r=>r.path.endsWith('/recipients')).resolve({members:[]});await settle();assert.equal(h.render().conversations[0].id,'alice-private');h.app.state={...h.app.state,selfId:'bob'};const switched=h.render({flush:false});assert.deepEqual(switched.conversations,[]);assert.equal(switched.unread,0);assert.equal(switched.loading,true);h.flush()}finally{h.close()}
});
test('actual conversation suppresses previous-account messages and rejects late older-page results',async()=>{
 const h=await harness('useConversation');try{h.render();h.requests.find(r=>r.path==='/api/conversations/room').resolve({conversation:{id:'room',name:'Alice private'}});h.requests.find(r=>r.path.endsWith('/messages')).resolve({messages:[{id:'alice-current',sequence:2}],hasMore:true,nextBefore:2});await settle();const ui=h.render();assert.equal(ui.messages[0].id,'alice-current');const old=ui.loadOlder(),request=h.requests.find(r=>r.path.includes('?before='));h.app.state={...h.app.state,selfId:'bob'};let switched=h.render({flush:false});assert.deepEqual(switched.messages,[]);assert.equal(switched.conversation,null);assert.equal(switched.loading,true);request.resolve({messages:[{id:'alice-older',sequence:1}],hasMore:false});await old;switched=h.render({flush:false});assert.deepEqual(switched.messages,[]);h.flush();await settle();assert.equal(h.render().messages.some(m=>m.id==='alice-older'),false)}finally{h.close()}
});
test('actual conversation rejects delayed refresh when the account switches before cleanup',async()=>{
 const h=await harness('useConversation');try{h.render();const stale=[...h.requests];h.app.state={...h.app.state,selfId:'bob'};h.render({flush:false});stale.find(r=>r.path.endsWith('/room')).resolve({conversation:{id:'room',name:'Wrong account'}});stale.find(r=>r.path.endsWith('/messages')).resolve({messages:[{id:'wrong-account',sequence:1}],hasMore:false});await settle();assert.deepEqual(h.render({flush:false}).messages,[]);h.flush();assert.deepEqual(h.render().messages,[])}finally{h.close()}
});
