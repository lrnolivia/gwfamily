import React,{useEffect,useRef,useState} from 'react';
import {Control,Glyph,useApp} from './ui-core.jsx';
import {FamilySetupTask,FamilyOption as Option} from './family-setup.jsx';
import {branchKey,branchMatch,branchesForHousehold,canPlaceHousehold,familySetupSearch,familySetupSuggestions} from './branch-model.js';
import './family-steps.css';
// Guided family setup for the welcome and the one-time refinement: one question
// per screen. Households -> a branch for each household you can place that has
// none -> which household shows first (only with two or more) -> review.
// Branch and primary choices are saved together from Review; Not now saves nothing.
// Join and Start use the existing confirmed sheets. You -> Branches & households
// keeps the full page for everything else.
const OTHER_BRANCHES=4;
const memberOf=(state,h)=>(h?.memberIds||[]).includes(state.selfId);
const memberCount=h=>{const n=(h.memberIds||[]).length;return n+' '+(n===1?'member':'members')};
export const branchCount=b=>{const n=(b.householdIds||[]).length;return n?n+' '+(n===1?'household':'households'):'No households yet'};
const pendingJoins=state=>(state.householdRequests||[]).filter(r=>r.kind==='join'&&r.requesterId===state.selfId);
function defaultChoice(state){
 const suggest=familySetupSuggestions(state);
 if(suggest.branches[0])return {kind:'branch',branchId:suggest.branches[0].id};
 if(suggest.createName)return {kind:'create',name:suggest.createName+' Branch'};
 return {kind:'skip'};
}
export function useFamilySteps(){
 const {state,dispatch}=useApp(),latest=useRef(state);latest.current=state;
 const mine=(state.households||[]).filter(h=>memberOf(state,h));
 const open=mine.filter(h=>canPlaceHousehold(state,h)&&!branchesForHousehold(state,h.id).length);
 // The branch screens are fixed once the member moves past Households, so saving
 // one placement never reshuffles the steps they're on.
 const [frozen,setFrozen]=useState(null),targets=frozen?frozen.map(id=>mine.find(h=>h.id===id)).filter(Boolean):open;
 const [choices,setChoices]=useState({}),[primary,setPrimary]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const choiceFor=id=>choices[id]||defaultChoice(state),primaryId=primary||state.householdId||mine[0]?.id||null;
 const steps=['households',...targets.map(h=>'branch:'+h.id),...(mine.length>1?['primary']:[])];
 if(steps.length>1)steps.push('review');
 const lock=useRef(false);
 async function save(){
  if(lock.current)return true;lock.current=true;setBusy(true);setError('');
  try{
   for(const h of targets){
    const now=latest.current,choice=choiceFor(h.id);
    if(choice.kind==='skip'||branchesForHousehold(now,h.id).length)continue;
    let action;
    if(choice.kind==='branch')action={type:'ATTACH_BRANCH_HOUSEHOLD',branchId:choice.branchId,householdId:h.id};
    else{const existing=branchMatch(now,choice.name);action=existing?{type:'ATTACH_BRANCH_HOUSEHOLD',branchId:existing.id,householdId:h.id}:{type:'CREATE_BRANCH',name:choice.name,householdId:h.id}}
    if(!await dispatch(action)){setError(h.name+' wasn’t added to a branch. Try again, or choose later in You → Branches & households.');return false}
    // Let the saved state land before the next household looks for the same new branch.
    await new Promise(r=>setTimeout(r,0));
   }
   if(mine.length>1&&primaryId&&primaryId!==latest.current.householdId&&!await dispatch({type:'SET_PRIMARY_HOUSEHOLD',householdId:primaryId})){setError('Your main household wasn’t changed. Try again.');return false}
   return true;
  }catch(e){setError(e.message||'That wasn’t saved. Try again.');return false}
  finally{lock.current=false;setBusy(false)}
 }
 return {mine,targets,steps,choiceFor,choose:(id,choice)=>setChoices(c=>({...c,[id]:choice})),primaryId,setPrimary,freeze:()=>{if(!frozen)setFrozen(open.map(h=>h.id))},save,busy,error};
}
export function FamilyStep({flow,step,go,heading,titleId,refine}){
 const {state}=useApp(),[task,setTask]=useState(null),origin=useRef(null);
 const openTask=(next,e)=>{origin.current=e?.currentTarget||null;setTask(next)};
 const closeTask=()=>{setTask(null);requestAnimationFrame(()=>origin.current?.isConnected&&origin.current.focus())};
 const head=(title,lede)=><><h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>{lede&&<p className="welcome-lede">{lede}</p>}</>;
 const error=flow.error&&<p className="family-step-error" role="alert"><Glyph name="info"/><span>{flow.error}</span></p>;
 if(step==='households'){
  const pending=pendingJoins(state).map(r=>(state.households||[]).find(h=>h.id===r.householdId)).filter(h=>h&&!memberOf(state,h));
  return <>
   {head(refine?'Your households':'Find your family',flow.mine.length?'These are the households you belong to. You can be in more than one.':'You aren’t in a household yet. Ask to join yours, or start one. You can also skip this for now.')}
   <div className="family-step-list" role="list" aria-label="Your households">
    {flow.mine.map(h=><div key={h.id} role="listitem" className="family-step-row"><Glyph name="home"/><span><strong>{h.name}</strong><small>{memberCount(h)}{h.canManage?' · you’re a head':''}{branchesForHousehold(state,h.id).length?' · '+branchesForHousehold(state,h.id).map(b=>b.name).join(', '):''}</small></span><span className="family-step-check" aria-label="You’re a member"><Glyph name="check"/></span></div>)}
    {pending.map(h=><div key={h.id} role="listitem" className="family-step-row is-pending"><Glyph name="clock"/><span><strong>{h.name}</strong><small>Request sent · a head will decide</small></span></div>)}
   </div>
   <div className="family-step-list">
    <Control type="button" className="list-row family-step-action" onClick={e=>openTask({type:'find-household'},e)}><Glyph name="search"/><span><strong>{flow.mine.length?'Join another household':'Join your household'}</strong><small>Search by name. A head approves your request.</small></span><span className="arrow"><Glyph name="arrow"/></span></Control>
    <Control type="button" className="list-row family-step-action" onClick={e=>openTask({type:'create-household',askBranch:false},e)}><Glyph name="plus"/><span><strong>Start a household</strong><small>You’ll be its founding head</small></span><span className="arrow"><Glyph name="arrow"/></span></Control>
   </div>
   {task&&<FamilySetupTask task={task} onTask={setTask} onClose={closeTask}/>}
  </>;
 }
 if(step.startsWith('branch:'))return <BranchStep flow={flow} household={flow.targets.find(h=>'branch:'+h.id===step)} head={head}/>;
 if(step==='primary')return <>
  {head('Which household should show first?','Your main household is the badge people see next to your name.')}
  <fieldset className="family-step-list family-step-choices"><legend className="sr-only">Main household</legend>
   {flow.mine.map(h=>{const b=branchLabel(state,flow,h);return <Option key={h.id} name="family-step-primary" checked={flow.primaryId===h.id} onChange={()=>flow.setPrimary(h.id)} glyph="home" title={h.name} detail={b||memberCount(h)} disabled={flow.busy}/>})}
  </fieldset>
 </>;
 // Review: everything above saves together on Done.
 return <>
  {head('Look right?','Here’s what will change. Tap Done to save.')}
  <dl className="family-step-summary">
   {flow.mine.map(h=>{const editable=flow.targets.some(t=>t.id===h.id),b=branchLabel(state,flow,h);return <div key={h.id}><dt><Glyph name="home"/>{h.name}</dt><dd>{editable?<Control type="button" className="family-step-change" disabled={flow.busy} onClick={()=>go('branch:'+h.id)}><Glyph name="tree"/>{b||'No branch yet'}<span>Change</span></Control>:<span className="family-step-fixed"><Glyph name="tree"/>{b||'No branch'}</span>}</dd></div>})}
   {flow.mine.length>1&&<div><dt><Glyph name="user"/>Shows first</dt><dd><Control type="button" className="family-step-change" disabled={flow.busy} onClick={()=>go('primary')}>{flow.mine.find(h=>h.id===flow.primaryId)?.name}<span>Change</span></Control></dd></div>}
  </dl>
  <p className="field-help">You can change any of this later in You → Branches &amp; households.</p>
  {error}
 </>;
}
function branchLabel(state,flow,h){
 if(!flow.targets.some(t=>t.id===h.id))return branchesForHousehold(state,h.id).map(b=>b.name).join(', ');
 const c=flow.choiceFor(h.id);return c.kind==='branch'?(state.branches||[]).find(b=>b.id===c.branchId)?.name||'':c.kind==='create'?c.name:'';
}
function BranchStep({flow,household:h,head}){
 const {state}=useApp(),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),field=useRef(null);
 useEffect(()=>{if(searching)field.current?.focus()},[searching]);
 if(!h)return null;
 const suggest=familySetupSuggestions(state),suggested=suggest.branches[0]||null,choice=flow.choiceFor(h.id),name='family-step-branch-'+h.id;
 const createName=!suggested&&suggest.createName?suggest.createName+' Branch':'';
 const all=(state.branches||[]).filter(b=>b.id!==suggested?.id),found=query.trim()?familySetupSearch(state,query).branches.filter(b=>b.id!==suggested?.id):all;
 // Keep a chosen branch visible even when it isn't in the short list.
 const picked=choice.kind==='branch'&&choice.branchId!==suggested?.id?all.find(b=>b.id===choice.branchId):null;
 const shown=searching?found:[...new Set([...(picked?[picked]:[]),...all.slice(0,OTHER_BRANCHES)])];
 const searchCreate=searching&&query.trim()&&!branchMatch(state,query)&&branchKey(query)!==branchKey(createName)?query.trim():'';
 return <>
  {head(<>Which family branch is {h.name} part of?</>,'A branch groups households that share a family line. Nobody joins your household or gets access because of it.')}
  <fieldset className="family-step-list family-step-choices"><legend className="sr-only">Branch for {h.name}</legend>
   {suggested&&<Option name={name} checked={choice.kind==='branch'&&choice.branchId===suggested.id} onChange={()=>flow.choose(h.id,{kind:'branch',branchId:suggested.id})} glyph="tree" title={suggested.name} detail={branchCount(suggested)} tag="Suggested" disabled={flow.busy}/>}
   {createName&&<Option name={name} checked={choice.kind==='create'&&branchKey(choice.name)===branchKey(createName)} onChange={()=>flow.choose(h.id,{kind:'create',name:createName})} glyph="tree" title={createName} detail="New branch for your last name" tag="Suggested" disabled={flow.busy}/>}
   {shown.map(b=><Option key={b.id} name={name} checked={choice.kind==='branch'&&choice.branchId===b.id} onChange={()=>flow.choose(h.id,{kind:'branch',branchId:b.id})} glyph="tree" title={b.name} detail={branchCount(b)} disabled={flow.busy}/>)}
   {searching&&!found.length&&!searchCreate&&<p className="muted">No branches match “{query.trim()}”.</p>}
   {searchCreate&&<Option name={name} checked={choice.kind==='create'&&branchKey(choice.name)===branchKey(searchCreate)} onChange={()=>flow.choose(h.id,{kind:'create',name:searchCreate})} glyph="plus" title={'Create “'+searchCreate+'”'} detail="A new branch. Only if yours isn’t listed." disabled={flow.busy}/>}
   <Option name={name} checked={choice.kind==='skip'} onChange={()=>flow.choose(h.id,{kind:'skip'})} glyph="help" title="Not sure yet" detail="Skip. You can choose later." disabled={flow.busy}/>
  </fieldset>
  {searching?<label className="family-step-search"><Glyph name="search"/><span className="sr-only">Search branches</span><input ref={field} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search branches by name" autoComplete="off" enterKeyHint="search"/></label>
   :(all.length>OTHER_BRANCHES||!all.length)&&<Control type="button" className="list-row family-step-action" onClick={()=>setSearching(true)}><Glyph name="search"/><span><strong>{all.length?'Find another branch':'Name a different branch'}</strong><small>{all.length?'Search all '+((state.branches||[]).length)+' branches':'If your family line has another name'}</small></span><span className="arrow"><Glyph name="arrow"/></span></Control>}
 </>;
}
