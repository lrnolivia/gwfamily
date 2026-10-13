import React,{useEffect,useRef,useState} from 'react';
import {Button,useApp} from './ui-core.jsx';
import {api} from './live-adapter.js';
import {initialEmailAppearance,emailAppearance} from './email-notification-model.js';

export function EmailNotificationSettings(){
 const {state,data,theme,headingFont,interfaceAccent,notifications}=useApp(),account=state.mode==='live'?state.selfId:null;
 const supported=!!data?.config?.emailNotifications,scope=account+':'+supported,identity=useRef(scope);identity.current=scope;
 // Emails follow the member's app theme; members do not choose email styling separately.
 const appearance=initialEmailAppearance({theme,headingFont,interfaceAccent,profileColor:state.members.find(m=>m.id===state.selfId)?.profileColor}),themeKey=appearance.preset+':'+appearance.theme+':'+appearance.headingFont;
 const [settings,setSettings]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[refresh,setRefresh]=useState(0);
 const activeRequest=useRef(null);
 useEffect(()=>{setSettings(null);setBusy(false);setError('');setSaved('');if(!account||!supported)return;
  const controller=new AbortController();activeRequest.current=controller;
  api('/api/me/notification-email',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted&&identity.current===scope&&value.accountId===account)setSettings(value)}).catch(e=>{if(!controller.signal.aborted&&identity.current===scope)setError(e.message)});
  return()=>{controller.abort();activeRequest.current?.abort()};
 },[scope,refresh]);
 async function save(enabled,{quiet=false}={}){
  if(!account||!settings||busy)return;const startedFor=scope,controller=new AbortController();activeRequest.current?.abort();activeRequest.current=controller;setBusy(true);setError('');setSaved('');
  try{const value=await api('/api/me/notification-email',{method:'PUT',signal:controller.signal,body:JSON.stringify({expectedAccountId:account,revision:settings.revision,enabled,appearance:emailAppearance(appearance)})});if(!controller.signal.aborted&&identity.current===startedFor&&value.accountId===account){setSettings(value);if(!quiet)setSaved(value.enabled?'Email updates are on for future activity.':'Email updates are off. Queued emails are cancelled.')}}catch(e){if(!controller.signal.aborted&&identity.current===startedFor)setError(e.message)}finally{if(identity.current===startedFor)setBusy(false)}
 }
 // Keep enabled email in step with a theme changed elsewhere in the app.
 useEffect(()=>{const stored=settings?.appearance;if(!settings?.enabled||!settings.ready||busy||!stored)return;if(stored.preset+':'+stored.theme+':'+stored.headingFont!==themeKey)save(true,{quiet:true})},[settings?.revision,settings?.enabled,themeKey]);
 const disabled=!account||!settings||!settings.ready||busy,paused=notifications?.settings?.globalOff;
 return <section className="notification-settings-section notification-email-settings"><h2>Email updates</h2>
  <p className="small muted">Optional updates go to your verified sign-in email. Emails contain a generic update and a link to GW. Your activity choices also apply. Turn email off here to cancel queued emails; a message already sent cannot be recalled.</p>
  {!account?<p>Preview never enables email or sends messages.</p>:!supported?<p>Email updates are not activated in this build.</p>:!settings&&!error?<p role="status">Checking email choices…</p>:<p role="status">{settings?.enabled?'On for this account.':'Off for this account.'}{paused?' All activity is off, so email updates are paused.':''}</p>}
  {account&&supported&&settings&&<div className="notification-bulk-actions"><Button secondary={settings.enabled} disabled={disabled||(!settings.enabled&&paused)} onClick={()=>save(!settings.enabled)}>{settings.enabled?'Turn off email updates':'Turn on email updates'}</Button></div>}
  {saved&&<p role="status">{saved}</p>}{error&&<div role="alert"><p>{error}</p>{supported&&account&&<Button secondary disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh email choices</Button>}</div>}
 </section>;
}
