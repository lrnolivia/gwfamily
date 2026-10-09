import {isPreviewLeader,isMemberView} from './member-view-model.js';
import React,{useEffect,useId,useRef,useState} from 'react';
import {Button,Control,Glyph,Sheet,useApp,useSheetForm} from './ui-core.jsx';
import {ChoiceControl} from './choice-control.jsx';
import {api,isAmbiguousCommandError} from './live-adapter.js';
import {Birthdays} from './family.jsx';
import {localDate} from './member-model.js';
import {FAMILY_EVENT_TYPES,normalizeFamilyEvent,canEditFamilyEvent,familyCalendarEvents,familyEventWhen} from './family-calendar-model.js';
import './family-calendar.css';
const PREVIEW_KEY='gw-family-calendar-preview:v1';
const labels={gathering:'Gatherings',graduation:'Graduations',wedding:'Weddings',anniversary:'Anniversaries',milestone:'Milestones',other:'Other events'};
// One event has one type, so the form reads in the singular; filters stay plural.
const formLabels={gathering:'Gathering',graduation:'Graduation',wedding:'Wedding',anniversary:'Anniversary',milestone:'Milestone',other:'Other'};
const eventTypeOptions=FAMILY_EVENT_TYPES.map(value=>({value,label:formLabels[value]}));
const filterOptions=[{value:'all',label:'All events'},...FAMILY_EVENT_TYPES.map(value=>({value,label:labels[value]})),{value:'birthday',label:'Birthdays'}];
const previewRead=()=>{try{const value=JSON.parse(localStorage.getItem(PREVIEW_KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}};
export function FamilyCalendar(){
 const {state,data,setToast,route}=useApp(),scope=state.mode+':'+state.selfId,identity=useRef(scope);identity.current=scope;
 const [snapshot,setSnapshot]=useState({scope:'',events:[],loading:true,error:''}),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[retry,setRetry]=useState(0),[remove,setRemove]=useState(null),lock=useRef(false),request=useRef(null),trigger=useRef(null);
 useEffect(()=>{const controller=new AbortController();setSnapshot({scope,events:[],loading:true,error:''});setEditor(null);setRemove(null);setBusy(false);setUncertain(false);request.current=null;
  if(state.mode==='preview')setSnapshot({scope,events:previewRead(),loading:false,error:''});
  else api('/api/family-calendar',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted&&identity.current===scope){if(result.accountId!==state.selfId)throw Error('Your account changed. Reload GW.');setSnapshot({scope,events:result.events||[],loading:false,error:''})}}).catch(error=>{if(!controller.signal.aborted&&identity.current===scope)setSnapshot({scope,events:[],loading:false,error:error.message})});
  return()=>controller.abort();
 },[scope,retry]);
 const view=snapshot.scope===scope?snapshot:{events:[],loading:true,error:''},actor={id:state.selfId,roles:[],isLeader:state.mode==='preview'?isPreviewLeader(state):!isMemberView(state)&&(state.capabilities?.moderate===true||state.capabilities?.leaderTools===true)},today=localDate();
 // Birthdays enter only from the existing opt-in month/day DTO. No private
 // profile birthday, birth year or guardian-only child record is read here.
 const birthdayEvents=(state.birthdayCalendar||[]).map(m=>({id:'birthday-'+m.memberId,title:m.name+'’s birthday',eventType:'birthday',recurrence:'yearly',monthDay:m.monthDay,originYear:null,allDay:true,timezone:'UTC'}));
 const events=familyCalendarEvents([...(filter==='birthday'?[]:view.events),...(filter==='all'||filter==='birthday'?birthdayEvents:[])],{today,type:filter,query});
 const selected=route.id&&view.events.find(e=>e.id===route.id),close=()=>{if(lock.current)return;setEditor(null);setRemove(null);request.current=null;setUncertain(false);requestAnimationFrame(()=>trigger.current?.isConnected&&trigger.current.focus())};
 async function commit(input){
  if(lock.current)return false;lock.current=true;setBusy(true);const expected=scope,finish=data.beginPending?.();
  try{
   let result;
   if(state.mode==='preview'){
    const current=previewRead(),existing=current.find(e=>e.id===(input.event?.id||input.id));
    if(existing&&!canEditFamilyEvent(actor,existing))throw Error('You can edit only your own events.');
    if((existing?.revision||0)!==input.expectedRevision)throw Error('The event changed. Refresh before saving.');
    if(input.action==='delete')result=current.map(e=>e.id===input.id?{...e,deletedAt:new Date().toISOString(),revision:e.revision+1}:e);
    else{const event={...normalizeFamilyEvent(input.event),id:existing?.id||crypto.randomUUID(),createdBy:existing?.createdBy||state.selfId,revision:(existing?.revision||0)+1};result=existing?current.map(e=>e.id===event.id?event:e):[...current,event]}
    localStorage.setItem(PREVIEW_KEY,JSON.stringify(result));
   }else{
    const body={...input,expectedAccountId:state.selfId},signature=JSON.stringify(body);
    if(request.current?.signature!==signature)request.current={signature,body:{...body,requestId:crypto.randomUUID()}};
    await api('/api/family-calendar',{method:'POST',body:JSON.stringify(request.current.body)});
    const refreshed=await api('/api/family-calendar');if(refreshed.accountId!==state.selfId)throw Error('Your account changed. Reload GW.');result=refreshed.events;
   }
   if(identity.current!==expected)return false;setSnapshot({scope,events:result,loading:false,error:''});setUncertain(false);request.current=null;setEditor(null);setRemove(null);setToast(input.action==='delete'?'Event removed.':'Family event saved.');requestAnimationFrame(()=>trigger.current?.isConnected&&trigger.current.focus());return true;
  }catch(error){if(identity.current===expected){setUncertain(isAmbiguousCommandError(error));throw error}return false}
  finally{lock.current=false;if(identity.current===expected)setBusy(false);finish?.()}
 }
 return <section className="stack family-calendar-page">
  <header className="family-calendar-header"><div><h1>Family Calendar</h1><p className="muted">Family gatherings, milestones, and shared celebrations. Reunion activities stay in Reunion’s Schedule.</p></div><Button className="family-calendar-add" icon="plus" disabled={isMemberView(state)||view.loading||busy||!!view.error} onClick={event=>{trigger.current=event.currentTarget;setEditor({event:null})}}>Add family event</Button></header>
  {state.mode==='preview'&&<p className="note family-calendar-preview">Isolated preview events stay on this device. No family alerts are sent.</p>}
  <FamilyCalendarFilters filter={filter} onFilter={setFilter} query={query} onQuery={setQuery}/>
  {view.loading?<p role="status">Loading family events…</p>:view.error?<div className="stack"><p role="alert">{view.error}</p><Button secondary onClick={()=>setRetry(n=>n+1)}>Try again</Button></div>:<>
   {route.id&&!selected&&<p role="status">That event may have been removed. Its moderation explanation remains in Notifications.</p>}
   <p className="family-calendar-results muted" role="status">{events.length} {filter!=='all'||query?'matching ':''}{events.length===1?'event':'events'}</p>
   <ol className="calendar-agenda family-calendar-agenda">{events.map(event=><li className="card family-calendar-event" id={'family-event-'+event.id} key={event.id}>
    <h2>{event.title}</h2><p className="family-calendar-when"><Glyph name="calendar"/><span>{familyEventWhen(event,today)}</span></p>
    {event.location&&<p className="family-calendar-location"><Glyph name="pin"/><span>{event.location}</span></p>}
    {event.description&&<p className="calendar-description">{event.description}</p>}
    {event.createdBy&&!isMemberView(state)&&canEditFamilyEvent(actor,event)&&<div className="row family-calendar-event-actions"><Button secondary onClick={e=>{trigger.current=e.currentTarget;setEditor({event})}}>Edit</Button><Button secondary onClick={e=>{trigger.current=e.currentTarget;setRemove({event})}}>Delete</Button></div>}
   </li>)}</ol>
   {!events.length&&<p className="muted family-calendar-empty">No matching family events yet.</p>}
  </>}
  <Birthdays/>
  {editor&&<Sheet title={editor.event?'Edit family event':'Add family event'} busy={busy} onClose={close}><FamilyEventForm key={editor.event?.id||'new'} event={editor.event} moderated={!!editor.event&&editor.event.createdBy!==state.selfId} busy={busy} uncertain={uncertain} onSave={commit} onClose={close}/></Sheet>}
  {remove&&<Sheet title="Delete family event?" busy={busy} onClose={close}><DeleteFamilyEvent event={remove.event} moderated={remove.event.createdBy!==state.selfId} busy={busy} onSave={commit} onClose={close}/></Sheet>}
 </section>;
}
// A short fixed list should not ask the family to type a search, then Change or
// Done. Keep the current selection visible and reveal the native radio choices
// in the same filter platter. Escape returns focus without clearing the filter.
function FamilyCalendarFilters({filter,onFilter,query,onQuery}){
 const [open,setOpen]=useState(false),id=useId(),trigger=useRef(null),search=useRef(null),selected=filterOptions.find(option=>option.value===filter)?.label||'All events';
 const reset=()=>{onFilter('all');onQuery('');search.current?.focus()};
 return <div className="family-calendar-toolbar filter-platter" onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus()}}}>
  <div className="family-calendar-search-row"><label className="family-calendar-search">Find an event<input ref={search} type="search" placeholder="Search event titles" value={query} onChange={event=>onQuery(event.target.value)}/></label>
   <div className="family-calendar-type-filter"><span id={id+'-label'}>Event type</span><Control ref={trigger} type="button" className="family-calendar-filter-trigger" aria-labelledby={id+'-label '+id+'-selection'} aria-expanded={open} aria-controls={id+'-options'} onClick={()=>setOpen(value=>!value)}><span id={id+'-selection'}>{selected}</span><Glyph name="arrow"/></Control></div>
  </div>
  <div id={id+'-options'} className="family-calendar-type-options" hidden={!open} inert={!open}><ChoiceControl label="Show event types" variant="chips" className="family-calendar-type-choices" value={filter} onChange={onFilter} options={filterOptions}/></div>
  {(filter!=='all'||query)&&<Control type="button" className="family-calendar-clear" onClick={reset}><Glyph name="close"/><span>Clear filters</span></Control>}
 </div>;
}

function FamilyEventForm({event,moderated,busy,uncertain,onSave,onClose}){
 const [value,setValue]=useState(event||{title:'',description:'',location:'',eventType:'gathering',recurrence:'none',allDay:true,startDate:'',endDate:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',startTime:'',endTime:'',monthDay:'',originYear:''}),[reason,setReason]=useState(''),[error,setError]=useState('');
 const formId=useSheetForm({label:event?'Save family event':'Publish family event',busy});
 const change=(key,next)=>setValue(v=>({...v,[key]:next}));
 async function submit(e){e.preventDefault();setError('');try{normalizeFamilyEvent(value);await onSave({action:'save',event:value,reason,expectedRevision:event?.revision||0})}catch(e){setError(e.message)}}
 return <form id={formId} className="gw-form family-event-form" onSubmit={submit}><p>Published events are visible to approved family members. This does not change any profile birthday or reunion plan.</p><label>Event title<input required maxLength={160} value={value.title} disabled={busy} onChange={e=>change('title',e.target.value)}/></label><div className="family-event-type-platter"><ChoiceControl label="Event type" variant="chips" className="family-event-type-choices" value={value.eventType} disabled={busy} options={eventTypeOptions} onChange={v=>change('eventType',v)}/></div><div className="family-event-platter"><ChoiceControl label="Repeats" value={value.recurrence} disabled={busy} options={[{value:'none',label:'One time'},{value:'yearly',label:'Yearly'}]} onChange={v=>change('recurrence',v)}/>{value.recurrence!=='yearly'&&<label className="check-row"><input type="checkbox" checked={value.allDay} disabled={busy} onChange={e=>change('allDay',e.target.checked)}/>All-day event</label>}</div>{value.recurrence==='yearly'?<><label>Month and day (MM-DD)<input required pattern="[0-9]{2}-[0-9]{2}" placeholder="06-19" value={value.monthDay||''} disabled={busy} onChange={e=>change('monthDay',e.target.value)}/></label><label>Original year · If known<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={value.originYear??''} disabled={busy} onChange={e=>change('originYear',e.target.value)}/></label><p className="field-help">Leave an unknown original year blank. February 29 recurs in leap years.</p></>:<><div className="field-row"><label>Start date<input type="date" required value={value.startDate||''} disabled={busy} onChange={e=>change('startDate',e.target.value)}/></label><label>End date · Optional<input type="date" value={value.endDate||''} disabled={busy} onChange={e=>change('endDate',e.target.value)}/></label></div>{!value.allDay&&<><div className="field-row"><label>Start time<input type="time" required value={value.startTime||''} disabled={busy} onChange={e=>change('startTime',e.target.value)}/></label><label>End time<input type="time" required value={value.endTime||''} disabled={busy} onChange={e=>change('endTime',e.target.value)}/></label></div><div className="field-row">{[['startOccurrence','Start clock-change occurrence'],['endOccurrence','End clock-change occurrence']].map(([key,label])=><ChoiceControl key={key} label={label} value={value[key]||''} disabled={busy} options={[{value:'',label:'Ask if repeated'},{value:'earlier',label:'First occurrence'},{value:'later',label:'Second occurrence'}]} onChange={v=>change(key,v)}/>)}</div></>}</>}<label>Time zone<input required maxLength={100} value={value.timezone} disabled={busy} onChange={e=>change('timezone',e.target.value)}/></label><label>Location · Optional<input maxLength={300} value={value.location} disabled={busy} onChange={e=>change('location',e.target.value)}/></label><label>Details · Optional<textarea rows={4} maxLength={4000} value={value.description} disabled={busy} onChange={e=>change('description',e.target.value)}/></label>{moderated&&<label>Explain the change to the contributor<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>}{error&&<p role="alert">{error}</p>}{uncertain&&<p role="alert">The earlier save is unconfirmed. Retry the same details to resolve it safely.</p>}<div className="sheet-footer family-event-footer"><Button secondary disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Saving…':event?'Save family event':'Publish family event'}</Button></div></form>;
}
function DeleteFamilyEvent({event,moderated,busy,onSave,onClose}){
 const [reason,setReason]=useState(''),[error,setError]=useState(''),formId=useSheetForm({label:'Delete event',busy});
 return <form id={formId} className="gw-form family-event-delete-form" onSubmit={async e=>{e.preventDefault();setError('');try{await onSave({action:'delete',id:event.id,expectedRevision:event.revision,reason})}catch(e){setError(e.message)}}}><p>Remove “{event.title}” from the family calendar?</p>{moderated&&<label>Explain the removal to the contributor<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>}{error&&<p role="alert">{error}</p>}<div className="sheet-footer family-event-footer"><Button secondary disabled={busy} onClick={onClose}>Keep event</Button><Button type="submit" disabled={busy}>{busy?'Removing…':'Delete event'}</Button></div></form>;
}
