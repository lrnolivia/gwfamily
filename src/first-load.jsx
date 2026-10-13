import React,{useEffect,useMemo,useReducer,useRef,useState} from 'react';
import {AppContext,Button,Control,useApp} from './ui-core.jsx';
import {EnrollmentForm} from './enrollment-form.jsx';
import {profilePalette} from './profile-model.js';
import {freshRehearsal,rehearsalTransition} from './first-load-model.js';
import './first-load.css';

// Purely decorative motion never delays hydration or changes account setup.
const splashLeaves=[
 ['M100 85 C130 65 185 102 168 124 S210 147 280 210','-1.2s','7s'],
 ['M175 58 C200 25 265 45 245 90 S290 125 345 190','-4.6s','8s'],
 ['M248 103 C305 70 325 119 297 141 S349 179 409 226','-2.8s','7.8s'],
 ['M310 125 C350 96 395 128 368 158 S400 212 464 242','-6s','9s'],
 ['M140 132 C185 96 210 144 186 174 S250 207 305 251','-.4s','8.6s'],
 ['M265 70 C299 31 354 58 332 90 S380 126 440 180','-3.4s','9.4s']
];
export function FirstLoad({busy=true,error='',onRetry,onReturn}){
 const wind=useRef(null);
 const [hidden,setHidden]=useState(()=>typeof document!=='undefined'&&document.hidden);
 useEffect(()=>{const update=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
 useEffect(()=>{
  const svg=wind.current;if(!svg)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>{if(hidden||!busy||reduced.matches)svg.pauseAnimations();else svg.unpauseAnimations()};
  update();reduced.addEventListener('change',update);return()=>reduced.removeEventListener('change',update);
 },[hidden,busy]);
 return <section className="first-load" data-busy={busy} data-paused={hidden||!busy} aria-labelledby="first-load-heading">
  <div className="first-load-grove" aria-hidden="true">
   <img className="first-load-trees" src="tree-artwork.png" alt="" width="1680" height="945" fetchPriority="high" decoding="async"/>
   {busy&&<svg ref={wind} className="first-load-wind" viewBox="0 0 480 300" fill="none">
    {splashLeaves.map(([path,begin,duration],i)=><g key={i} className="first-load-flight">
     <animate attributeName="opacity" values="0;.8;.8;0" keyTimes="0;.12;.75;1" dur={duration} begin={begin} repeatCount="indefinite"/>
     <path className="first-load-trail" d={path} pathLength="100" strokeDasharray="10 100" strokeDashoffset="10">
      <animate attributeName="stroke-dashoffset" from="10" to="-90" dur={duration} begin={begin} repeatCount="indefinite" calcMode="linear"/>
     </path>
     <g className="first-load-leaf">
      <animateMotion path={path} dur={duration} begin={begin} repeatCount="indefinite" rotate="auto" calcMode="linear"/>
      <path className="first-load-leaf-shape" d="M-11 1 Q-5-10 9-2 L13 0 Q3 1-1 6 Q-7 9-11 1Z"/>
      <path className="first-load-leaf-veins" d="M-13 3 Q-3-1 11 0 M-6 1L-5-4 M-2 0L0-5 M3 0L5-3 M-6 1L-3 5 M-1 0L2 3"/>
     </g>
    </g>)}
   </svg>}
  </div>
  <h1 id="first-load-heading" className={busy?'sr-only':undefined}>{busy?'Opening your family space…':error?'Your family space couldn’t open.':'Your family space is ready.'}</h1>
  {busy&&<><p className="first-load-caption">A little closer to your people.</p><span className="sr-only" role="status" aria-label="Loading GW">Loading GW</span></>}{error&&!busy&&<p role="alert">{error}</p>}
  {(onReturn||error&&onRetry)&&<div className="first-load-actions">{error&&onRetry&&!busy&&<Button onClick={onRetry}>Try again</Button>}{onReturn&&<Button onClick={onReturn}>Return to GW</Button>}</div>}
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
