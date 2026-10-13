import React,{useRef,useState} from 'react';
import {Button,useApp} from './ui-core.jsx';
import './account-actions.css';
export function SignOutControl({className=''}){
 const {data}=useApp(),lock=useRef(false),[busy,setBusy]=useState(false);
 async function signOut(){if(lock.current)return;lock.current=true;setBusy(true);try{await data.signOut()}finally{lock.current=false;setBusy(false)}}
 return <Button secondary className={'sign-out '+className} disabled={busy||data.pending} aria-busy={busy} onClick={signOut}>{busy?'Signing out…':'Sign out'}</Button>;
}
export function PreviewAccountControls({compact=false}){
 const {state,data}=useApp();if(state.mode!=='preview')return null;
 return <div className={'preview-account-actions '+(compact?'is-compact':'')}><p className="field-help">You're exploring sample content.{data.session?.signedIn?(data.session.status==='new'?' Your account still needs a profile. Exit preview to finish setup, or sign out below.':' Your signed-in account is still connected.'):''}</p>{data.config?.configured&&<Button secondary onClick={data.leavePreview} disabled={data.pending}>Exit preview</Button>}<SignOutControl/></div>;
}
