import {runtimeReady,drainPush} from './push-runtime.mjs';
import {emailRuntimeReady} from './email-delivery-policy.mjs';
import {drainEmailNotifications} from './email-notifications.mjs';

// Only mutation families backed by notification event triggers. Reads, consent,
// enrollment, auth, uploads and notification read/dismiss operations stay inert.
const commands=new Set(['ADD_POST','ADD_COMMENT','TOGGLE_REACTION','ADD_MEMORY','SAVE_MEMORY','SET_FEES','CONFIRM_FEE','CLAIM_ORDER','ORDER_RECEIVED','UPDATE_CLAIM','DETAILS','APPROVE_MEMBER','REMOVE_MEMBER','RESTORE_MEMBER','REQUEST_HOUSEHOLD_JOIN','INVITE_HOUSEHOLD_MEMBER','REQUEST_HOUSEHOLD_HEAD','RESOLVE_HOUSEHOLD_REQUEST']);
export async function notificationMutation(c){
 const method=c.req.method,path=c.req.path;
 if(method==='POST'){
  if(path==='/api/commands')return commands.has((await c.req.json()).type);
  return /^\/api\/(?:posts(?:\/[^/]+\/comments)?|shirts\/claims(?:\/[^/]+\/received)?|family-calendar|household-invites(?:\/accept)?|conversations(?:\/[^/]+\/(?:messages|invitation|members|leave))?)$/.test(path);
 }
 return method==='PATCH'&&/^\/api\/conversations\/[^/]+(?:\/members\/[^/]+)?$/.test(path)||method==='DELETE'&&/^\/api\/conversations\/[^/]+\/members\/[^/]+$/.test(path);
}

// This is only a scheduling hint. Existing drains still own runtime controls,
// atomic claims, current consent/session/resource checks and bounded retries.
// All work starts after registration, detached from the committed HTTP result.
export function queueNotificationDrains(env,ctx,{authorize,max,push=drainPush,email=drainEmailNotifications}={}){
 const usePush=runtimeReady(env),useEmail=emailRuntimeReady(env);
 if((!usePush&&!useEmail)||typeof ctx?.waitUntil!=='function')return false;
 let registered=false;
 const work=Promise.resolve().then(async()=>{
  if(!registered)return;
  if(authorize){try{await authorize()}catch{return}}
  const results=await Promise.allSettled([
   ...(usePush?[Promise.resolve().then(()=>push(env,max===undefined?{}:{max}))]:[]),
   ...(useEmail?[Promise.resolve().then(()=>email(env,max===undefined?{}:{max}))]:[])
  ]);
  // Preserve scheduled failure visibility without exposing provider/private data.
  if(results.some(result=>result.status==='rejected'))throw new Error('Notification dispatch unavailable');
 });
 try{ctx.waitUntil(work);registered=true;return true}catch{return false}
}
