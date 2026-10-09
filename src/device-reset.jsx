import React,{useRef,useState} from 'react';
import {Button,Sheet,useApp} from './ui-core.jsx';
import {resetGWDevice} from './device-reset.js';
export function DeviceReset({onClose}){
 const {data}=useApp(),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function reset(){if(lock.current||data.pending)return;lock.current=true;setBusy(true);setError('');try{await resetGWDevice({signOut:data.signOut,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,caches:globalThis.caches,serviceWorker:navigator.serviceWorker,origin:location.origin,basePath:location.pathname.replace(/[^/]*$/,'')});location.replace(location.origin+location.pathname)}catch(error){setError(error.message||'The reset could not finish. Try again.');lock.current=false;setBusy(false)}}
 return <Sheet title="Reset GW on this device?" busy={busy} onClose={()=>{if(!lock.current)onClose()}}><div className="stack"><p>This signs you out of GW and removes its saved settings, preview content, and drafts on this device.</p><p>Your online profile, posts, conversations, and family information stay saved. This does not sign you out of Google, Microsoft, Yahoo, or another provider.</p>{error&&<p role="alert">{error}</p>}<Button disabled={busy||data.pending} onClick={reset}>{busy?'Resetting…':'Reset GW on this device'}</Button><Button secondary disabled={busy} onClick={onClose}>Cancel</Button></div></Sheet>;
}
