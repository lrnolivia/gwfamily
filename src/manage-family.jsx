import {isPreviewLeader,isMemberView} from './member-view-model.js';
import {PaymentMethodsManager} from './payment-methods.jsx';
import {reunionQuery,reunionArchived} from './reunion-model.js';
import {membershipStatus} from './membership-model.js';
import {leaderPreview} from './leader-preview.js';
import {MerchandiseManager} from './merchandise-manager.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {api} from './live-adapter.js';
import {Button,Control,useApp,useSheetForm} from './ui-core.jsx';
import {PersonIdentity} from './person-identity.jsx';
import './manage-family-people.css';
import {PeopleFilters} from './people-filters.jsx';
import {emptyPeopleFilters,filterDirectoryMembers,managementDirectoryMembers} from './people-directory-model.js';
export function ManageFamily({section,embedded=false}){
 const {state,dispatch,openSheet}=useApp(),[remoteItems,setItems]=useState(null),[error,setError]=useState(''),[tab,setTab]=useState(section||'members'),[peopleFilters,setPeopleFilters]=useState({...emptyPeopleFilters});
 const preview=state.mode==='preview',accountKey=state.mode+':'+state.selfId,scopeKey=accountKey+':'+state.selectedReunionId,account=useRef(accountKey),request=useRef({sequence:0,controller:null});account.current=scopeKey;
 const items=preview?leaderPreview(state):remoteItems?.scopeKey===scopeKey?remoteItems.items:null;
 const load=()=>{
  if(preview)return Promise.resolve();
  const expectedAccount=scopeKey,run=request.current;run.controller?.abort();const sequence=++run.sequence,controller=new AbortController();run.controller=controller;setError('');
  const current=()=>account.current===expectedAccount&&request.current.sequence===sequence&&!controller.signal.aborted;
  return api(reunionQuery('/api/manage',state.selectedReunionId),{signal:controller.signal}).then(items=>{if(current())setItems({scopeKey:expectedAccount,items})}).catch(error=>{if(current())setError(error.message)}).finally(()=>{if(run.sequence===sequence)run.controller=null});
 };
 useEffect(()=>{load();return()=>{request.current.sequence++;request.current.controller?.abort()}},[preview?state:scopeKey]);useEffect(()=>{if(section)setTab(section)},[section]);
 const act=async action=>{setError('');const saved=await dispatch(action);if(saved)await load();return saved};
 const options=[(isPreviewLeader(state)||state.capabilities?.manageMembers)&&['members','People'],(isPreviewLeader(state)||state.capabilities?.manageReunion)&&['rsvp','RSVPs'],(isPreviewLeader(state)||state.capabilities?.manageReunion)&&['shirts','Merchandise'],(isPreviewLeader(state)||state.capabilities?.treasurer||state.capabilities?.manageReunion)&&['fees','Fees']].filter(Boolean);
 const active=options.some(option=>option[0]===tab)?tab:options[0]?.[0];if(!options.length)return <p>You don’t have access to these tools.</p>;
 return <section className="stack">{!embedded&&<><h2>Family organizer</h2><div className="segmented" role="tablist" aria-label="Organizer tools">{options.map(([id,label])=><Control type="button" key={id} role="tab" aria-selected={active===id} onClick={()=>setTab(id)}>{label}</Control>)}</div></>}{error&&<p role="alert">{error}</p>}{!items?(error?<Button secondary onClick={load}>Try again</Button>:<p role="status">Loading family details…</p>):<>
 {active==='members'&&<div className="stack"><PeopleFilters state={state} value={peopleFilters} onChange={setPeopleFilters} management resultCount={filterDirectoryMembers(state,managementDirectoryMembers(state,items.members),peopleFilters).length}/>{!items.members.some(member=>member.status==='pending')&&<p className="muted">No new requests waiting.</p>}{filterDirectoryMembers(state,managementDirectoryMembers(state,items.members),peopleFilters).map(member=><article key={member.id} className="manage-member-row"><PersonIdentity memberId={member.id} fallbackName={member.name}><p className="muted small">{member.email} · {membershipStatus(member)}</p>{member.invited_by_name&&<p className="muted small">Invited by {member.invited_by_name}</p>}</PersonIdentity>{member.id===state.selfId?<p className="muted small">Your account</p>:<Button secondary onClick={()=>openSheet({type:'leader-member-review',id:member.id,member,accountKey,onSave:act})}>Review membership</Button>}</article>)}{!filterDirectoryMembers(state,managementDirectoryMembers(state,items.members),peopleFilters).length&&<p className="muted">No people match these filters.</p>}</div>}
 {active==='rsvp'&&<div className="card stack"><h3>Household replies</h3>{items.rsvps.map(reply=><div className="manage-report-row" key={reply.member_id||reply.memberId}><PersonIdentity memberId={reply.member_id||reply.memberId} fallbackName={reply.name}><p>{reply.status} · {reply.count} {reply.count===1?'person':'people'}</p></PersonIdentity></div>)}{!items.rsvps.length&&<p>No replies yet.</p>}</div>}
 {active==='shirts'&&<MerchandiseManager items={items} onRefresh={load}/>}
 {active==='fees'&&<><PaymentMethodsManager key={scopeKey}/>{(isPreviewLeader(state)||state.capabilities?.treasurer)&&<div className="card stack"><h3>Payment reports</h3><p className="muted">Check the actual payment service before confirming receipt.</p>{items.fees.map(fee=><div key={fee.id} className="stack manage-report-row"><PersonIdentity memberId={fee.member_id||fee.memberId} fallbackName={fee.name}><p>{fee.status}</p></PersonIdentity>{fee.status==='reported'&&!reunionArchived(state)&&<div className="card-actions"><Button secondary onClick={()=>act({type:'CONFIRM_FEE',id:fee.id,status:'rejected'})}>Not received</Button><Button onClick={()=>act({type:'CONFIRM_FEE',id:fee.id,status:'confirmed'})}>Receipt verified</Button></div>}</div>)}{!items.fees.length&&<p>No payments reported yet.</p>}</div>}</>}
 </>}</section>
}
function readOrganizerRoles(value){
 try{const roles=JSON.parse(value||'[]');return Array.isArray(roles)&&roles.every(role=>['admin','moderator','planner','treasurer'].includes(role))?[...new Set(roles)]:null}catch{return null}
}
// Body only. App owns the single shared Sheet so focus, dismissal, and first-view
// announcements use the existing modal stack, never a second local dialog.
export function MemberReview({member:m,selfId,accountKey,onSave,onSaved}){
 const {state,data}=useApp(),[roles,setRoles]=useState(()=>readOrganizerRoles(m.roles_json)),[post,setPost]=useState(Boolean(m.can_post)),[saving,setSaving]=useState(false),[error,setError]=useState(''),[confirming,setConfirming]=useState(null),saveLock=useRef(false),cancelButton=useRef(null),removalTrigger=useRef(null),previousConfirmation=useRef(null);
 useEffect(()=>{if(confirming)cancelButton.current?.focus();else if(previousConfirmation.current)removalTrigger.current?.focus();previousConfirmation.current=confirming},[confirming]);
 const removed=membershipStatus(m)==='removed';
 const allowed=accountKey===state.mode+':'+state.selfId&&(isPreviewLeader(state)||state.capabilities?.manageMembers)&&m.id!==selfId;
 const formId=useSheetForm({label:!removed&&!confirming&&m.status==='active'?'Save membership':null,busy:saving,disabled:!allowed||roles===null||saving,dirty:!removed&&(JSON.stringify(roles)!==JSON.stringify(readOrganizerRoles(m.roles_json))||post!==Boolean(m.can_post))});
 async function save(status){
  if(saveLock.current||!allowed||removed||confirming||roles===null||!onSave)return;
  saveLock.current=true;setSaving(true);setError('');
  try{if(await onSave({type:'APPROVE_MEMBER',id:m.id,status,roles,canPost:post}))onSaved?.();else setError('Membership could not be saved. Your changes are still here; try again.')}
  catch{setError('Membership could not be saved. Your changes are still here; try again.')}
  finally{saveLock.current=false;setSaving(false)}
 }
 async function changeMembership(type){
  if(saveLock.current||!allowed||!onSave||confirming!==type)return;
  saveLock.current=true;setSaving(true);setError('');
  try{
   const saved=await onSave({type,id:m.id,confirmedMemberId:m.id,expectedAccountId:state.selfId,expectedRevision:m.membership_revision??0});
   if(saved)onSaved?.();else setError('Membership could not be changed. Review the message and try again.');
  }catch{setError('Membership could not be changed. Review the message and try again.')}
  finally{saveLock.current=false;setSaving(false)}
 }
 return <form id={formId} className="stack membership-review" aria-busy={saving} onSubmit={event=>{event.preventDefault();if(!removed&&!confirming&&m.status==='active')void save('active')}}>
  <PersonIdentity memberId={m.id} fallbackName={m.name}><p className="muted small">{m.email} · {membershipStatus(m)}</p></PersonIdentity>
  {!allowed?<p role="alert">This membership can’t be edited with your current account.</p>:confirming?<section className="stack membership-confirmation" aria-label={confirming==='REMOVE_MEMBER'?'Confirm member removal':'Confirm membership restoration'}>
   <h3>{confirming==='REMOVE_MEMBER'?`Remove ${m.name}?`:`Restore ${m.name} for review?`}</h3>
   <p>{m.name} ({m.email})</p>
   {confirming==='REMOVE_MEMBER'?<><p>This removes their family membership and blocks access to private family posts, messages, and details. Their sign-in account, existing posts, messages, orders, and payment records will be kept.</p><p>An admin can restore this person for review later. Restoration requires a separate approval before they regain family access. No removal email is sent.</p>{state.mode==='preview'&&<p className="muted small">This changes local sample data only. Reset preview to undo all sample changes.</p>}</>:<p>This brings the membership back as pending. Family access, posting permission, and organizer roles stay off until an admin separately approves them.</p>}
   <div className="card-actions"><Button ref={cancelButton} secondary disabled={saving} onClick={()=>{setConfirming(null);setError('')}}>Cancel</Button><Button className={confirming==='REMOVE_MEMBER'?'membership-remove':''} disabled={saving} onClick={()=>changeMembership(confirming)}>{saving?'Saving…':confirming==='REMOVE_MEMBER'?'Confirm removal':'Restore for review'}</Button></div>
  </section>:removed?<section className="stack"><p>This membership has been removed. Their account and historical records are preserved.</p><Button ref={removalTrigger} secondary disabled={saving} onClick={()=>setConfirming('RESTORE_MEMBER')}>Restore membership</Button></section>:<>
   <label className="check-row"><input type="checkbox" disabled={saving} checked={post} onChange={event=>setPost(event.target.checked)}/>Can post updates</label>
   <fieldset className="organizer-role-options"><legend>Organizer roles</legend>{roles===null?<p role="alert">Organizer roles could not be read. Close this review and refresh before editing.</p>:['admin','moderator','planner','treasurer'].map(role=><label key={role} className="check-row"><input type="checkbox" disabled={saving} checked={roles.includes(role)} onChange={event=>setRoles(current=>event.target.checked?[...new Set([...current,role])]:current.filter(value=>value!==role))}/>{role[0].toUpperCase()+role.slice(1)}</label>)}</fieldset>
   <div className="card-actions"><Button secondary disabled={saving||roles===null} onClick={()=>save('suspended')}>Pause access</Button><Button disabled={saving||roles===null} onClick={()=>save('active')}>{saving?'Saving…':m.status==='active'?'Save membership':'Approve membership'}</Button></div>
   <div className="membership-removal"><Button ref={removalTrigger} secondary className="membership-remove" disabled={saving} onClick={()=>{setConfirming('REMOVE_MEMBER');setError('')}}>Remove member</Button><p className="muted small">Revoke family access while keeping their account and history. You’ll confirm the person first.</p></div>
  </>}
  {(error||data?.error)&&<p role="alert">{data?.error||error}</p>}
 </form>
}
