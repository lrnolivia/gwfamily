// This switch ships disabled. Only an independently verified device receipt may
// justify activating it; registering a subscription is not a delivery receipt.
export const PUSH_PROMPT_PREFIX='gw-push-prompt:v1:';
export function pushPromptKey(account){return typeof account==='string'&&account.length>0&&account.length<=200?PUSH_PROMPT_PREFIX+account:null}
export function promptWasSeen(storage,account){try{return storage?.getItem(pushPromptKey(account))==='seen'}catch{return true}}
export function markPromptSeen(storage,account){const key=pushPromptKey(account);if(!key)return false;try{storage.setItem(key,'seen');return true}catch{return false}}
export function pushPromptChoice({enabled,active,seen,status,capability,globalOff=false}){
 if(enabled!==true||!active||seen||globalOff||!status?.ready||status.pushEnabled)return null;
 if(capability?.reason==='install-ios-first')return 'install';
 return capability?.available===true?'enable':null;
}
