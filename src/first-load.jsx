import React,{useEffect,useMemo,useReducer,useRef,useState} from 'react';
import {AppContext,Button,Control,useApp} from './ui-core.jsx';
import {ActivityDots} from './activity.jsx';
import {EnrollmentForm} from './enrollment-form.jsx';
import {profilePalette} from './profile-model.js';
import {freshRehearsal,rehearsalTransition} from './first-load-model.js';
import './first-load.css';

// Loading has its own quiet treatment, separate from welcome and account setup.
export function FirstLoad({busy=true,error='',onRetry,onFreshStart,onReturn}){
 return <section className="first-load" aria-labelledby="first-load-heading">
  <h1 id="first-load-heading">{busy?'Opening your family space…':error?'Your family space couldn’t open.':'Your family space is ready.'}</h1>
  {busy&&<ActivityDots label="Loading GW"/>}{error&&!busy&&<p role="alert">{error}</p>}
  {(onReturn||onFreshStart||error&&onRetry)&&<div className="first-load-actions">{error&&onRetry&&!busy&&<Button onClick={onRetry}>Try again</Button>}{onReturn&&<Button onClick={onReturn}>Return to GW</Button>}{onFreshStart&&<Control type="button" className="text-button" onClick={onFreshStart}>Fresh Start</Control>}</div>}
 </section>;
}

// The rehearsal receives appearance values only. No live adapter or account
// state is provided to its shared form, and nothing is written to storage.
export function FirstLoadRehearsal({onReturn}){
 const {platform,theme}=useApp(),[rehearsal,dispatch]=useReducer(rehearsalTransition,undefined,freshRehearsal),[previewColor,setPreviewColor]=useState(null),heading=useRef(null);
 const sandbox=useMemo(()=>({platform,data:{pending:false},setPreviewColor}),[platform]);
 useEffect(()=>{heading.current?.focus({preventScroll:true})},[rehearsal.stage]);
 useEffect(()=>{const escape=e=>{if(e.key==='Escape'){e.preventDefault();onReturn()}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[onReturn]);
 const appearance=previewColor?profilePalette(previewColor,theme):undefined;
 return <AppContext.Provider value={sandbox}><section className="first-load-rehearsal" style={appearance} aria-label="Fresh Start rehearsal">
  <div className="first-load-rehearsal-bar"><p>Fresh Start rehearsal</p><Control type="button" className="text-button" onClick={onReturn}>Return to GW</Control></div>
  <p className="first-load-safety">Try the first-time profile setup. Your real profile, family, preferences, and drafts stay as they are. Rehearsal changes last only while this view is open.</p>
  {rehearsal.stage==='welcome'?<div className="first-load-welcome"><h1 ref={heading} tabIndex={-1}>Good to see you.</h1><p>A place for our stories, our plans, and our people.</p><Button onClick={()=>dispatch({type:'START'})}>Start your profile</Button></div>:rehearsal.stage==='profile'?<><h2 className="sr-only" ref={heading} tabIndex={-1}>Rehearse profile setup</h2><EnrollmentForm onSave={values=>dispatch({type:'SAVE_DRAFT',values})} saveLabel="Save rehearsal draft" savingLabel="Saving rehearsal draft…" skipLabel="Save draft without appearance" draftNotice="This form saves only to the rehearsal. It does not join the family, share birthday choices, or upload your photo."/></>:<div className="first-load-complete"><h1 ref={heading} tabIndex={-1}>Rehearsal finished.</h1><p>Your practice draft was saved for this rehearsal only. Your real account and profile haven’t changed.</p><Button onClick={onReturn}>Return to GW</Button></div>}
 </section></AppContext.Provider>;
}
