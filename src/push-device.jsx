import React,{useEffect,useId,useRef,useState} from 'react';
import {readPushOpenTarget,pushOpenRoute,pendingPushOpen,clearPendingPushOpen} from './push-open.js';
import {restoreNotificationSettingFocus} from './notification-model.js';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {deviceCapability,createDevicePushController,resolveBrowserPush,requestPush as request} from './push-client.js';
export async function clearBrowserPush(){if(!navigator.serviceWorker)return;const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager?.getSubscription();if(subscription)await subscription.unsubscribe();const displayed=await registration?.getNotifications?.();displayed?.forEach(n=>n.close())}
export function PushDeviceSettings(){
 const {state,notifications}=useApp(),account=state.mode==='live'?state.selfId:null,identity=useRef(account);identity.current=account;
 const informationId=useId(),[informationOpen,setInformationOpen]=useState(false);
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[testStatus,setTestStatus]=useState(''),[previewUncertain,setPreviewUncertain]=useState(false),registration=useRef(null),controller=useRef(null),generation=useRef(0),pendingFocus=useRef(null),previewLock=useRef(false);
 const currentOperation=()=>{const epoch=generation.current;return()=>identity.current===account&&generation.current===epoch};
 useEffect(()=>{let active=true;const epoch=++generation.current;setStatus(null);setError('');setBusy(false);setTestStatus('');setPreviewUncertain(false);pendingFocus.current=null;previewLock.current=false;controller.current?.invalidate();controller.current=null;if(!account)return;
  (async()=>{try{const result=await request('/api/me/push');if(!active||identity.current!==account||result.accountId!==account)return;setStatus({...result,pushEnabled:false,testDeviceId:null});if(result.ready&&navigator.serviceWorker){registration.current=await navigator.serviceWorker.getRegistration();if(!active)return;if(!registration.current?.active||!registration.current?.pushManager){setError('Device notifications are not ready. Reload GW in a supported full browser, then try again.');return;}controller.current=createDevicePushController({Notification:window.Notification,registration:registration.current,currentAccountId:()=>identity.current,save:body=>request('/api/me/push/devices','POST',body),revoke:body=>request('/api/me/push/devices/'+encodeURIComponent(body.id),'DELETE',{expectedAccountId:body.expectedAccountId})});const browser=await resolveBrowserPush(result,registration.current);if(active&&identity.current===account)setStatus({...result,...browser})}}catch(e){if(active)setError(e.message)}})();return()=>{active=false;if(generation.current===epoch)generation.current++;controller.current?.invalidate()}
 },[account,notifications?.settings?.globalOff]);
 const capability=typeof window!=='undefined'?deviceCapability({window,navigator,Notification:window.Notification}):{available:false};
 const reason=!account?'Preview never subscribes a device.':!status?'Checking device availability…':!status.ready?'Not enabled in this build.':notifications?.settings?.globalOff?'Turn All activity on before enabling this device.':capability.reason==='open-full-browser'?'Open GW in a full browser rather than an in-app browser or embedded frame. Activity in GW is still available.':capability.reason==='secure-context-required'?'Open GW using its secure HTTPS address.':capability.reason==='install-ios-first'?'Add GW to your iPhone or iPad Home Screen, then open its icon to enable push.':capability.reason==='permission-denied'?'Notifications are blocked. Change GW’s notification permission in browser or device settings.':!capability.available?'This browser does not expose the required push APIs. Try a current full browser, or keep using activity in GW.':status.pushEnabled?'Enabled for this signed-in session.':'Off on this device.';
 function enable(){if(!controller.current)return;setBusy(true);setError('');setTestStatus('');const startedFor=account,valid=currentOperation();controller.current.enable(status,account).then(result=>{if(valid())setStatus(s=>({...s,pushEnabled:result.enabled,testDeviceId:result.deviceId,devices:result.enabled?[...(s.devices||[]).filter(d=>d.id!==result.deviceId),{id:result.deviceId,previewEnabled:false,previewRevision:0}]:s.devices}))}).catch(e=>{if(valid())setError(e.message)}).finally(()=>{if(valid())setBusy(false)})}
 const currentDevice=status?.devices?.find(device=>device.id===status.testDeviceId);
 useEffect(()=>{if(busy||previewUncertain)return;const pending=pendingFocus.current;pendingFocus.current=null;if(pending&&pending.account===account&&pending.epoch===generation.current)restoreNotificationSettingFocus(pending.input)},[busy,previewUncertain,currentDevice?.previewRevision,account]);
 async function refreshPreview(){
  const startedFor=account,valid=currentOperation();setBusy(true);setError('');
  try{const result=await request('/api/me/push');if(!valid()||result.accountId!==startedFor)return;const browser=await resolveBrowserPush(result,registration.current);if(valid()){setStatus({...result,...browser});setPreviewUncertain(false)}}catch(e){if(valid()){setError(e.message);setPreviewUncertain(true)}}finally{if(valid())setBusy(false)}
 }
 async function changePreview(event){
  if(busy||previewLock.current||previewUncertain||!currentDevice)return;
  previewLock.current=true;const enabled=event.target.checked;pendingFocus.current=event.nativeEvent?.detail===0?{input:event.currentTarget,account,epoch:generation.current}:null;
  const startedFor=account,deviceId=currentDevice.id,valid=currentOperation();setBusy(true);setError('');
  try{
   const result=await request('/api/me/push/devices/'+encodeURIComponent(deviceId)+'/preview','PUT',{expectedAccountId:startedFor,enabled,revision:currentDevice.previewRevision});
   if(!valid())return;
   if(result.accountId!==startedFor||result.id!==deviceId||typeof result.previewEnabled!=='boolean'||!Number.isSafeInteger(result.previewRevision))throw new Error('The preview setting could not be confirmed. Refresh its status.');
   setStatus(s=>({...s,devices:s.devices.map(device=>device.id===deviceId?{...device,...result}:device)}));
   // Remove already displayed previews on this device when the user hides them.
   // A dispatch already accepted by the provider cannot be recalled.
   if(!enabled){const shown=await registration.current?.getNotifications?.();if(valid())shown?.forEach(notice=>notice.close())}
  }catch(e){if(valid()){setError(e.message);setPreviewUncertain(true)}}finally{if(valid()){previewLock.current=false;setBusy(false)}}
 }
 async function testDevice(){setBusy(true);setError('');setTestStatus('');const startedFor=account,valid=currentOperation();try{const result=await request('/api/me/push/devices/'+encodeURIComponent(status.testDeviceId)+'/test','POST',{expectedAccountId:account});if(valid()&&result.accountId===startedFor)setTestStatus('Test accepted by the push provider. Check your device’s notification center.')}catch(e){if(valid()){setError(e.message);if(e.code==='push-subscription-expired')setStatus(s=>({...s,pushEnabled:false,testDeviceId:null}))}}finally{if(valid())setBusy(false)}}
 async function disable(){setBusy(true);setError('');setTestStatus('');const startedFor=account,valid=currentOperation();try{await request('/api/me/push/revoke-session','POST',{expectedAccountId:startedFor});if(!valid())return;await clearBrowserPush();if(!valid())return;controller.current?.invalidate();setStatus(s=>({...s,pushEnabled:false,testDeviceId:null}))}catch(e){if(valid())setError(e.message)}finally{if(valid())setBusy(false)}}
 return <section className="notification-settings-section notification-device-status"><div className="notification-device-heading"><h2>Push on this device</h2><Control className="icon-button notification-device-info" aria-label="Information about device notifications" aria-expanded={informationOpen} aria-controls={informationId} onClick={()=>setInformationOpen(value=>!value)}><Glyph name="info"/></Control></div><p role="status">{reason}</p><p className="small muted">Your activity still works in GW. Opening this page never asks for browser notification permission.</p><div className="notification-device-details" id={informationId} hidden={!informationOpen}><p className="small muted">Push can appear in your notification center or on your lock screen. Names and message content stay hidden unless you turn on message previews for this device. Your browser’s push provider delivers encrypted notifications; your device displays any previews you choose to show. Signing out stops push for this session. Installation is required on iPhone/iPad; supported desktop and Android browsers do not require it. Browser/OS settings, private mode or device policy can block delivery.</p></div>{status?.ready&&(status.pushEnabled?<Button secondary disabled={busy} onClick={disable}>Turn off push on this device</Button>:<Button disabled={busy||!capability.available||notifications?.settings?.globalOff||!controller.current} onClick={enable}>Enable push on this device</Button>)}{status?.ready&&status?.pushEnabled&&status?.testDeviceId&&<Button secondary icon="send" disabled={busy} onClick={testDevice}>Send test notification</Button>}{status?.ready&&status?.pushEnabled&&currentDevice&&<div className="notification-push-preview"><label className="check-row"><input type="checkbox" checked={currentDevice.previewEnabled===true} disabled={busy||previewUncertain} onChange={changePreview}/><span>Show message previews on this device</span></label><p className="small muted">Show the sender’s name and a short message preview, including on the lock screen. Off by default. Applies to new messages after you enable it. Notifications already sent may still arrive after you turn previews off or sign out.</p><p className="small muted">Tap a message to open its conversation. Where notification buttons are supported, Reply in GW opens the composer. Inline replies are not enabled; iPhone and iPad web apps do not support them.</p>{previewUncertain&&<Button secondary disabled={busy} onClick={refreshPreview}>Refresh preview setting</Button>}</div>}{testStatus&&<p role="status">{testStatus}</p>}{!status?.ready&&status?.devices?.length>0&&<Button secondary disabled={busy} onClick={disable}>Turn off push on this device</Button>}{error&&<p role="alert">{error}</p>}</section>
}
export function PushLifecycle(){
 const pending=useRef(undefined),[retry,setRetry]=useState(0);if(pending.current===undefined)pending.current=pendingPushOpen(location.href);
 const {state,notifications,go,navigationVersion,setToast}=useApp(),account=state.mode==='live'?state.selfId:null,previous=useRef(account),current=useRef(account);current.current=account;
 useEffect(()=>{if(previous.current&&previous.current!==account)clearBrowserPush().catch(()=>{});previous.current=account},[account]);
 useEffect(()=>{const online=()=>{if(pending.current)setRetry(value=>value+1)};window.addEventListener('online',online);return()=>window.removeEventListener('online',online)},[]);
 useEffect(()=>{
  if(!account||!notifications?.ready)return;
  const target=pending.current||readPushOpenTarget(location.href);if(!target)return;pending.current=target;
  const clear=()=>{if(pending.current!==target)return;pending.current=null;clearPendingPushOpen();const url=new URL(location.href);for(const key of ['gwNotice','gwReply','gwPushTest'])url.searchParams.delete(key);history.replaceState(history.state,'',url)};
  if(target.test){clear();go({type:'notification-settings'});return;}
  let active=true;const version=navigationVersion?.();
  notifications.open(target.id).then(result=>{
   if(!active||current.current!==account)return;
   if(navigationVersion?.()!==version){clear();return;}
   if(!result)throw new Error('Notification open was interrupted.');
   const route=pushOpenRoute(target,result);clear();
   if(route)go(route);else setToast('This update is no longer available for this account.');
  }).catch(()=>{
   if(!active||current.current!==account)return;
   if(navigationVersion?.()!==version){clear();return;}
   setToast({kind:'error',message:'The conversation couldn’t be opened. Reconnect or sign in again, then retry.',actions:[{label:'Retry',run:()=>{if(current.current===account&&pending.current===target)setRetry(value=>value+1)}}]});
  });
  return()=>{active=false};
 },[account,notifications?.ready,retry]);
 return null;
}
