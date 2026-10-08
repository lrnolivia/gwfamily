import React,{createContext,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {ViewSwitcher} from './view-switcher.jsx';
import {contextualTopic,tutorialTopics} from './tutorial-model.js';
import {availableTourSteps,positionTour,readTourProgress,resumeTourIndex,saveTourProgress,tourAccount,tourShadeRegions} from './contextual-tour-model.js';
import {createTourGeometryTracker,cycleTourFocus,describeTourTarget,findTourTarget,isolateTourBranches,tourFocusable} from './contextual-tour-dom.js';
import './help.css';
import './tutorial.css';
const TutorialContext=createContext(null);
const guideStorage=()=>{try{return globalThis.localStorage}catch{return null}};
const sameRoute=(a,b)=>['type','id','section','tab'].every(key=>(a?.[key]||'')===(b?.[key]||''));
const viewport=()=>window.visualViewport||{width:window.innerWidth,height:window.innerHeight};

// This provider must stay mounted across the main app's routes. Tour steps only
// replace ordinary public routes. They never click a control or call a data API.
export function TutorialProvider({enabled=true,children}){
 const app=useApp(),account=tourAccount(app?.state),[session,setSession]=useState(null),[saved,setSaved]=useState(()=>readTourProgress(guideStorage(),account)),[savedIdentity,setSavedIdentity]=useState(account),[storageError,setStorageError]=useState(false),[launchError,setLaunchError]=useState(''),latest=useRef(app),active=useRef(null);
 latest.current=app;active.current=session;
 const steps=useMemo(()=>availableTourSteps({messages:!!app?.messaging,notifications:!!app?.notifications}),[!!app?.messaging,!!app?.notifications]);
 const remember=(step,status,identity=account)=>{const value={version:1,step,status};setStorageError(!saveTourProgress(guideStorage(),identity,value));setSaved(value);setSavedIdentity(identity)};
 useEffect(()=>{setSession(null);setSaved(readTourProgress(guideStorage(),account));setSavedIdentity(account);setStorageError(false);setLaunchError('')},[account,enabled]);
 const start=(restart=false)=>{
  if(!enabled||!account||latest.current?.data?.pending||!steps.length)return;
  if(document.querySelector('dialog[open]')){setLaunchError('Close the open dialog before starting the guide.');return}
  setLaunchError('');
  const progress=readTourProgress(guideStorage(),account),index=resumeTourIndex(steps,progress,restart),origin={route:{...latest.current.route},focus:document.activeElement,scroll:window.scrollY};
  latest.current.openSheet?.(null);latest.current.replaceRoute(steps[index].route);window.scrollTo({top:0,behavior:'auto'});
  remember(steps[index].id,'started');setSession({account,steps,index,origin});
 };
 const move=index=>{
  const current=active.current;if(!current||latest.current?.data?.pending||index<0||index>=current.steps.length)return;
  remember(current.steps[index].id,'started',current.account);latest.current.replaceRoute(current.steps[index].route);window.scrollTo({top:0,behavior:'auto'});setSession({...current,index});
 };
 const stop=(status='paused',{restore=true,focusTarget=null}={})=>{
  const current=active.current;if(!current)return;
  remember(current.steps[current.index].id,status,current.account);setSession(null);active.current=null;
  if(restore&&current.account===tourAccount(latest.current.state))latest.current.replaceRoute(current.origin.route);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(current.account!==tourAccount(latest.current.state)||active.current)return;
   if(restore)window.scrollTo({top:current.origin.scroll,behavior:'auto'});
   const focus=focusTarget?.isConnected?focusTarget:restore?(current.origin.focus?.isConnected?current.origin.focus:document.querySelector('[data-gw-tour-launch]')):null;
   focus?.focus?.({preventScroll:true});
  }));
 };
 useEffect(()=>{
  if(session&&(!enabled||session.account!==account)){setSession(null);return}
  if(session&&!sameRoute(app.route,session.steps[session.index].route))stop('paused',{restore:false});
 },[app?.route,session?.index,account,enabled]);
 const value={enabled:enabled&&!!account,start,saved:savedIdentity===account?saved:readTourProgress(guideStorage(),account),storageError:savedIdentity===account&&storageError,launchError};
 return <TutorialContext.Provider value={value}>{children}{enabled&&session&&session.account===account&&<ContextualTour key={account+':'+session.steps[session.index].id} step={session.steps[session.index]} index={session.index} count={session.steps.length} busy={!!app?.data?.pending} storageError={storageError} back={()=>move(session.index-1)} next={()=>session.index===session.steps.length-1?stop('completed'):move(session.index+1)} skip={()=>stop('skipped')} explore={()=>stop('paused',{restore:false})}/>}</TutorialContext.Provider>;
}

function ContextualTour({step,index,count,busy,storageError,back,next,skip,explore}){
 const panel=useRef(null),target=useRef(null),overlay=useRef(null),callbacks=useRef({back,next,skip,explore,busy}),focusedStep=useRef(null),id=useId().replace(/:/g,''),descriptionId='gw-tour-description-'+id,titleId='gw-tour-title-'+id;
 const [position,setPosition]=useState(null),[missing,setMissing]=useState(false),[finding,setFinding]=useState(true),[geometryReady,setGeometryReady]=useState(false);
 callbacks.current={back,next,skip,explore,busy,finding:finding||!geometryReady};
 useEffect(()=>{
  let frame=0,alive=true,scrolled=false,resolved=false,settled=false,dirty=true,restoreIsolation=()=>{},restoreDescription=()=>{},observed=null;
  const geometry=createTourGeometryTracker();
  setPosition(null);setMissing(false);setFinding(true);setGeometryReady(false);target.current=null;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const measure=()=>{
   if(!alive||!panel.current||!overlay.current)return;
   // A native modal owns protected focus. Pause without closing, acknowledging,
   // or changing it, including an asynchronously arriving leader announcement.
   if(document.querySelector('dialog[open]')){callbacks.current.explore();return}
   const node=findTourTarget(document,step.target);
   if(node!==target.current||dirty){
    dirty=false;
    restoreIsolation();restoreDescription();target.current=node;
    restoreIsolation=isolateTourBranches(document.body,overlay.current,node);restoreDescription=describeTourTarget(node,descriptionId);
    if(observed)resize?.unobserve(observed);observed=node;if(node)resize?.observe(node);
   }
   if(node&&!scrolled){scrolled=true;const r=node.getBoundingClientRect(),v=viewport(),top=v.offsetTop||0,left=v.offsetLeft||0;if(r.top<top+12||r.bottom>top+v.height-12||r.left<left+12||r.right>left+v.width-12)node.scrollIntoView({block:'center',inline:'nearest',behavior:reduced?'auto':'smooth'})}
   const rect=node?.getBoundingClientRect(),v=viewport(),visible=rect&&rect.bottom>(v.offsetTop||0)&&rect.top<(v.offsetTop||0)+v.height&&rect.right>(v.offsetLeft||0)&&rect.left<(v.offsetLeft||0)+v.width;
   const size={width:Math.min(356,v.width-24),height:panel.current.scrollHeight||300};
   const nextPosition=positionTour(visible?rect:null,size,v),measurement=geometry.sample(nextPosition,visible?rect:null,panel.current.getBoundingClientRect(),size,v);
   setPosition(nextPosition);
   resolved=!!(node&&visible);if(resolved){settled=true;setFinding(false);setMissing(false)}else if(settled){setFinding(false);setMissing(true)}
   // Let the Finding status/spotlight note render, then verify the applied coach
   // and real target are stable and separated before accepting another Next.
   const ready=(resolved||settled)&&measurement.ready;
   overlay.current.dataset.tourStableFrames=String(measurement.stableFrames);
   setGeometryReady(ready);if(!ready)schedule();
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  resize?.observe(panel.current);
  // Only target/layout presence is observed. No content is read or saved.
  const mutations=typeof MutationObserver==='function'?new MutationObserver(records=>{if(records.some(record=>!overlay.current?.contains(record.target)&&(record.type!=='attributes'||record.attributeName==='open'||!record.target.hasAttribute('inert')))){dirty=true;schedule()}}):null;
  mutations?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','inert']});
  const timeout=setTimeout(()=>{settled=true;if(!resolved){setMissing(true);setFinding(false);schedule()}},1400);
  const onKey=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();callbacks.current.skip();return}
   if(cycleTourFocus(event,tourFocusable(panel.current,target.current),document.activeElement))return;
   // Arrow shortcuts stay inside the coach, leaving the actual control's native
   // keyboard behavior intact. No key ever triggers a highlighted control.
   if(panel.current?.contains(event.target)&&!callbacks.current.busy&&!event.altKey&&!event.ctrlKey&&!event.metaKey){if(event.key==='ArrowRight'&&!callbacks.current.finding){event.preventDefault();callbacks.current.next()}else if(event.key==='ArrowLeft'&&index>0){event.preventDefault();callbacks.current.back()}}
  };
  const onClick=event=>{if(target.current?.contains(event.target))callbacks.current.explore(target.current)};
  const onFocus=event=>{if(!panel.current?.contains(event.target)&&!target.current?.contains(event.target))panel.current?.focus({preventScroll:true})};
  document.addEventListener('keydown',onKey,true);document.addEventListener('click',onClick,true);document.addEventListener('focusin',onFocus,true);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  schedule();
  return ()=>{alive=false;cancelAnimationFrame(frame);clearTimeout(timeout);resize?.disconnect();mutations?.disconnect();restoreIsolation();restoreDescription();document.removeEventListener('keydown',onKey,true);document.removeEventListener('click',onClick,true);document.removeEventListener('focusin',onFocus,true);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule)};
 },[step.id,index,descriptionId]);
 useEffect(()=>{if(position&&focusedStep.current!==step.id){focusedStep.current=step.id;panel.current?.focus({preventScroll:true})}},[position,step.id]);
 if(typeof document==='undefined')return null;
 const hole=position?.hole,arrow=position?.arrow,coach=position?.coach;
 const content=<><div className="tour-progress-row"><p className="tour-progress">Step {index+1} of {count}</p><button type="button" className="tour-skip" onClick={skip}>Skip guide</button></div><div className="tour-copy" aria-live="polite" aria-atomic="true"><h2 id={titleId}>{step.title}</h2><p id={descriptionId}>{step.body}</p><p className="tour-instruction">{step.instruction}</p>{finding&&<p className="tour-status" role="status">Finding this control…</p>}{missing&&<p className="tour-status" role="status">This control isn’t visible right now. You can continue, or skip and come back later.</p>}{position?.reason==='viewport-too-small'&&<p className="tour-status" role="status">There isn’t enough room to highlight the control beside these instructions. Zoom out or rotate your device, or continue the guide.</p>}{storageError&&<p className="tour-status" role="status">This browser can’t save your progress. You can still finish the guide.</p>}</div>{hole&&<p className="tour-explore-note">Choose the highlighted control to try it. The guide will pause.</p>}<div className="tour-controls"><button type="button" className="tour-back" disabled={index===0||busy} onClick={back}><Glyph name="arrow"/>Back</button><button type="button" className="tour-next" disabled={busy||finding||!geometryReady} onClick={next}>{index===count-1?'Finish guide':'Next'}<Glyph name="arrow"/></button></div></>;
 return createPortal(<div ref={overlay} className="contextual-tour" data-tour-step={step.id} data-tour-geometry={geometryReady?'ready':'measuring'}>
  {position&&tourShadeRegions(position).map((region,i)=><div key={i} className="tour-dim" style={region} aria-hidden="true" onPointerDown={event=>event.preventDefault()}/>)}
  {hole&&<div className="tour-spotlight" style={{left:hole.left,top:hole.top,width:hole.width,height:hole.height}} aria-hidden="true"/>}
  {arrow&&<svg className="tour-pointer" aria-hidden="true"><defs><marker id={'gw-tour-arrow-'+id} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L6 3.5 L0 7"/></marker></defs><path d={`M${arrow.start.x} ${arrow.start.y} L${arrow.end.x} ${arrow.end.y}`} markerEnd={`url(#gw-tour-arrow-${id})`}/></svg>}
  <section ref={panel} className="tour-coach" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} style={coach?{left:coach.left,top:coach.top,width:coach.width,maxHeight:coach.maxHeight}:{left:12,top:12,width:'min(356px, calc(100% - 24px))',visibility:'hidden'}}>
   <div className="tour-card tour-card-flat">{content}</div>
  </section>
 </div>,document.body);
}

export function Tutorial(){
 const app=useApp(),tour=useContext(TutorialContext),[topic,setTopic]=useState(()=>contextualTopic(app.route)),selected=tutorialTopics.find(item=>item.id===topic)||tutorialTopics[0],progress=tour?.saved;
 const resumable=progress&&['started','paused','skipped'].includes(progress.status);
 return <section className="stack guided-help tutorial-page"><div className="tutorial-intro"><h1>Quick guide</h1><p>Find your way around the real app, one highlighted control at a time. Go back, skip, or pause to try a control whenever you like.</p></div><div className="tutorial-start"><Button data-gw-tour-launch="primary" disabled={!tour?.enabled||app.data?.pending} onClick={()=>tour?.start()}>{resumable?'Resume guide':progress?.status==='completed'?'Replay guide':'Start guide'}<Glyph name="arrow"/></Button>{resumable&&<Control className="text-button" data-gw-tour-launch="restart" disabled={!tour?.enabled||app.data?.pending} onClick={()=>tour?.start(true)}>Start over</Control>}</div>{tour?.launchError&&<p className="help-status" role="status">{tour.launchError}</p>}{progress?.status==='completed'&&<p className="help-status" role="status">You’ve finished the guide. Replay it whenever you want.</p>}{tour?.storageError&&<p className="help-status" role="status">This browser can’t save your guide progress. You can still explore every step.</p>}{!tour?.enabled&&<p className="help-status">The guide is available after you’ve entered the app.</p>}<div className="tutorial-reference"><h2>Keep these basics handy</h2><ViewSwitcher label="Explore a topic" value={topic} onChange={setTopic} options={tutorialTopics.map(item=>({value:item.id,icon:item.id==='messages'?'chat':item.id==='notifications'?'bell':item.id==='you'?'user':'home',label:item.id==='messages'?'Messages':item.id==='notifications'?'Notifications':item.id==='you'?'You':'Home'}))}/><section className="tutorial-topic" aria-live="polite" aria-atomic="true"><h3>{selected.title}</h3><p>{selected.body}</p><p className="tutorial-tip">{selected.tip}</p></section></div><p className="small muted">The guide never sends a post or message, submits a form, changes a preference, or requests a permission. Use Back whenever you’re ready to explore on your own.</p></section>;
}
