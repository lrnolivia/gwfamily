import {requestReference,withRequestReference} from './request-reference.js';
import {shareUnchangedSnapshot} from './refresh-stability.js';
import {reunionQuery,REUNION_SCOPED_COMMANDS} from './reunion-model.js';
import React,{useEffect,useRef,useState} from 'react';
import {initialReadRecovery,recoverableInitialRead,readWithRecovery} from './live-read-recovery.js';
import {initialState,loadLocalState,saveLocalState,reducer} from './data-adapter.js';
import {mergeNotificationResource} from './notification-model.js';
import {clearChatDrafts} from './messaging-model.js';
import {saveLiveDrafts,readLiveDrafts,clearLiveDrafts,retainDraftAccount,hasLocalDrafts,commandFingerprint,readCommandRequests,saveCommandRequests,preserveNewerDrafts} from './draft-storage.js';
export async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
 let value;try{value=await response.json()}catch{const requestId=requestReference(null,response);throw Object.assign(new Error(withRequestReference('The service returned an unreadable response. Please try again.',requestId)),{status:response.status,ambiguous:response.ok||response.status>=500,...(requestId?{requestId}:{})})}
 if(!response.ok){const requestId=requestReference(value,response);throw Object.assign(new Error((value?.error?.message||(typeof value?.error==='string'?value.error:null)||value?.message||'That action could not be saved.')+(requestId?' Reference: '+requestId:'')),{status:response.status,...(requestId?{requestId}:{})})}return value;
}

// Notification requests never refetch the full feed. Every open is reauthorized
// by the server and returns a typed destination, never a database-supplied URL.
async function notificationRequest(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
 if(options.signal?.aborted)controller.abort();
 try{return await api(path,{...options,signal:controller.signal})}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}
}
export const notificationApi=Object.freeze({
 list:({before,limit=30,signal}={})=>notificationRequest('/api/notifications?'+new URLSearchParams({limit:String(limit),...(before!=null?{before:String(before)}:{})}),{signal}),
 settings:()=>notificationRequest('/api/me/notifications'),
 saveSettings:(patch,revision,expectedAccountId)=>notificationRequest('/api/me/notifications',{method:'PUT',body:JSON.stringify({...patch,revision,expectedAccountId})}),
 read:(id,expectedAccountId)=>notificationRequest('/api/notifications/'+encodeURIComponent(id)+'/read',{method:'POST',body:JSON.stringify({expectedAccountId})}),
 readAll:(cutoff,expectedAccountId)=>notificationRequest('/api/notifications/read-all',{method:'POST',body:JSON.stringify({cutoff,expectedAccountId})}),
 dismissAll:(cutoff,expectedAccountId)=>notificationRequest('/api/notifications/dismiss-all',{method:'POST',body:JSON.stringify({cutoff,expectedAccountId})}),
 dismiss:(id,expectedAccountId)=>notificationRequest('/api/notifications/'+encodeURIComponent(id)+'/dismiss',{method:'POST',body:JSON.stringify({expectedAccountId})}),
 open:(id,expectedAccountId)=>notificationRequest('/api/notifications/'+encodeURIComponent(id)+'/open'+(expectedAccountId?'?expectedAccountId='+encodeURIComponent(expectedAccountId):''))
});

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
const readApi=(path,signal)=>readWithRecovery(attemptSignal=>api(path,{signal:attemptSignal}),{signal});
const reviewOnly=typeof location!=='undefined'&&location.pathname.startsWith('/__review/');
const modeKey=reviewOnly?'gw-review-mode':'gw-active-mode';
const localTypes=new Set(['SET_DRAFT','SET_DRAFT_FILES','SET_COMPOSE','SET_FEED_FILTER','SET_PEOPLE_FILTER','SET_MEMORY_FILTERS','BAG_ADD','BAG_REMOVE']);
const localFields=['drafts','compose','feedFilter','peopleFilter','memoryFilters','bag'];
export function useFamilyData(){
 const [state,setState]=useState(loadLocalState),[session,setSession]=useState(null),[config,setConfig]=useState(null),[loading,setLoading]=useState(true),[actionError,setError]=useState(''),[loadError,setLoadError]=useState(''),[pending,setPending]=useState(false),[draftStorageStatus,setDraftStorageStatus]=useState({ok:true}),[preview,setPreview]=useState(()=>{try{return reviewOnly||sessionStorage.getItem(modeKey)==='preview'}catch{return false}});
 const bootstrapRetry=useRef(false),bootstrapRecovery=useRef(null),refreshRun=useRef({sequence:0,controller:null}),reunionBags=useRef({}),signOutLock=useRef(false);
 const linkedResource=useRef(null),epoch=useRef(0),ref=useRef(state),busy=useRef(false),workCount=useRef(0),after=useRef(null),alive=useRef(true),requestBook=useRef({accountId:null,requests:{},confirmed:new Set()});ref.current=state;
 const save=next=>{
  if(ref.current.mode==='live'&&(next.mode!=='live'||next.selfId!==ref.current.selfId))reunionBags.current={};
  next=shareUnchangedSnapshot(ref.current,next);if(next!==ref.current){ref.current=next;setState(next)}
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

 async function withLinkedResource(next){
  const link=linkedResource.current;
  if(!link||next.mode!=='live'||link.accountId!==next.selfId)return next;
  const target=link.target,exists=target.kind==='memory'?next.memories?.some(m=>m.id===target.id):next.posts?.some(p=>p.id===(target.kind==='comment'?target.containerId:target.id));
  if(exists)return next;
  try{const result=await notificationApi.open(link.noticeId,link.accountId);if(linkedResource.current!==link)return next;if(!result.available||result.accountId&&result.accountId!==next.selfId){linkedResource.current=null;return next}return mergeNotificationResource(next,result)}
  catch{if(linkedResource.current===link)linkedResource.current=null;return next}
 }
 function hydrateNotificationResource(result,{accountId,noticeId}={}){
  if(ref.current.selfId!==accountId||ref.current.mode!=='live'||!result?.available||result.accountId&&result.accountId!==accountId)return false;
  if(['post','comment','memory'].includes(result.target?.kind))linkedResource.current={accountId,noticeId,target:result.target};else linkedResource.current=null;
  save(mergeNotificationResource(ref.current,result));return true;
 }

 function settlePending(){
  const waiting=busy.current||workCount.current>0;if(alive.current)setPending(waiting);
  if(!waiting){const done=after.current;after.current=null;done?.()}
 }
 function beginPending(){
  workCount.current++;setPending(true);let finished=false;
  return()=>{if(finished)return;finished=true;workCount.current=Math.max(0,workCount.current-1);settlePending()};
 }
 function cancelRefresh(){const run=refreshRun.current;run.sequence++;run.controller?.abort();run.controller=null}
 async function refresh({previewMode=preview,reunionId}={}){
  if(reviewOnly){setConfig({configured:false,email:false,providers:[]});setSession(null);setLoading(false);return}
  cancelRefresh();const run=refreshRun.current,sequence=run.sequence,controller=new AbortController();run.controller=controller;
  const generation=epoch.current,current=()=>alive.current&&generation===epoch.current&&sequence===refreshRun.current.sequence;
  try{
   const [cfg,sess]=await Promise.all([readApi('/api/config',controller.signal),readApi('/api/session',controller.signal)]);if(!current())return;setConfig(previous=>shareUnchangedSnapshot(previous,cfg));setSession(previous=>shareUnchangedSnapshot(previous,sess));
   if(sess.status==='active'&&!previewMode){
    if(sess.user?.id&&ref.current.mode==='live'&&sess.user.id!==ref.current.selfId){
     linkedResource.current=null;clearChatDrafts(ref.current.selfId);retainDraftAccount(null);requestBook.current={accountId:null,requests:{},confirmed:new Set()};save(initialState());
    }
    const next=await withLinkedResource(await readApi(reunionQuery('/api/state',reunionId||(ref.current.mode==='live'?ref.current.selectedReunionId:null)),controller.signal));if(current()){
     if(sess.user?.id&&next.selfId!==sess.user.id)throw Object.assign(new Error('Your signed-in account changed. Refresh to continue.'),{status:409});
     const sameAccount=ref.current.mode==='live'&&ref.current.selfId===next.selfId;
     if(ref.current.mode==='live'&&ref.current.selfId!==next.selfId){linkedResource.current=null;clearChatDrafts(ref.current.selfId)}
     retainDraftAccount(next.selfId);
     const local=sameAccount?Object.fromEntries(localFields.map(key=>[key,ref.current[key]])):readLiveDrafts(next.selfId);
     if(sameAccount&&next.selectedReunionId!==ref.current.selectedReunionId){reunionBags.current[next.selfId+':'+ref.current.selectedReunionId]=ref.current.bag;local.bag=reunionBags.current[next.selfId+':'+next.selectedReunionId]||[]}
     if(requestBook.current.accountId!==next.selfId)requestBook.current={accountId:next.selfId,requests:readCommandRequests(next.selfId),confirmed:new Set()};
     save({...next,...local});
    }
   }else if(sess.status!=='active'&&!previewMode&&ref.current.mode==='live'){
    linkedResource.current=null;
    // A revoked or signed-out session must not leave the previous account in view.
    clearChatDrafts(ref.current.selfId);retainDraftAccount(null);requestBook.current={accountId:null,requests:{},confirmed:new Set()};save(initialState());
   }
   if(current()){bootstrapRetry.current=false;setLoadError('')}return current()?sess:undefined;
  }catch(e){if(current()){controller.abort();bootstrapRetry.current=recoverableInitialRead(e);setLoadError(e.message);bootstrapRecovery.current?.schedule()}}finally{if(current()){run.controller=null;setLoading(false)}}
 }
 useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false;cancelRefresh()}},[preview]);
 useEffect(()=>{
  if(reviewOnly||preview||session?.status==='active')return;
  const recovery=initialReadRecovery({request:()=>refresh(),shouldRetry:()=>bootstrapRetry.current,canRun:()=>alive.current&&document.visibilityState==='visible'&&!busy.current&&!workCount.current&&!refreshRun.current.controller});
  bootstrapRecovery.current=recovery;recovery.schedule();const wake=()=>{if(document.visibilityState==='visible')void recovery.wake()};window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
  return()=>{recovery.stop();if(bootstrapRecovery.current===recovery)bootstrapRecovery.current=null;window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake)};
 },[preview,session?.status]);
 useEffect(()=>{if(preview||session?.status!=='active')return;const tick=()=>{if(document.visibilityState==='visible'&&!busy.current&&!workCount.current&&!refreshRun.current.controller)refresh()};const timer=setInterval(tick,15000);window.addEventListener('online',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick)}},[preview,session?.status]);
 function dispatch(action){
  if(ref.current.mode==='preview'){try{save(reducer(ref.current,action));setError('');return Promise.resolve(true)}catch(e){setError(e.message);return Promise.resolve(false)}}
  if(action.type==='SELECT_REUNION')return selectReunion(action.id);
  if(['BAG_ADD','BAG_REMOVE'].includes(action.type)&&(busy.current||workCount.current))return Promise.resolve(false);
  if(localTypes.has(action.type)){try{const next=reducer({...ref.current,mode:'preview'},action);save({...next,mode:'live'});return Promise.resolve(true)}catch(e){setError(e.message);return Promise.resolve(false)}}
  if(busy.current||workCount.current)return Promise.resolve(false);
  busy.current=true;cancelRefresh();setLoading(false);setPending(true);setError('');const before=ref.current,generation=epoch.current,payload={...action};
  if(REUNION_SCOPED_COMMANDS.has(action.type))payload.reunionId=action.reunionId||before.selectedReunionId;
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
    const updated=preserveNewerDrafts(ref.current,before,['APPROVE_MEMBER','REMOVE_MEMBER','RESTORE_MEMBER'].includes(action.type)?ref.current:reducer({...ref.current,mode:'preview'},action),action);
    const local=Object.fromEntries(localFields.map(key=>[key,updated[key]]));if(action.type==='CLAIM_ORDER')local.bag=[];
    requestBook.current.confirmed.add(fingerprint);
    save({...ref.current,...local});
    // A read started before this acknowledgement cannot restore old server data.
    cancelRefresh();const run=refreshRun.current,sequence=run.sequence,controller=new AbortController();run.controller=controller;
    const currentRead=()=>alive.current&&generation===epoch.current&&sequence===refreshRun.current.sequence&&ref.current.selfId===before.selfId;
    try{
     const server=await withLinkedResource(await readApi(reunionQuery('/api/state',ref.current.mode==='live'?ref.current.selectedReunionId:null),controller.signal));
     if(currentRead()){if(server.selfId!==before.selfId){await refresh()}else{const latest=Object.fromEntries(localFields.map(key=>[key,ref.current[key]]));save({...server,...latest});setLoadError('')}}
    }catch{if(currentRead())setLoadError('Your change was saved. The latest view could not load; it will refresh when the connection returns.')}
    finally{if(sequence===refreshRun.current.sequence)run.controller=null}
    return true;
   }catch(e){
    if(fingerprint&&!confirmed&&!isAmbiguousCommandError(e)){delete requestBook.current.requests[fingerprint];saveCommandRequests(before.selfId,requestBook.current.requests)}
    if(alive.current&&generation===epoch.current)setError((e.name==='AbortError'?'The connection timed out.':e.message)+' Your unsent changes are still here.');
    return false;
   }finally{busy.current=false;settlePending()}
  })();
 }
 async function selectReunion(id){
  if(busy.current||workCount.current||!ref.current.reunions?.some(r=>r.id===id))return false;
  const before=ref.current;if(id===before.selectedReunionId)return true;
  cancelRefresh();const run=refreshRun.current,sequence=run.sequence,controller=new AbortController();run.controller=controller;const generation=epoch.current,finish=beginPending();setError('');
  try{
   const next=await readApi(reunionQuery('/api/state',id),controller.signal);
   if(!alive.current||generation!==epoch.current||sequence!==refreshRun.current.sequence||ref.current.selfId!==before.selfId)return false;
   if(next.selfId!==before.selfId||next.selectedReunionId!==id)throw Error('Your account or reunion changed. Refresh before continuing.');
   reunionBags.current[before.selfId+':'+before.selectedReunionId]=before.bag;
   const local=Object.fromEntries(localFields.filter(k=>k!=='bag').map(k=>[k,ref.current[k]]));
   save({...next,...local,bag:reunionBags.current[before.selfId+':'+id]||[]});setLoadError('');return true;
  }catch(e){if(sequence===refreshRun.current.sequence)setError(e.message);return false}finally{if(sequence===refreshRun.current.sequence)run.controller=null;finish()}
 }
 function defer(fn){if(busy.current||workCount.current){after.current=fn;return true}return false}
 function enterPreview(){if(busy.current||workCount.current)return;epoch.current++;cancelRefresh();linkedResource.current=null;setLoadError('');try{sessionStorage.setItem(modeKey,'preview')}catch{}save(loadLocalState());setPreview(true);setLoading(false);setError('')}
 function leavePreview(){if(busy.current||workCount.current)return;epoch.current++;cancelRefresh();linkedResource.current=null;setLoadError('');try{sessionStorage.removeItem(modeKey)}catch{}setPreview(false);setLoading(true);save(initialState());refresh({previewMode:false})}
 async function signOut(){
  if(signOutLock.current||busy.current||workCount.current)return false;
  signOutLock.current=true;const finish=beginPending(),accountId=session?.user?.id||(ref.current.mode==='live'?ref.current.selfId:null);
  try{
   if(!reviewOnly&&(session?.signedIn===true||ref.current.mode==='live')){
    // Stop delivery only for the connected account; preview itself has no server identity.
    try{const registration=await navigator.serviceWorker?.getRegistration();const subscription=await registration?.pushManager?.getSubscription();if(subscription)await subscription.unsubscribe();const displayed=await registration?.getNotifications?.();displayed?.forEach(n=>n.close())}catch{}
    await api('/api/auth/sign-out',{method:'POST',body:'{}'});
   }
   epoch.current++;cancelRefresh();setLoadError('');setError('');linkedResource.current=null;
   if(accountId){clearLiveDrafts(accountId);clearChatDrafts(accountId)}retainDraftAccount(null);
   requestBook.current={accountId:null,requests:{},confirmed:new Set()};setSession(null);
   const signedOut={...initialState(),onboarding:'welcome'};ref.current=signedOut;setState(signedOut);
   // Do not call save(): that would overwrite the separate retained preview.
   setPreview(false);setLoading(false);try{sessionStorage.removeItem(modeKey)}catch{}
   return true;
  }catch(e){setError(e.message);return false}finally{signOutLock.current=false;finish()}
 }

 async function upload(file){if(ref.current.mode==='preview'){const {readPreviewFile}=await import('./uploads.js');return readPreviewFile(file)}const data=new FormData();data.append('file',file);const finish=beginPending();try{return await api('/api/media',{method:'POST',body:data})}finally{finish()}}
 return {state,getCurrentState:()=>ref.current,dispatch,session,config,loading,error:actionError||loadError,pending,preview,enterPreview,leavePreview,refresh,signOut,upload,defer,setError,beginPending,notificationApi,hydrateNotificationResource,releaseNotificationResource:route=>{const link=linkedResource.current;if(link){const expectedId=link.target.kind==='comment'?link.target.containerId:link.target.id,expectedType=link.target.kind==='memory'?'memory':'post';if(route?.id!==expectedId||route?.type!==expectedType)linkedResource.current=null}},draftStorageStatus,hasLocalDrafts:hasLocalDrafts(state)};
}
