import React,{useEffect,useRef,useState} from 'react';
import {initialState,loadLocalState,saveLocalState,reducer} from './data-adapter.js';
import {clearChatDrafts} from './messaging-model.js';
import {saveLiveDrafts,readLiveDrafts,clearLiveDrafts,retainDraftAccount,hasLocalDrafts,commandFingerprint,readCommandRequests,saveCommandRequests,preserveNewerDrafts} from './draft-storage.js';
export async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
 let value;try{value=await response.json()}catch{throw Object.assign(new Error('The service returned an unreadable response. Please try again.'),{status:response.status,ambiguous:response.ok||response.status>=500})}
 if(!response.ok)throw Object.assign(new Error(value.error?.message||value.error||value.message||'That action could not be saved.'),{status:response.status});return value;
}
export const isAmbiguousCommandError=error=>!error.status||error.ambiguous===true||error.status>=500||error.status===408;
export async function sendCommand(payload){
 // The same receipt identifier protects both automatic and explicit retries.
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{return await api('/api/commands',{method:'POST',body:JSON.stringify(payload),signal:controller.signal})}
  catch(error){if(attempt||!isAmbiguousCommandError(error))throw error}
  finally{clearTimeout(timer)}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
}
const reviewOnly=typeof location!=='undefined'&&location.pathname.startsWith('/__review/');
const modeKey=reviewOnly?'gw-review-mode':'gw-active-mode';
const localTypes=new Set(['SET_DRAFT','SET_DRAFT_FILES','SET_COMPOSE','SET_FEED_FILTER','SET_PEOPLE_FILTER','SET_MEMORY_FILTERS','BAG_ADD','BAG_REMOVE']);
const localFields=['drafts','compose','feedFilter','peopleFilter','memoryFilters','bag'];
export function useFamilyData(){
 const [state,setState]=useState(loadLocalState),[session,setSession]=useState(null),[config,setConfig]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[pending,setPending]=useState(false),[draftStorageStatus,setDraftStorageStatus]=useState({ok:true}),[preview,setPreview]=useState(()=>{try{return reviewOnly||sessionStorage.getItem(modeKey)==='preview'}catch{return false}});
 const epoch=useRef(0),ref=useRef(state),busy=useRef(false),workCount=useRef(0),after=useRef(null),alive=useRef(true),requestBook=useRef({accountId:null,requests:{},confirmed:new Set()});ref.current=state;
 const save=next=>{
  ref.current=next;setState(next);
  if(next.mode==='preview'){const result=saveLocalState(next);setDraftStorageStatus(result);if(!result.ok)setError(result.error);return result}
  if(next.mode==='live'){
   const result=saveLiveDrafts(next.selfId,next),book=requestBook.current;
   if(book.accountId===next.selfId){
    // Keep a confirmed receipt until the cleared draft checkpoint is durable.
    if(result.ok){for(const fingerprint of book.confirmed)delete book.requests[fingerprint];book.confirmed.clear()}
    if(!saveCommandRequests(next.selfId,book.requests)){result.ok=false;result.error='Retry recovery could not be saved locally. Keep this tab open until your changes finish.'}
   }
   setDraftStorageStatus(result);if(!result.ok)setError(result.error);return result;
  }
 };
 function settlePending(){
  const waiting=busy.current||workCount.current>0;if(alive.current)setPending(waiting);
  if(!waiting){const done=after.current;after.current=null;done?.()}
 }
 function beginPending(){
  workCount.current++;setPending(true);let finished=false;
  return()=>{if(finished)return;finished=true;workCount.current=Math.max(0,workCount.current-1);settlePending()};
 }
 async function refresh(){
  if(reviewOnly){setConfig({configured:false,email:false,providers:[]});setSession(null);setLoading(false);return}
  const generation=epoch.current;
  try{
   const [cfg,sess]=await Promise.all([api('/api/config'),api('/api/session')]);if(!alive.current||generation!==epoch.current)return;setConfig(cfg);setSession(sess);
   if(sess.status==='active'&&!preview){
    const next=await api('/api/state');if(alive.current&&generation===epoch.current){
     const sameAccount=ref.current.mode==='live'&&ref.current.selfId===next.selfId;
     if(ref.current.mode==='live'&&ref.current.selfId!==next.selfId)clearChatDrafts(ref.current.selfId);
     retainDraftAccount(next.selfId);
     const local=sameAccount?Object.fromEntries(localFields.map(key=>[key,ref.current[key]])):readLiveDrafts(next.selfId);
     if(requestBook.current.accountId!==next.selfId)requestBook.current={accountId:next.selfId,requests:readCommandRequests(next.selfId),confirmed:new Set()};
     save({...next,...local});
    }
   }else if(sess.status!=='active'&&!preview&&ref.current.mode==='live'){
    // A revoked or signed-out session must not leave the previous account in view.
    clearChatDrafts(ref.current.selfId);retainDraftAccount(null);requestBook.current={accountId:null,requests:{},confirmed:new Set()};save(initialState());
   }
   return sess;
  }catch(e){if(alive.current&&generation===epoch.current){setConfig({configured:false,email:false,providers:[]});setError(e.status===404?'':e.message)}}finally{if(alive.current&&generation===epoch.current)setLoading(false)}
 }
 useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false}},[preview]);
 useEffect(()=>{if(preview||session?.status!=='active')return;const tick=()=>{if(document.visibilityState==='visible'&&!busy.current&&!workCount.current)refresh()};const timer=setInterval(tick,15000);window.addEventListener('online',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick)}},[preview,session?.status]);
 function dispatch(action){
  if(ref.current.mode==='preview'){save(reducer(ref.current,action));return Promise.resolve(true)}
  if(localTypes.has(action.type)){const next=reducer({...ref.current,mode:'preview'},action);save({...next,mode:'live'});return Promise.resolve(true)}
  if(busy.current)return Promise.resolve(false);
  busy.current=true;setPending(true);setError('');const before=ref.current,generation=epoch.current,payload={...action};
  if(action.type==='CLAIM_ORDER')payload.lines=before.bag.flatMap(p=>Object.entries(p.sizes).filter(([,quantity])=>quantity>0).map(([size,quantity])=>({productId:p.productId,size,quantity})));
  if(action.type==='ORDER_RECEIVED')payload.id=before.order?.id;
  return (async()=>{
   let fingerprint,confirmed=false;
   try{
    fingerprint=await commandFingerprint(payload);
    if(requestBook.current.accountId!==before.selfId)requestBook.current={accountId:before.selfId,requests:readCommandRequests(before.selfId),confirmed:new Set()};
    const requests=requestBook.current.requests;payload.requestId=requests[fingerprint]||crypto.randomUUID();requests[fingerprint]=payload.requestId;
    if(!saveCommandRequests(before.selfId,requests))setDraftStorageStatus({ok:false,error:'Retry recovery could not be saved locally. Keep this tab open until your changes finish.'});
    const result=await sendCommand(payload);confirmed=true;
    if(!alive.current||generation!==epoch.current||ref.current.selfId!==before.selfId)return true;
    // Commit local draft cleanup immediately after the acknowledged write. A failed
    // read-back cannot turn a successful send into a second submission.
    const updated=preserveNewerDrafts(ref.current,before,reducer({...ref.current,mode:'preview'},action),action);
    const local=Object.fromEntries(localFields.map(key=>[key,updated[key]]));if(action.type==='CLAIM_ORDER')local.bag=[];
    requestBook.current.confirmed.add(fingerprint);
    save({...ref.current,...local});
    try{
     const server=await api('/api/state');
     if(alive.current&&generation===epoch.current&&ref.current.selfId===before.selfId){if(server.selfId!==before.selfId){await refresh()}else{const latest=Object.fromEntries(localFields.map(key=>[key,ref.current[key]]));save({...server,...latest})}}
    }catch{if(alive.current&&generation===epoch.current)setError('Your change was saved. The latest view could not load; it will refresh when the connection returns.')}
    return true;
   }catch(e){
    if(fingerprint&&!confirmed&&!isAmbiguousCommandError(e)){delete requestBook.current.requests[fingerprint];saveCommandRequests(before.selfId,requestBook.current.requests)}
    if(alive.current&&generation===epoch.current)setError((e.name==='AbortError'?'The connection timed out.':e.message)+' Your unsent changes are still here.');
    return false;
   }finally{busy.current=false;settlePending()}
  })();
 }
 function defer(fn){if(busy.current||workCount.current){after.current=fn;return true}return false}
 function enterPreview(){if(busy.current||workCount.current)return;epoch.current++;try{sessionStorage.setItem(modeKey,'preview')}catch{}save(loadLocalState());setPreview(true);setLoading(false);setError('')}
 function leavePreview(){if(busy.current||workCount.current)return;epoch.current++;try{sessionStorage.removeItem(modeKey)}catch{}setPreview(false);setLoading(true);save(initialState());refresh()}
 async function signOut(){
  if(busy.current||workCount.current)return;const finish=beginPending();
  try{await api('/api/auth/sign-out',{method:'POST',body:'{}'});epoch.current++;clearLiveDrafts(ref.current.selfId);clearChatDrafts(ref.current.selfId);retainDraftAccount(null);requestBook.current={accountId:null,requests:{},confirmed:new Set()};setSession(null);save(initialState());setPreview(false);try{sessionStorage.removeItem(modeKey)}catch{}}
  catch(e){setError(e.message)}finally{finish()}
 }
 async function upload(file){if(ref.current.mode==='preview'){const {readPreviewFile}=await import('./uploads.js');return readPreviewFile(file)}const data=new FormData();data.append('file',file);const finish=beginPending();try{return await api('/api/media',{method:'POST',body:data})}finally{finish()}}
 return {state,dispatch,session,config,loading,error,pending,preview,enterPreview,leavePreview,refresh,signOut,upload,defer,setError,beginPending,draftStorageStatus,hasLocalDrafts:hasLocalDrafts(state)};
}
