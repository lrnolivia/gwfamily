// Deliberate compile-time interlock. There is no production sender in this package.
export const PUSH_IMPLEMENTATION_READY = false;
export function pushStatus(){return {ready:false,pushEnabled:false,reason:'activation-required'}}
export function assertAccount(actor,expectedAccountId){if(!actor?.id||actor.id!==expectedAccountId)throw new Error('Account changed; refresh before changing this device')}
export function validatePushEndpoint(endpoint){
 if(typeof endpoint!=='string'||endpoint.length>2048)throw new Error('Invalid endpoint');
 let url;try{url=new URL(endpoint)}catch{throw new Error('Invalid endpoint')}
 // Provider-owned DNS families documented by Apple/Microsoft, anchored at
 // full label boundaries. No arbitrary hostname, IP literal or lookalike suffix.
 const host=url.hostname;
 const providerChild=base=>host.endsWith('.'+base)&&host.slice(0,-base.length-1).split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
 const apple=providerChild('push.apple.com'),windows=providerChild('notify.windows.com');
 const permitted=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||apple||windows;
 if(!permitted||url.protocol!=='https:'||url.username||url.password||url.port||endpoint.includes('#')||!url.pathname||url.pathname==='/'||url.href!==endpoint)throw new Error('Unsupported push endpoint');
 if(windows){
  // Edge WNS subscription channel includes an opaque token query. Permit that
  // provider-specific shape only; never accept arbitrary URLs or query redirects.
  const entries=[...url.searchParams];
  if(url.pathname!=='/w/'||entries.length!==1||entries[0][0]!=='token'||!entries[0][1]||(/[\u0000-\u0020\u007f]/.test(decodeURIComponent(url.search.slice(7))))||/%(?![0-9a-fA-F]{2})/.test(url.search))throw new Error('Unsupported push endpoint');
 }else if(endpoint.includes('?'))throw new Error('Unsupported push endpoint');
 return endpoint;
}
export function validateSubscription(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid subscription');
 const {keys}=value,endpoint=validatePushEndpoint(value.endpoint);
 function key(text,bytes){if(typeof text!=='string'||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('Invalid browser key');const raw=atob(text.replace(/-/g,'+').replace(/_/g,'/'));if(raw.length!==bytes||btoa(raw).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')!==text)throw new Error('Invalid browser key');return raw}
 if(key(keys?.p256dh,65).charCodeAt(0)!==4)throw new Error('Invalid browser key');key(keys?.auth,16);
 return {endpoint,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export function genericPayload(id,expiresAt){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!Number.isSafeInteger(expiresAt))throw new Error('Invalid push identity');
 return {v:1,title:'Green & White Family',body:'You have a new update. Open GW to see it.',noticeId:id,expiresAt,url:'/?gwNotice='+encodeURIComponent(id),tag:'gw-activity'};
}
export function retryOutcome(status,attempt,now,expiresAt,retryAfter=null,jitter=0.5){
 if(now>=expiresAt)return {state:'expired',status:'expired'};
 if(status>=200&&status<300)return {state:'accepted',status:'accepted'};
 if(status===404||status===410)return {state:'cancelled',status:'subscription-expired',revoke:true};
 if(status===401||status===403)return {state:'failed',status:'sender-configuration',halt:true};
 if(!(status===0||status===408||status===429||status>=500&&status<=599)||attempt>=8)return {state:'failed',status:'permanent-failure'};
 let retry=0;if(retryAfter!==null){const n=Number(retryAfter);retry=Number.isFinite(n)&&n>=0?n*1000:Math.max(0,Date.parse(retryAfter)-now)||0}
 const delay=Math.max(retry,Math.min(900000,30000*2**Math.min(attempt-1,5))*(0.75+Math.max(0,Math.min(1,jitter))*0.5));
 const nextAt=now+Math.ceil(delay);return nextAt>=expiresAt?{state:'expired',status:'retry-past-expiry'}:{state:'pending',status:'retry',nextAt};
}
