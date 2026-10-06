import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from './ui-core.jsx';
import {api} from './live-adapter.js';

export function ActivityDots({label='Saving…',compact=false,className='',...props}){
 return <span {...props} className={'activity-dots '+(compact?'is-compact ':'')+className} role="status" aria-live="polite" aria-label={label}><span className="activity-dots-visual" aria-hidden="true"><span/><span/><span/></span><span className={compact?'sr-only':'activity-dots-label'}>{label}</span></span>;
}
const POLL_MS=2500,HEARTBEAT_MS=2500,IDLE_MS=4500,MAX_TTL_MS=8000;
const channels=new Map();
const visible=()=>typeof document==='undefined'||document.visibilityState==='visible';
const expiresAt=value=>typeof value==='number'?value:Date.parse(value);
async function typingRequest(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{return await api(path,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}
function channelFor(key,path,selfId){
 let entry=channels.get(key);if(entry)return entry;
 let snapshot=[],disposed=false,polling=false,pollTimer,expiryTimer,idleTimer,lastSent=0,signaled=false,lastPoll=0,version=0,chain=Promise.resolve();
 const subscribers=new Set(),sources=new Map();
 const notify=()=>{for(const listener of subscribers)listener(snapshot)};
 const setSnapshot=next=>{snapshot=next;notify()};
 const expire=()=>{const next=snapshot.filter(person=>person.expiresAt>Date.now());if(next.length!==snapshot.length)setSnapshot(next)};
 const accept=(result,ticket,startedAt)=>{
  if(disposed||ticket!==version)return;
  const now=Date.now(),serverNow=Number(result.serverNow)||now,transit=Math.max(0,now-startedAt);
  const next=(Array.isArray(result.typing)?result.typing:[]).flatMap(person=>{
   if(!person||typeof person!=='object')return [];
   const remaining=Math.min(MAX_TTL_MS,expiresAt(person.expiresAt)-serverNow)-transit;
   return person?.memberId&&person.memberId!==selfId&&typeof person.name==='string'&&Number.isFinite(remaining)&&remaining>0?[{memberId:person.memberId,name:person.name,expiresAt:now+remaining}]:[];
  });setSnapshot(next);
 };
 const read=async()=>{
  if(disposed||polling||!visible())return;
  polling=true;const ticket=++version,startedAt=Date.now();lastPoll=startedAt;
  try{accept(await typingRequest(path),ticket,startedAt)}catch{if(ticket===version)setSnapshot([])}finally{polling=false}
 };
 const write=typing=>{
  const ticket=++version;
  chain=chain.catch(()=>{}).then(async()=>{
   // An input that ended while an earlier request was pending is never replayed.
   if(typing&&(!sources.size||disposed))return;
   const startedAt=Date.now();
   try{accept(await typingRequest(path,{method:'POST',body:JSON.stringify({typing}),keepalive:!typing}),ticket,startedAt)}catch{if(!disposed&&ticket===version)setSnapshot([])}
  });
 };
 const endPresence=()=>{if(signaled){signaled=false;lastSent=0;write(false)}};
 const expireSources=()=>{
  clearTimeout(idleTimer);const now=Date.now();for(const [source,time]of sources)if(now-time>=IDLE_MS)sources.delete(source);
  if(!sources.size){endPresence();return}
  idleTimer=setTimeout(expireSources,Math.max(0,Math.min(...sources.values())+IDLE_MS-now));
 };
 const stop=source=>{sources.delete(source);expireSources()};
 const stopAll=()=>{sources.clear();clearTimeout(idleTimer);endPresence()};
 const onVisibility=()=>{if(!visible()){stopAll();setSnapshot([])}else read()};
 entry={
  subscribe(listener){
   subscribers.add(listener);listener(snapshot);
   if(subscribers.size===1){read();pollTimer=setInterval(read,POLL_MS);expiryTimer=setInterval(expire,250);document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',stopAll);window.addEventListener('blur',stopAll)}
   return()=>{subscribers.delete(listener);if(!subscribers.size){stopAll();disposed=true;clearInterval(pollTimer);clearInterval(expiryTimer);clearTimeout(idleTimer);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',stopAll);window.removeEventListener('blur',stopAll);channels.delete(key)}};
  },
  signal(source){
   if(disposed||!visible())return;
   const now=Date.now();sources.set(source,now);expireSources();
   // Renewal happens only inside this input callback, never on a heartbeat timer.
   if(!signaled||now-lastSent>=HEARTBEAT_MS){signaled=true;lastSent=now;write(true)}
   if(now-lastPoll>=POLL_MS)read();
  },stop
 };
 channels.set(key,entry);return entry;
}
export function useTypingPresence({scope,id,enabled=true}){
 const app=useApp(),selfId=app?.state?.selfId,live=app?.state?.mode==='live'&&app?.data?.session?.status==='active';
 const allowed=enabled&&live&&!!id&&['posts','conversations'].includes(scope),[typers,setTypers]=useState([]),entryRef=useRef(null),sourceRef=useRef(Symbol('typing-editor'));
 useEffect(()=>{
  setTypers([]);if(!allowed)return;
  const key=[selfId,scope,id].join(':'),entry=channelFor(key,`/api/${scope}/${encodeURIComponent(id)}/typing`,selfId);entryRef.current=entry;
  const unsubscribe=entry.subscribe(setTypers);
  return()=>{entry.stop(sourceRef.current);unsubscribe();if(entryRef.current===entry)entryRef.current=null};
 },[allowed,scope,id,selfId]);
 const signal=useCallback(()=>entryRef.current?.signal(sourceRef.current),[]);
 const stop=useCallback(()=>entryRef.current?.stop(sourceRef.current),[]);
 return {typers:allowed?typers:[],signal,stop};
}
export function typingLabel(typers){
 if(!typers.length)return '';
 if(typers.length===1)return typers[0].name+' is typing…';
 if(typers.length===2)return typers[0].name+' and '+typers[1].name+' are typing…';
 return typers[0].name+' and '+(typers.length-1)+' others are typing…';
}
