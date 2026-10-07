import {PUSH_IMPLEMENTATION_READY,validateSubscription,validatePushEndpoint} from './push-policy.mjs';
import {drainWithInjectedSender} from './push-store.mjs';
export function pushStorageReady(env){return env.PUSH_SCHEMA_VERSION==='1'}
export function runtimeReady(env){
 // Do not even inspect credential bindings in the disabled preparation build.
 if(!PUSH_IMPLEMENTATION_READY||env.PUSH_ENABLED!=='true')return false;
 return typeof env.PUSH_VAPID_PRIVATE_KEY==='string'&&!!env.PUSH_VAPID_PRIVATE_KEY&&typeof env.PUSH_VAPID_PUBLIC_KEY==='string'&&/^[A-Za-z0-9_-]{87}$/.test(env.PUSH_VAPID_PUBLIC_KEY)&&/^[A-Za-z0-9_-]{1,32}$/.test(env.PUSH_KEY_VERSION||'')&&typeof env.PUSH_SUBJECT==='string'&&/^mailto:[^\s@]+@[^\s@]+$|^https:\/\//.test(env.PUSH_SUBJECT);
}
export function createPushSender(env,{load=()=>import('web-push'),fetcher=globalThis.fetch}={}){
 return async({subscription,keyVersion,payload,ttl,timeoutMs=10000})=>{
  if(!runtimeReady(env)||keyVersion!==env.PUSH_KEY_VERSION)return {status:403};
  const safe=validateSubscription(subscription),imported=await load(),library=imported.default||imported;
  if(typeof library.generateRequestDetails!=='function')throw new Error('Push sender unavailable');
  const details=library.generateRequestDetails(safe,JSON.stringify(payload),{TTL:Math.max(1,Math.min(86400,ttl)),contentEncoding:'aes128gcm',urgency:'normal',topic:'gw-activity',vapidDetails:{subject:env.PUSH_SUBJECT,publicKey:env.PUSH_VAPID_PUBLIC_KEY,privateKey:env.PUSH_VAPID_PRIVATE_KEY}});
  return transmitPreparedPush(details,safe.endpoint,{fetcher,timeoutMs});
 };
}
export async function drainPush(env){if(!runtimeReady(env))return {attempted:0,disabled:true};return drainWithInjectedSender(env.DB,{sender:createPushSender(env)})}

export async function transmitPreparedPush(details,expectedEndpoint,{fetcher=globalThis.fetch,timeoutMs=10000}={}){
 // Equality prevents library retargeting; it is not a destination trust check.
 validatePushEndpoint(expectedEndpoint);validatePushEndpoint(details.endpoint);
 if(details.endpoint!==expectedEndpoint||details.method!=='POST')throw new Error('Push request rejected');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),Math.min(Math.max(1,timeoutMs),10000));
 try{const response=await fetcher(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:abort.signal});await response.body?.cancel();return {status:response.status,retryAfter:response.headers.get('Retry-After')}}finally{clearTimeout(timer)}
}
