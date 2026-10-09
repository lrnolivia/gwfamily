import React,{useEffect,useRef,useState} from 'react';
import {Button,useApp} from './ui-core.jsx';
import {ChoiceControl} from './choice-control.jsx';
import {api} from './live-adapter.js';
import {THEME_PRESETS} from './theme-presets.js';
import {initialEmailAppearance,emailAppearance} from './email-notification-model.js';

export function EmailNotificationSettings(){
 const {state,data,theme,headingFont,interfaceAccent,notifications}=useApp(),account=state.mode==='live'?state.selfId:null;
 const supported=!!data?.config?.emailNotifications,scope=account+':'+supported,identity=useRef(scope);identity.current=scope;
 const [settings,setSettings]=useState(null),[appearance,setAppearance]=useState(()=>initialEmailAppearance({theme,headingFont,interfaceAccent,profileColor:state.members.find(m=>m.id===state.selfId)?.profileColor})),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[refresh,setRefresh]=useState(0);
 const activeRequest=useRef(null);
 useEffect(()=>{setSettings(null);setBusy(false);setError('');setSaved('');setAppearance(initialEmailAppearance({theme,headingFont,interfaceAccent,profileColor:state.members.find(m=>m.id===state.selfId)?.profileColor}));if(!account||!supported)return;
  const controller=new AbortController();activeRequest.current=controller;
  api('/api/me/notification-email',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted&&identity.current===scope&&value.accountId===account){setSettings(value);if(value.revision>0)setAppearance(emailAppearance(value.appearance))}}).catch(e=>{if(!controller.signal.aborted&&identity.current===scope)setError(e.message)});
  return()=>{controller.abort();activeRequest.current?.abort()};
 },[scope,refresh]);
 async function save(enabled){
  if(!account||!settings||busy)return;const startedFor=scope,controller=new AbortController();activeRequest.current?.abort();activeRequest.current=controller;setBusy(true);setError('');setSaved('');
  try{const value=await api('/api/me/notification-email',{method:'PUT',signal:controller.signal,body:JSON.stringify({expectedAccountId:account,revision:settings.revision,enabled,appearance:emailAppearance(appearance)})});if(!controller.signal.aborted&&identity.current===startedFor&&value.accountId===account){setSettings(value);setAppearance(emailAppearance(value.appearance));setSaved(value.enabled?'Email updates are on for future activity.':'Email updates are off. Queued emails are cancelled.')}}catch(e){if(!controller.signal.aborted&&identity.current===startedFor)setError(e.message)}finally{if(identity.current===startedFor)setBusy(false)}
 }
 const disabled=!account||!settings||!settings.ready||busy,paused=notifications?.settings?.globalOff;
 return <section className="notification-settings-section notification-email-settings"><h2>Email updates</h2>
  <p className="small muted">Optional updates go to your verified sign-in email. Emails contain a generic update and a link to GW. Your activity choices also apply. Turn email off here to cancel queued emails; a message already sent cannot be recalled.</p>
  {!account?<p>Preview never enables email or sends messages.</p>:!supported?<p>Email updates are not activated in this build.</p>:!settings&&!error?<p role="status">Checking email choices…</p>:<p role="status">{settings?.enabled?'On for this account.':'Off for this account.'}{paused?' Activity in GW is off, so email updates are paused.':''}</p>}
  <div className="stack"><ChoiceControl label="Email color" value={appearance.preset} onChange={preset=>{setAppearance(a=>({...a,preset}));setSaved('')}} options={THEME_PRESETS.map(p=>({value:p.id,label:p.label}))} disabled={disabled} required/>
   <ChoiceControl label="Email heading style" value={appearance.headingFont} onChange={headingFont=>{setAppearance(a=>({...a,headingFont}));setSaved('')}} options={[{value:'sans',label:'Momo'},{value:'serif',label:'DM Serif'}]} disabled={disabled} required/>
   <ChoiceControl label="Email appearance" value={appearance.theme} onChange={theme=>{setAppearance(a=>({...a,theme}));setSaved('')}} options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'}]} disabled={disabled} required/>
  </div>
  <p className="small muted">Inter is used for body text. Email apps that block web fonts use the included system font fallback.</p>
  {account&&supported&&settings&&<div className="notification-bulk-actions"><Button disabled={disabled||paused} onClick={()=>save(true)}>{settings.enabled?'Save email appearance':'Turn on email updates'}</Button>{settings.enabled&&<Button secondary disabled={busy} onClick={()=>save(false)}>Turn off email updates</Button>}</div>}
  {saved&&<p role="status">{saved}</p>}{error&&<div role="alert"><p>{error}</p>{supported&&account&&<Button secondary disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh email choices</Button>}</div>}
 </section>;
}
