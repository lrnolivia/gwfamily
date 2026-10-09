import {validPushId} from './push-presentation.js';
// Only an opaque recipient notification ID travels in navigation. The server
// resolves the conversation for the current authenticated account every time.
export function readPushOpenTarget(href){
 const url=new URL(href);
 const id=url.searchParams.get('gwNotice');
 if(validPushId(id))return {id,reply:url.searchParams.get('gwReply')==='1'};
 return url.searchParams.get('gwPushTest')==='1'?{test:true}:null;
}
export function pushOpenRoute(target,result){
 if(!result?.available||!result.route)return null;
 return target?.reply&&result.route.type==='chat'?{...result.route,section:'reply'}:result.route;
}
const PENDING_KEY='gwfamily:push-open:v1',PENDING_TTL=24*60*60*1000;
export function rememberPushOpen(target,storage=globalThis.sessionStorage,now=Date.now()){
 try{if(target?.test===true||validPushId(target?.id))storage.setItem(PENDING_KEY,JSON.stringify({...(target.test?{test:true}:{id:target.id,reply:target.reply===true}),savedAt:now}))}catch{/* The current tab still retains the in-memory target. */}
}
export function pendingPushOpen(href,storage=globalThis.sessionStorage,now=Date.now()){
 const target=readPushOpenTarget(href);if(target){rememberPushOpen(target,storage,now);return target;}
 const params=new URL(href).searchParams;if(params.has('gwNotice')||params.has('gwPushTest')){clearPendingPushOpen(storage);return null;}
 try{
  const saved=JSON.parse(storage.getItem(PENDING_KEY));
  if(Number.isSafeInteger(saved?.savedAt)&&saved.savedAt<=now&&now-saved.savedAt<PENDING_TTL){if(saved.test===true)return {test:true};if(validPushId(saved.id))return {id:saved.id,reply:saved.reply===true};}
  storage.removeItem(PENDING_KEY);
 }catch{}
 return null;
}
export function clearPendingPushOpen(storage=globalThis.sessionStorage){try{storage.removeItem(PENDING_KEY)}catch{}}
