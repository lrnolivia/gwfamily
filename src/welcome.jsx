import React,{useEffect,useId,useRef,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {useTutorial} from './tutorial.jsx';
import {FamilySetup} from './family-setup.jsx';
import {promptDue} from './member-prompts-model.js';
import {useScrollEdge} from './shared-scroll-edge.jsx';
import './welcome.css';
// First-run welcome for an approved member. App mounts this only after the
// existing authorization gate, so the blurred Home behind it is content the
// member may already see; nothing private renders earlier. The card itself is
// opaque. It never changes the route, drafts or history, and the guided tour
// starts only after the card has left and its dialog has closed.
const WELCOME_STEPS=['hello','family','tour'],REFINE_STEPS=['family'],REVEAL_MS=420;
const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
// variant="refine" is the one-time optional family refinement for existing
// members: the same card around the same setup UI, recording only its prompt.
export function WelcomeOverlay({variant='welcome',manual=false,returnFocus=null,onClose}){
 const refine=variant==='refine',STEPS=refine?REFINE_STEPS:WELCOME_STEPS;
 const {state,dispatch,setToast}=useApp(),tour=useTutorial(),ref=useRef(null),heading=useRef(null),origin=useRef(null),closing=useRef(false),titleId='gw-welcome-'+useId().replace(/:/g,'');
 const body=useRef(null);useScrollEdge(body);
 const [step,setStep]=useState(STEPS[0]),[leaving,setLeaving]=useState(false),[busy,setBusy]=useState(false);
 const first=(state.members.find(m=>m.id===state.selfId)?.name||'').trim().split(/\s+/)[0];
 useEffect(()=>{origin.current=returnFocus||document.activeElement;const el=ref.current;if(el&&!el.open)el.showModal();return()=>{if(el?.open)el.close()}},[]);
 useEffect(()=>{heading.current?.focus({preventScroll:true})},[step]);
 // Manual replays record nothing. A due prompt records Not now or Done once.
 async function record(status){
  if(manual)return true;let saved=true;
  for(const prompt of refine?['family-setup']:['welcome',...(status==='completed'&&promptDue(state,'family-setup')?['family-setup']:[])])saved=(await dispatch({type:'SET_PROMPT_STATUS',prompt,status}).catch(()=>false))&&saved;
  return saved;
 }
 async function finish(status,{startTour=false}={}){
  if(closing.current)return;closing.current=true;setBusy(true);
  if(!await record(status))setToast?.('Your choice couldn’t be saved, so this welcome may appear again.');
  setLeaving(true);
  setTimeout(()=>{
   if(ref.current?.open)ref.current.close();onClose?.();
   requestAnimationFrame(()=>{if(startTour&&tour?.enabled)tour.start(true);else (origin.current?.isConnected?origin.current:document.getElementById('main'))?.focus?.({preventScroll:true})});
  },reducedMotion()?0:REVEAL_MS);
 }
 const index=STEPS.indexOf(step);
 return <dialog ref={ref} className={'welcome-overlay'+(refine?' is-refine':'')+(leaving?' is-leaving':'')} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();finish(step==='tour'?'completed':'dismissed')}}>
  <div className="welcome-scrim" aria-hidden="true"/>
  <div className="welcome-card" data-step={step} aria-busy={busy}>
   <div className="welcome-head">
    <Control type="button" className="icon-button welcome-close" aria-label="Not now" disabled={busy} onClick={()=>finish(step==='tour'?'completed':'dismissed')}><Glyph name="close"/></Control>
    {STEPS.length>1?<ol className="welcome-progress" aria-label={'Step '+(index+1)+' of '+STEPS.length}>{STEPS.map((s,i)=><li key={s} className={i<=index?'is-done':''} aria-hidden="true"/>)}</ol>:<span aria-hidden="true"/>}
    {refine?<Control type="button" className="icon-button welcome-complete" aria-label="Done" disabled={busy} onClick={()=>finish('completed')}><Glyph name="check"/></Control>:<span className="welcome-head-spacer" aria-hidden="true"/>}
   </div>
   <div ref={body} className="welcome-body">
    {step==='hello'?<>
     <img className="welcome-art" src="tree-artwork.png" alt=""/>
     <h2 id={titleId} ref={heading} tabIndex={-1}>Welcome to the family{first?', '+first:''}</h2>
     <p className="welcome-lede">Green &amp; White is your family’s private home for stories, photos and plans.</p>
     <ul className="welcome-points">
      <li><Glyph name="home"/><span><strong>Home</strong><small>The family feed and what’s coming up</small></span></li>
      <li><Glyph name="people"/><span><strong>Family</strong><small>People, memories and the family tree</small></span></li>
      <li><Glyph name="user"/><span><strong>You</strong><small>Your profile, household and settings</small></span></li>
     </ul>
    </>:step==='family'?<>
     <h2 id={titleId} ref={heading} tabIndex={-1}>{refine?'Refine your family':'Find your family'}</h2>
     <p className="welcome-lede">{refine?'Green & White now has branches: broad family lines that households can belong to. Check your households and branches, or skip and do it anytime from You → Branches & households.':'Optional. Choose your branch and household now, or anytime from You → Branches & households.'} Nothing changes until you confirm.</p>
     <FamilySetup intro={false}/>
    </>:<>
     <img className="welcome-art" src="tree-artwork.png" alt=""/>
     <h2 id={titleId} ref={heading} tabIndex={-1}>Take a quick look around</h2>
     <p className="welcome-lede">We’ll highlight the real controls one at a time. Nothing is posted or changed, you can skip anytime, and You → Quick guide replays it.</p>
    </>}
   </div>
   <div className="welcome-footer sheet-footer">
    {step==='hello'?<><Button secondary disabled={busy} onClick={()=>finish('dismissed')}>Not now</Button><Button disabled={busy} onClick={()=>setStep('family')}>Get started<Glyph name="arrow"/></Button></>
    :step==='family'&&refine?<><Button secondary disabled={busy} onClick={()=>finish('dismissed')}>Not now</Button><Button disabled={busy} onClick={()=>finish('completed')}>Done</Button></>
    :step==='family'?<><Button secondary disabled={busy} onClick={()=>setStep('hello')}>Back</Button><Button disabled={busy} onClick={()=>setStep('tour')}>Continue<Glyph name="arrow"/></Button></>
    :<><Button secondary disabled={busy} onClick={()=>finish('completed')}>Maybe later</Button><Button disabled={busy||!tour?.enabled} onClick={()=>finish('completed',{startTour:true})}>Show me around<Glyph name="arrow"/></Button></>}
   </div>
  </div>
 </dialog>;
}
