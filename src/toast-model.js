// Transient feedback only. Unsaved drafts, conflicts and service errors stay in
// their owning persistent panels; this controller never reads or clears them.
export const TOAST_DURATION_MS=5000;
export const TOAST_ERROR_DURATION_MS=12000;
export const TOAST_MAX_DURATION_MS=20000;
export const TOAST_MAX_RESIDENCE_MS=60000;

export function normalizeToast(input){
 if(input==null||input==='')return null;
 const value=typeof input==='string'?{message:input}:input;
 // A persistent condition must not silently become an expiring notice.
 if(!value||typeof value!=='object'||value.persistent===true||typeof value.message!=='string'||!value.message.trim())return null;
 const kind=value.kind==='error'?'error':'status';
 const actions=(Array.isArray(value.actions)?value.actions:[]).filter(action=>action&&typeof action.label==='string'&&action.label.trim()&&typeof action.run==='function').slice(0,2).map(action=>Object.freeze({label:action.label.trim().slice(0,80),run:action.run}));
 const fallback=kind==='error'||actions.length?TOAST_ERROR_DURATION_MS:TOAST_DURATION_MS;
 const duration=typeof value.duration==='number'&&Number.isFinite(value.duration)?Math.min(TOAST_MAX_DURATION_MS,Math.max(TOAST_DURATION_MS,value.duration)):fallback;
 return {message:value.message.trim(),kind,duration,...(actions.length?{actions}: {})};
}

export function createToastController({scopeKey='',clock,onChange=()=>{}}={}){
 const time=clock||{now:()=>Date.now(),setTimeout:(callback,delay)=>globalThis.setTimeout(callback,delay),clearTimeout:timer=>globalThis.clearTimeout(timer)};
 let active=false,visible=true,scope=scopeKey,route=null,toast=null,timer=null,sequence=0,timerVersion=0,deadline=0,hardDeadline=0,remaining=0;
 const paused=new Set();
 const snapshot=()=>({scopeKey:scope,toast});
 function cancel(){timerVersion++;if(timer!==null)time.clearTimeout(timer);timer=null;}
 function publish(){if(active)onChange(snapshot());}
 function clear(){cancel();toast=null;paused.clear();remaining=0;deadline=0;hardDeadline=0;}
 function expire(){if(toast&&(time.now()>=hardDeadline||(!paused.size&&time.now()>=deadline))){clear();publish();return true;}return false;}
 function schedule(){
  cancel();if(!active||!visible||!toast||expire())return;
  const version=timerVersion,id=toast.id;
  timer=time.setTimeout(()=>{if(!active||version!==timerVersion||toast?.id!==id)return;timer=null;if(!expire())schedule();},Math.max(0,(paused.size?hardDeadline:Math.min(deadline,hardDeadline))-time.now()));
 }
 return {
  snapshot,
  activate(){if(active)return;active=true;expire();publish();schedule();},
  deactivate(){active=false;clear();},
  show(input,expectedScope=scope){
   if(!active||expectedScope!==scope)return false;
   if(typeof input==='function')input=input(toast?.message||'');
   const next=normalizeToast(input);
   if(!next){
    // Reject an attempted persistent message without replacing existing feedback.
    if(input&&typeof input==='object'&&input.persistent===true)return false;
    clear();publish();return true;
   }
   clear();const now=time.now();toast=Object.freeze({...next,id:++sequence});remaining=next.duration;deadline=now+remaining;hardDeadline=now+TOAST_MAX_RESIDENCE_MS;publish();schedule();return true;
  },
  dismiss(id=toast?.id){if(!active||!toast||toast.id!==id)return false;clear();publish();return true;},
  pause(reason,id=toast?.id){
   if(!active||!visible||!toast||toast.id!==id||!['hover','focus'].includes(reason)||paused.has(reason)||expire())return false;
   if(!paused.size)remaining=Math.max(0,deadline-time.now());paused.add(reason);schedule();return true;
  },
  resume(reason,id=toast?.id){
   if(!active||!toast||toast.id!==id||!paused.delete(reason))return false;
   if(!paused.size)deadline=time.now()+remaining;schedule();return true;
  },
  setScope(next){if(next===scope)return;scope=next;clear();publish();},
  setRoute(next){if(next===route)return;route=next;expire();},
  setVisible(next){
   visible=next!==false;
   if(!visible){
    // Backgrounding ends interaction pauses. Expiry ages by wall time while
    // hidden, instead of replaying a stale confirmation when the app resumes.
    if(paused.size){paused.clear();deadline=time.now()+remaining;}cancel();
   }else{expire();schedule();}
  },
  reconcile(){expire();schedule();},
 };
}
