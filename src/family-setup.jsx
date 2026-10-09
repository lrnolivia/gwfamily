import React,{useRef,useState} from 'react';
import {Button,Control,Glyph,Sheet,useApp,useSheetForm} from './ui-core.jsx';
import {ChoiceControl} from './choice-control.jsx';
import {branchesForHousehold,branchMatch,canManageBranches,canPlaceHousehold,familySetupSearch,familySetupSuggestions} from './branch-model.js';
import './family-setup.css';
// Branch and household setup. Shared by You → Branches & households, first-run
// onboarding and the one-time refinement for existing members. Every placement
// (join request, attach, create) is an explicit, confirmed choice; surname
// suggestions only narrow the list.
const joinPending=(state,householdId)=>(state.householdRequests||[]).some(r=>r.householdId===householdId&&r.kind==='join'&&r.requesterId===state.selfId);
const memberOf=(state,household)=>(household?.memberIds||[]).includes(state.selfId);
const memberCount=h=>{const n=(h.memberIds||[]).length;return n+' '+(n===1?'member':'members')};
export function FamilySetup({heading='Branches & households',intro=true,onFinish,finishLabel}){
 const {state}=useApp(),[query,setQuery]=useState(''),[task,setTask]=useState(null),origin=useRef(null);
 const open=(next,event)=>{if(event?.currentTarget)origin.current=event.currentTarget;setTask(next)};
 const close=()=>{setTask(null);requestAnimationFrame(()=>origin.current?.isConnected&&origin.current.focus())};
 const mine=(state.households||[]).filter(h=>memberOf(state,h)),suggest=familySetupSuggestions(state),search=query.trim()?familySetupSearch(state,query):null;
 const branchRow=b=><Control key={b.id} type="button" className="list-row family-setup-row" onClick={e=>open({type:'branch',branchId:b.id},e)}><Glyph name="tree"/><span><strong>{b.name}</strong><p>{b.householdIds.length?b.householdIds.length+' '+(b.householdIds.length===1?'household':'households'):'No households yet'}</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>;
 const householdRow=h=><HouseholdSetupRow key={h.id} household={h} onTask={open}/>;
 return <section className="stack family-setup" aria-label={heading}>
  {intro&&<header className="family-setup-intro"><h1>{heading}</h1><p className="field-help">A <strong>branch</strong> is a broad family line, like a shared surname. A <strong>household</strong> is a smaller home unit. Households can belong to more than one branch, and you can belong to more than one household.</p></header>}
  <section className="card stack family-setup-section"><h2>Your households</h2>
   {mine.length?mine.map(h=><HouseholdSetupRow key={h.id} household={h} onTask={open} own/>):<p className="muted">You aren’t in a household yet. Ask to join one below or start your own.</p>}
   <Control type="button" className="list-row family-setup-row family-setup-create" onClick={e=>open({type:'create-household'},e)}><Glyph name="plus"/><span><strong>Start a household</strong><p>You’ll be its founding head</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>
  </section>
  {(suggest.branches.length>0||suggest.households.length>0||suggest.createName)&&!query.trim()&&<section className="card stack family-setup-section family-setup-suggested" aria-label="Suggestions"><h2>Suggested for you</h2><p className="field-help">Based on the last name {suggest.surname}. Nothing changes until you choose an option and confirm it.</p>
   {suggest.branches.map(branchRow)}{suggest.households.map(householdRow)}
   {suggest.createName&&<Control type="button" className="list-row family-setup-row family-setup-create" onClick={e=>open({type:'create-branch',name:suggest.createName},e)}><Glyph name="plus"/><span><strong>Create the {suggest.createName} Branch</strong><p>No branch with this name exists yet</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>}
  </section>}
  <section className="card stack family-setup-section"><h2>Find a branch or household</h2>
   <label className="family-setup-search">Search by name<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="A surname or household name" autoComplete="off" enterKeyHint="search"/></label>
   {search?<div className="stack family-setup-results" role="region" aria-live="polite" aria-label="Search results">
    {search.branches.map(branchRow)}{search.households.map(householdRow)}
    {!search.branches.length&&!search.households.length&&<p className="muted">No branches or households match “{query.trim()}”.</p>}
    {search.canCreate&&<Control type="button" className="list-row family-setup-row family-setup-create" onClick={e=>open({type:'create-branch',name:query.trim()},e)}><Glyph name="plus"/><span><strong>Create “{query.trim()}” as a branch</strong><p>Only when the branch doesn’t exist yet</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>}
   </div>:(state.branches||[]).length?<div className="stack family-setup-results"><h3>All branches</h3>{state.branches.map(branchRow)}</div>:<p className="muted">No branches yet. Search for your family name to create the first one.</p>}
  </section>
  {onFinish&&<div className="sheet-footer family-setup-finish"><Button onClick={onFinish}>{finishLabel||'Done'}</Button></div>}
  {task&&<FamilySetupTask task={task} onTask={setTask} onClose={close}/>}
 </section>;
}
function HouseholdSetupRow({household:h,onTask,own=false}){
 const {state}=useApp(),branches=branchesForHousehold(state,h.id),pending=joinPending(state,h.id),member=memberOf(state,h);
 return <article className="family-setup-household">
  <div className="family-setup-household-copy"><Glyph name="home"/><span><strong>{h.name}</strong><p>{memberCount(h)}{branches.length?' · '+branches.map(b=>b.name).join(', '):''}</p></span></div>
  <div className="family-setup-household-actions">
   {own?(canPlaceHousehold(state,h)&&<Button secondary onClick={e=>onTask({type:'place',householdId:h.id},e)}><Glyph name="tree"/>Add to a branch</Button>)
    :member?<span className="family-setup-status">Your household</span>
    :pending?<span className="family-setup-status" role="status">Request sent</span>
    :<Button secondary onClick={e=>onTask({type:'join',householdId:h.id},e)}>Ask to join</Button>}
  </div>
 </article>;
}
// One sheet, one task at a time: close (✕) on the left, confirm (✓) on the right,
// with the same primary action in the sticky footer.
function FamilySetupTask({task,onTask,onClose}){
 const {state}=useApp(),branch=(state.branches||[]).find(b=>b.id===task.branchId),household=(state.households||[]).find(h=>h.id===task.householdId);
 const title={branch:branch?.name||'Branch',join:'Ask to join',place:'Add to a branch',attach:'Add household to branch',detach:'Remove from branch','create-household':'Start a household','create-branch':'Create a branch','rename-branch':'Rename branch','remove-branch':'Remove branch'}[task.type];
 const back=task.back?()=>onTask(task.back):onClose;
 return <Sheet title={title} onClose={onClose}><div className="stack family-setup-task">{
  task.type==='branch'?<BranchDetails branch={branch} onTask={onTask}/>
  :task.type==='join'?<ConfirmStep back={back} onDone={onClose} action={{type:'REQUEST_HOUSEHOLD_JOIN',householdId:task.householdId}} label="Send request" done="Join request sent."
    disabled={!household||memberOf(state,household)||joinPending(state,task.householdId)}>
    <p>Ask to join <strong>{household?.name||'this household'}</strong>?</p><p className="field-help">A head of the household decides. Your other households, profile and private records stay as they are.</p></ConfirmStep>
  :task.type==='place'?<PlaceHousehold household={household} back={back} onTask={onTask}/>
  :task.type==='attach'||task.type==='detach'?<ConfirmStep back={back} onDone={back} label={task.type==='attach'?'Add to branch':'Remove from branch'} danger={task.type==='detach'}
    action={{type:task.type==='attach'?'ATTACH_BRANCH_HOUSEHOLD':'DETACH_BRANCH_HOUSEHOLD',branchId:task.branchId,householdId:task.householdId}} done={task.type==='attach'?'Household added to the branch.':'Household removed from the branch.'}
    disabled={!branch||!canPlaceHousehold(state,household)}>
    <p>{task.type==='attach'?<>Add <strong>{household?.name}</strong> to <strong>{branch?.name}</strong>?</>:<>Remove <strong>{household?.name}</strong> from <strong>{branch?.name}</strong>?</>}</p>
    <p className="field-help">{task.type==='attach'?'Branches group households for browsing. No one joins a household, gains access or becomes a head.':'Only this branch listing changes. The household, its members and its other branches stay as they are.'}</p></ConfirmStep>
  :task.type==='create-household'?<CreateHousehold branchId={task.branchId} back={back} onDone={onClose}/>
  :task.type==='create-branch'?<CreateBranch initialName={task.name||''} householdId={task.householdId} back={back} onDone={onClose} onTask={onTask}/>
  :task.type==='rename-branch'?<RenameBranch branch={branch} back={back}/>
  :task.type==='remove-branch'?<ConfirmStep back={back} onDone={onClose} label="Remove branch" danger action={{type:'REMOVE_BRANCH',branchId:task.branchId}} done="Branch removed." disabled={!branch||branch.householdIds.length>0}>
    <p>Remove <strong>{branch?.name}</strong>?</p><p className="field-help">Only empty branches can be removed. No household or member is affected.</p></ConfirmStep>
  :null}</div></Sheet>;
}
function useSubmit(action,{done,onDone}){
 const {dispatch,setToast}=useApp(),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 async function run(value=action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{if(await dispatch(value)){if(done)setToast(done);onDone?.()}else setError('That wasn’t saved. Check the message above and try again.')}catch(e){setError(e.message||'That wasn’t saved. Try again.')}finally{lock.current=false;setBusy(false)}}
 return {busy,error,run};
}
function ConfirmStep({action,label,done,back,onDone,disabled=false,danger=false,children}){
 const {busy,error,run}=useSubmit(action,{done,onDone}),formId=useSheetForm({label,busy,disabled});
 return <form id={formId} className="stack family-setup-confirm" aria-busy={busy} onSubmit={e=>{e.preventDefault();if(!disabled)run()}}>{children}{error&&<p role="alert">{error}</p>}
  <div className="sheet-footer"><Button secondary disabled={busy} onClick={back}>Cancel</Button><Button type="submit" className={danger?'sheet-danger':''} data-destructive={danger||undefined} disabled={busy||disabled}>{busy?'Saving…':label}</Button></div></form>;
}
function BranchDetails({branch,onTask}){
 const {state}=useApp();if(!branch)return <p role="alert">This branch is no longer available.</p>;
 const self={type:'branch',branchId:branch.id},households=branch.householdIds.map(id=>(state.households||[]).find(h=>h.id===id)).filter(Boolean);
 const placeable=(state.households||[]).filter(h=>memberOf(state,h)&&canPlaceHousehold(state,h)&&!branch.householdIds.includes(h.id)),manager=canManageBranches(state);
 return <>
  <p className="field-help">Households in this branch. Asking to join sends a request a household head approves; nothing happens automatically.</p>
  {households.length?<div className="stack family-setup-branch-households">{households.map(h=><article key={h.id} className="family-setup-household">
   <div className="family-setup-household-copy"><Glyph name="home"/><span><strong>{h.name}</strong><p>{memberCount(h)}</p></span></div>
   <div className="family-setup-household-actions">{memberOf(state,h)?<span className="family-setup-status">Your household</span>:joinPending(state,h.id)?<span className="family-setup-status" role="status">Request sent</span>:<Button secondary onClick={()=>onTask({type:'join',householdId:h.id,back:self})}>Ask to join</Button>}
    {canPlaceHousehold(state,h)&&<Button secondary aria-label={'Remove '+h.name+' from '+branch.name} onClick={()=>onTask({type:'detach',branchId:branch.id,householdId:h.id,back:self})}>Remove</Button>}</div>
  </article>)}</div>:<p className="muted">No households have been added yet.</p>}
  <div className="stack family-setup-branch-options">
   {placeable.map(h=><Control key={h.id} type="button" className="list-row family-setup-row" onClick={()=>onTask({type:'attach',branchId:branch.id,householdId:h.id,back:self})}><Glyph name="plus"/><span><strong>Add {h.name}</strong><p>Your household joins this branch listing</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>)}
   <Control type="button" className="list-row family-setup-row" onClick={()=>onTask({type:'create-household',branchId:branch.id,back:self})}><Glyph name="home"/><span><strong>Start a household in this branch</strong><p>You’ll be its founding head</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>
   {manager&&<Control type="button" className="list-row family-setup-row" onClick={()=>onTask({type:'rename-branch',branchId:branch.id,back:self})}><Glyph name="edit"/><span><strong>Rename branch</strong><p>Family leaders only</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>}
  </div>
  {manager&&!households.length&&<div className="sheet-footer"><Button className="sheet-danger" data-destructive onClick={()=>onTask({type:'remove-branch',branchId:branch.id,back:self})}>Remove empty branch</Button></div>}
 </>;
}
function PlaceHousehold({household,back,onTask}){
 const {state}=useApp(),[query,setQuery]=useState('');if(!household)return <p role="alert">This household is no longer available.</p>;
 const self={type:'place',householdId:household.id},search=query.trim()?familySetupSearch(state,query):{branches:state.branches||[],canCreate:false},choices=search.branches.filter(b=>!b.householdIds.includes(household.id));
 return <>
  <p className="field-help">Choose a branch for <strong>{household.name}</strong>. You’ll confirm before anything changes.</p>
  <label className="family-setup-search">Search branches<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="A family name" autoComplete="off"/></label>
  <div className="stack family-setup-results">{choices.map(b=><Control key={b.id} type="button" className="list-row family-setup-row" onClick={()=>onTask({type:'attach',branchId:b.id,householdId:household.id,back:self})}><Glyph name="tree"/><span><strong>{b.name}</strong><p>{b.householdIds.length} {b.householdIds.length===1?'household':'households'}</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>)}
   {!choices.length&&<p className="muted">{query.trim()?'No other branches match.':'No other branches yet.'}</p>}
   {search.canCreate&&<Control type="button" className="list-row family-setup-row family-setup-create" onClick={()=>onTask({type:'create-branch',name:query.trim(),householdId:household.id,back:self})}><Glyph name="plus"/><span><strong>Create “{query.trim()}” with {household.name}</strong><p>Only when the branch doesn’t exist yet</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>}</div>
  <div className="sheet-footer"><Button secondary onClick={back}>Back</Button></div>
 </>;
}
function CreateHousehold({branchId,back,onDone}){
 const {state}=useApp(),[name,setName]=useState(''),branch=(state.branches||[]).find(b=>b.id===branchId);
 const {busy,error,run}=useSubmit(null,{done:'Household created. You’re its founding head.',onDone}),formId=useSheetForm({label:'Create household',busy,disabled:!name.trim(),dirty:Boolean(name.trim())});
 return <form id={formId} className="gw-form stack" aria-busy={busy} onSubmit={e=>{e.preventDefault();if(name.trim())run({type:'CREATE_HOUSEHOLD',name:name.trim(),...(branch?{branchId:branch.id}:{})})}}>
  <label>Household name<input required maxLength="100" value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="The name your family uses"/></label>
  <p className="field-help family-setup-disclosure"><Glyph name="info"/><span>You’ll be the founding head of this household. Other adults choose whether to join, and additional heads follow the existing approval process.{branch?<> It will be listed in <strong>{branch.name}</strong>.</>:null}</span></p>
  {error&&<p role="alert">{error}</p>}
  <div className="sheet-footer"><Button secondary disabled={busy} onClick={back}>Cancel</Button><Button type="submit" disabled={busy||!name.trim()}>{busy?'Creating…':'Create household'}</Button></div></form>;
}
function CreateBranch({initialName,householdId,back,onDone,onTask}){
 const {state}=useApp(),[name,setName]=useState(initialName),clash=branchMatch(state,name),household=(state.households||[]).find(h=>h.id===householdId);
 const own=(state.households||[]).filter(h=>memberOf(state,h)&&canPlaceHousehold(state,h)),[placeId,setPlaceId]=useState(householdId||'');
 const {busy,error,run}=useSubmit(null,{done:'Branch created.',onDone}),disabled=!name.trim()||Boolean(clash),formId=useSheetForm({label:'Create branch',busy,disabled,dirty:name.trim()!==initialName});
 return <form id={formId} className="gw-form stack" aria-busy={busy} onSubmit={e=>{e.preventDefault();if(!disabled)run({type:'CREATE_BRANCH',name:name.trim(),...(placeId?{householdId:placeId}:{})})}}>
  <label>Branch name<input required maxLength="80" value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="A family name"/></label>
  {clash?<div className="stack"><p role="status">{clash.name} already exists. Choose it instead of creating a duplicate.</p><Button secondary onClick={()=>onTask({type:'branch',branchId:clash.id})}>Open {clash.name}</Button></div>
   :<p className="field-help">Create a branch only when your family line isn’t listed. It doesn’t give anyone access or change any household.</p>}
  {!household&&own.length>0&&<ChoiceControl label="Also add one of your households (optional)" value={placeId} disabled={busy} onChange={setPlaceId} options={[{value:'',label:'Not now'},...own.map(h=>({value:h.id,label:h.name}))]}/>}
  {household&&<p className="field-help"><strong>{household.name}</strong> will be added to this branch.</p>}
  {error&&<p role="alert">{error}</p>}
  <div className="sheet-footer"><Button secondary disabled={busy} onClick={back}>Cancel</Button><Button type="submit" disabled={busy||disabled}>{busy?'Creating…':'Create branch'}</Button></div></form>;
}
function RenameBranch({branch,back}){
 const {state}=useApp(),[name,setName]=useState(branch?.name||''),clash=branchMatch(state,name),taken=clash&&clash.id!==branch?.id;
 const {busy,error,run}=useSubmit(null,{done:'Branch renamed.',onDone:back}),disabled=!branch||!name.trim()||taken||name.trim()===branch.name,formId=useSheetForm({label:'Save name',busy,disabled,dirty:name!==(branch?.name||'')});
 return <form id={formId} className="gw-form stack" aria-busy={busy} onSubmit={e=>{e.preventDefault();if(!disabled)run({type:'RENAME_BRANCH',branchId:branch.id,name:name.trim()})}}>
  <label>Branch name<input required maxLength="80" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
  {taken&&<p role="status">{clash.name} already exists.</p>}{error&&<p role="alert">{error}</p>}
  <div className="sheet-footer"><Button secondary disabled={busy} onClick={back}>Cancel</Button><Button type="submit" disabled={busy||disabled}>{busy?'Saving…':'Save name'}</Button></div></form>;
}
