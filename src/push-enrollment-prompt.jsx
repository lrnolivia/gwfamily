import React,{useEffect,useRef,useState} from 'react';
import {Button,Sheet,useApp} from './ui-core.jsx';
import {deviceCapability,createDevicePushController,resolveBrowserPush,requestPush} from './push-client.js';
import {markPromptSeen,promptWasSeen,pushPromptChoice} from './push-enrollment-model.js';
import {createNotificationArrivalTracker,notificationActionLabel} from './notification-toasts.js';

export function NotificationArrivalToasts(){
 const {state,notifications,go,setToast,navigationVersion}=useApp();
 const account=notifications?.enabled?state.mode+':'+state.selfId:null,current=useRef(null);current.current=account;
 const tracker=useRef(null);if(!tracker.current)tracker.current=createNotificationArrivalTracker();
 useEffect(()=>{
  const arrivals=tracker.current.update({account,ready:notifications?.ready,items:notifications?.items,globalOff:notifications?.settings?.globalOff});
  const item=arrivals.at(-1);if(!item)return;
  const version=navigationVersion?.();
  setToast({message:item.title||'New family activity',duration:12000,actions:[{label:notificationActionLabel(item),run:async()=>{
   if(current.current!==account||notifications.busy)return false;
   const result=await notifications.open(item.id);
   if(current.current!==account||navigationVersion?.()!==version||!result?.available||!result.route)return false;
   go(result.route);return true;
  }},...(item.kind==='message.created'?[]:[{label:'Mark read',run:()=>current.current===account&&!notifications.busy?notifications.read(item.id):false}])]});
 },[account,notifications?.ready,notifications?.items,notifications?.settings?.globalOff,setToast]);
 return null;
}

export function PushEnrollmentPrompt(){
 const {data,state,notifications,openSheet,setToast}=useApp();
 const account=!data.preview&&state.mode==='live'&&state.onboarding==='done'&&data.session?.status==='active'?state.selfId:null;
 const current=useRef(account);current.current=account;
 const run=useRef(null),[view,setView]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const enabled=data.config?.pushEnrollmentPrompt===true;
 useEffect(()=>{
  setView(null);setBusy(false);setError('');const owner={account,active:true,controller:null};run.current=owner;
  if(!enabled||!account||!notifications?.ready||notifications?.settings?.globalOff||promptWasSeen(localStorage,account))return()=>{owner.active=false};
  const valid=()=>owner.active&&run.current===owner&&current.current===account;
  (async()=>{
   try{
    const capability=deviceCapability({window,navigator,Notification:window.Notification});
    if(!capability.available&&capability.reason!=='install-ios-first')return;
    const status=await requestPush('/api/me/push');if(!valid()||status.accountId!==account||!status.ready)return;
    const registration=await navigator.serviceWorker?.getRegistration();if(!valid())return;
    const browser=await resolveBrowserPush(status,registration);if(!valid())return;
    const choice=pushPromptChoice({enabled,active:true,seen:promptWasSeen(localStorage,account),status:{...status,...browser},capability});
    if(!choice||choice==='enable'&&(!registration?.active||!registration?.pushManager))return;
    if(choice==='enable')owner.controller=createDevicePushController({Notification:window.Notification,registration,currentAccountId:()=>current.current,save:body=>requestPush('/api/me/push/devices','POST',body),revoke:body=>requestPush('/api/me/push/devices/'+encodeURIComponent(body.id),'DELETE',{expectedAccountId:body.expectedAccountId})});
    // Mark on presentation, not on polling or a failed preflight. Reopening GW
    // never repeats this prompt. Settings remain available for a later opt-in.
    if(markPromptSeen(localStorage,account))setView({account,choice,status});
   }catch{/* A passive prompt failure never interrupts entry or asks permission. */}
  })();
  return()=>{owner.active=false;owner.controller?.invalidate()};
 },[enabled,account,notifications?.ready,notifications?.settings?.globalOff]);
 if(!view||view.account!==account)return null;
 const close=()=>{if(!busy)setView(null)};
 function enable(){
  const owner=run.current;if(busy||!owner?.controller||!owner.active)return;
  setBusy(true);setError('');
  // Permission starts synchronously inside this explicit click, using the
  // already loaded key and service worker. No permission request in effects.
  owner.controller.enable(view.status,account).then(result=>{
   if(owner.active&&run.current===owner&&current.current===account){setView(null);setToast(result.enabled?'Push enabled for this signed-in session.':'Push stays off. You can enable it later in Notifications.')}
  }).catch(e=>{if(owner.active&&run.current===owner)setError(e.message)}).finally(()=>{if(owner.active&&run.current===owner)setBusy(false)});
 }
 return <Sheet title="Keep up with your family" onClose={close}><div className="stack"><p>Activity is always available inside GW. If you choose push, generic updates can also appear in your device’s notification center or on its lock screen. Names and message content stay hidden unless you separately turn on message previews in Notifications.</p>{view.choice==='install'?<><p>Add GW to your iPhone or iPad Home Screen, then open its icon. You can enable device notifications in Notifications after installation.</p><Button onClick={()=>{setView(null);openSheet({type:'install'})}}>View installation steps</Button></>:<Button disabled={busy} aria-busy={busy} onClick={enable}>{busy?'Enabling…':'Enable push on this device'}</Button>}<Button secondary disabled={busy} onClick={close}>Not now</Button>{error&&<p role="alert">{error}</p>}</div></Sheet>;
}
