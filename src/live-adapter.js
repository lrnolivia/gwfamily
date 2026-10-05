import React,{useEffect,useRef,useState} from 'react';
import {initialState,loadLocalState,saveLocalState,reducer} from './data-adapter.js';
export async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
 let value;try{value=await response.json()}catch{throw Object.assign(new Error('The service returned an unreadable response. Please try again.'),{status:response.status})}
 if(!response.ok)throw Object.assign(new Error(value.error?.message||value.error||value.message||'That action could not be saved.'),{status:response.status});return value;
}
const reviewOnly=typeof location!=='undefined'&&location.pathname.startsWith('/__review/');
const modeKey=reviewOnly?'gw-review-mode':'gw-active-mode';
const localTypes=new Set(['SET_DRAFT','SET_DRAFT_FILES','SET_COMPOSE','SET_FEED_FILTER','SET_PEOPLE_FILTER','SET_MEMORY_FILTERS','BAG_ADD','BAG_REMOVE']);
const localFields=['drafts','compose','feedFilter','peopleFilter','memoryFilters','bag'];
export function useFamilyData(){
 const [state,setState]=useState(loadLocalState),[session,setSession]=useState(null),[config,setConfig]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[pending,setPending]=useState(false),[preview,setPreview]=useState(()=>{try{return reviewOnly||sessionStorage.getItem(modeKey)==='preview'}catch{return false}});
 const epoch=useRef(0),ref=useRef(state),busy=useRef(false),after=useRef(null),alive=useRef(true);ref.current=state;
 const save=next=>{ref.current=next;setState(next);if(next.mode==='preview'){const r=saveLocalState(next);if(!r.ok)setError(r.error)}};
 async function refresh(){
  if(reviewOnly){setConfig({configured:false,email:false,providers:[]});setSession(null);setLoading(false);return}
  const generation=epoch.current;
  try{const [cfg,sess]=await Promise.all([api('/api/config'),api('/api/session')]);if(!alive.current||generation!==epoch.current)return;setConfig(cfg);setSession(sess);
   if(sess.status==='active'&&!preview){const next=await api('/api/state');if(alive.current&&generation===epoch.current){const local=ref.current.mode==='live'&&ref.current.selfId===next.selfId?Object.fromEntries(localFields.map(k=>[k,ref.current[k]])):{};save({...next,...local})}}
  }catch(e){if(alive.current&&generation===epoch.current){setConfig({configured:false,email:false,providers:[]});setError(e.status===404?'':e.message)}}finally{if(alive.current&&generation===epoch.current)setLoading(false)}
 }
 useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false}},[preview]);
 useEffect(()=>{if(preview||session?.status!=='active')return;const tick=()=>{if(document.visibilityState==='visible'&&!busy.current)refresh()};const timer=setInterval(tick,15000);window.addEventListener('online',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick)}},[preview,session?.status]);
 function dispatch(action){
  if(ref.current.mode==='preview'){save(reducer(ref.current,action));return Promise.resolve(true)}
  if(localTypes.has(action.type)){const next=reducer({...ref.current,mode:'preview'},action);save({...next,mode:'live'});return Promise.resolve(true)}
  if(busy.current)return Promise.resolve(false);
  busy.current=true;setPending(true);setError('');const before=ref.current;const payload={...action,requestId:crypto.randomUUID()};
  if(action.type==='CLAIM_ORDER')payload.lines=before.bag.flatMap(p=>Object.entries(p.sizes).filter(([,q])=>q>0).map(([size,quantity])=>({productId:p.productId,size,quantity})));
  if(action.type==='ORDER_RECEIVED')payload.id=before.order?.id;
  return api('/api/commands',{method:'POST',body:JSON.stringify(payload)}).then(async result=>{
   const server=await api('/api/state');let local=Object.fromEntries(localFields.map(k=>[k,ref.current[k]]));
   const updated=reducer({...ref.current,mode:'preview'},action);for(const k of localFields)local[k]=updated[k];
   if(action.type==='ADD_POST'){local.drafts={...local.drafts,post:'',files:{...local.drafts.files,'post:compose':[]}};local.compose={}}
   if(action.type==='CLAIM_ORDER')local.bag=[];
   save({...server,...local});busy.current=false;setPending(false);const done=after.current;after.current=null;done?.(result);return true;
  }).catch(e=>{setError(e.message+' Your unsent changes are still here.');busy.current=false;setPending(false);after.current=null;return false});
 }
 function defer(fn){if(busy.current){after.current=fn;return true}return false}
 function enterPreview(){if(busy.current)return;epoch.current++;try{sessionStorage.setItem(modeKey,'preview')}catch{}save(loadLocalState());setPreview(true);setLoading(false);setError('')}
 function leavePreview(){if(busy.current)return;epoch.current++;try{sessionStorage.removeItem(modeKey)}catch{}setPreview(false);setLoading(true);save(initialState());refresh()}
 async function signOut(){if(busy.current)return;epoch.current++;try{await api('/api/auth/sign-out',{method:'POST',body:'{}'});setSession(null);save(initialState());setPreview(false)}catch(e){setError(e.message)}}
 async function upload(file){if(ref.current.mode==='preview'){const {readPreviewFile}=await import('./uploads.js');return readPreviewFile(file)}const data=new FormData();data.append('file',file);return api('/api/media',{method:'POST',body:data})}
 return {state,dispatch,session,config,loading,error,pending,preview,enterPreview,leavePreview,refresh,signOut,upload,defer,setError};
}
