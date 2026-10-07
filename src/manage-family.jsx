import {leaderPreview} from './leader-preview.js';
import {MerchandiseManager} from './merchandise-manager.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {api} from './live-adapter.js';
import {Button,Control,useApp} from './ui-core.jsx';
import {PersonIdentity} from './person-identity.jsx';
import './manage-family-people.css';
export function ManageFamily({section,embedded=false}){
 const {state,dispatch,openSheet}=useApp(),[remoteItems,setItems]=useState(null),[error,setError]=useState(''),[tab,setTab]=useState(section||'members');
 const preview=state.mode==='preview',accountKey=state.mode+':'+state.selfId,account=useRef(accountKey),request=useRef({sequence:0,controller:null});account.current=accountKey;
 const items=preview?leaderPreview(state):remoteItems?.accountKey===accountKey?remoteItems.items:null;
 const load=()=>{
  if(preview)return Promise.resolve();
  const expectedAccount=accountKey,run=request.current;run.controller?.abort();const sequence=++run.sequence,controller=new AbortController();run.controller=controller;setError('');
  const current=()=>account.current===expectedAccount&&request.current.sequence===sequence&&!controller.signal.aborted;
  return api('/api/manage',{signal:controller.signal}).then(items=>{if(current())setItems({accountKey:expectedAccount,items})}).catch(error=>{if(current())setError(error.message)}).finally(()=>{if(run.sequence===sequence)run.controller=null});
 };
 useEffect(()=>{load();return()=>{request.current.sequence++;request.current.controller?.abort()}},[preview?state:accountKey]);useEffect(()=>{if(section)setTab(section)},[section]);
 const act=async action=>{setError('');const saved=await dispatch(action);if(saved)await load();return saved};
 const options=[(preview||state.capabilities?.manageMembers)&&['members','People'],(preview||state.capabilities?.manageReunion)&&['rsvp','RSVPs'],(preview||state.capabilities?.manageReunion)&&['shirts','Merchandise'],(preview||state.capabilities?.treasurer)&&['fees','Fees']].filter(Boolean);
 const active=options.some(option=>option[0]===tab)?tab:options[0]?.[0];if(!options.length)return <p>You don’t have access to these tools.</p>;
 return <section className="stack">{!embedded&&<><h2>Family organizer</h2><div className="segmented" role="tablist" aria-label="Organizer tools">{options.map(([id,label])=><Control type="button" key={id} role="tab" aria-selected={active===id} onClick={()=>setTab(id)}>{label}</Control>)}</div></>}{error&&<p role="alert">{error}</p>}{!items?(error?<Button secondary onClick={load}>Try again</Button>:<p role="status">Loading family details…</p>):<>
 {active==='members'&&<div className="stack">{!items.members.some(member=>member.status==='pending')&&<p className="muted">No new requests waiting.</p>}{items.members.map(member=><article key={member.id} className="manage-member-row"><PersonIdentity memberId={member.id} fallbackName={member.name}><p className="muted small">{member.email} · {member.status}</p></PersonIdentity>{member.id===state.selfId?<p className="muted small">Your account</p>:<Button secondary onClick={()=>openSheet({type:'leader-member-review',id:member.id,member,accountKey,onSave:act})}>Review membership</Button>}</article>)}</div>}
 {active==='rsvp'&&<div className="card stack"><h3>Household replies</h3>{items.rsvps.map(reply=><div className="manage-report-row" key={reply.member_id||reply.memberId}><PersonIdentity memberId={reply.member_id||reply.memberId} fallbackName={reply.name}><p>{reply.status} · {reply.count} {reply.count===1?'person':'people'}</p></PersonIdentity></div>)}{!items.rsvps.length&&<p>No replies yet.</p>}</div>}
 {active==='shirts'&&<MerchandiseManager items={items} onRefresh={load}/>}
 {active==='fees'&&<div className="card stack"><h3>Payment reports</h3><p className="muted">Check the actual payment service before confirming receipt.</p>{items.fees.map(fee=><div key={fee.id} className="stack manage-report-row"><PersonIdentity memberId={fee.member_id||fee.memberId} fallbackName={fee.name}><p>{fee.status}</p></PersonIdentity>{fee.status==='reported'&&<div className="card-actions"><Button secondary onClick={()=>act({type:'CONFIRM_FEE',id:fee.id,status:'rejected'})}>Not received</Button><Button onClick={()=>act({type:'CONFIRM_FEE',id:fee.id,status:'confirmed'})}>Receipt verified</Button></div>}</div>)}{!items.fees.length&&<p>No payments reported yet.</p>}</div>}
 </>}</section>
}
function readOrganizerRoles(value){
 try{const roles=JSON.parse(value||'[]');return Array.isArray(roles)&&roles.every(role=>['admin','moderator','planner','treasurer'].includes(role))?[...new Set(roles)]:null}catch{return null}
}
// Body only. App owns the single shared Sheet so focus, dismissal, and first-view
// announcements use the existing modal stack, never a second local dialog.
export function MemberReview({member:m,selfId,accountKey,onSave,onSaved}){
 const {state,data}=useApp(),[roles,setRoles]=useState(()=>readOrganizerRoles(m.roles_json)),[post,setPost]=useState(Boolean(m.can_post)),[saving,setSaving]=useState(false),[error,setError]=useState(''),saveLock=useRef(false);
 const allowed=accountKey===state.mode+':'+state.selfId&&(state.mode==='preview'||state.capabilities?.manageMembers)&&m.id!==selfId;
 async function save(status){
  if(saveLock.current||!allowed||roles===null||!onSave)return;
  saveLock.current=true;setSaving(true);setError('');
  try{if(await onSave({type:'APPROVE_MEMBER',id:m.id,status,roles,canPost:post}))onSaved?.();else setError('Membership could not be saved. Your changes are still here; try again.')}
  catch{setError('Membership could not be saved. Your changes are still here; try again.')}
  finally{saveLock.current=false;setSaving(false)}
 }
 return <div className="stack membership-review" aria-busy={saving}><PersonIdentity memberId={m.id} fallbackName={m.name}><p className="muted small">{m.email} · {m.status}</p></PersonIdentity>{!allowed?<p role="alert">This membership can’t be edited with your current account.</p>:<><label className="check-row"><input type="checkbox" disabled={saving} checked={post} onChange={event=>setPost(event.target.checked)}/>Can post updates</label><fieldset className="organizer-role-options"><legend>Organizer roles</legend>{roles===null?<p role="alert">Organizer roles could not be read. Close this review and refresh before editing.</p>:['admin','moderator','planner','treasurer'].map(role=><label key={role} className="check-row"><input type="checkbox" disabled={saving} checked={roles.includes(role)} onChange={event=>setRoles(current=>event.target.checked?[...new Set([...current,role])]:current.filter(value=>value!==role))}/>{role[0].toUpperCase()+role.slice(1)}</label>)}</fieldset>{(error||data?.error)&&<p role="alert">{data?.error||error}</p>}<div className="card-actions"><Button secondary disabled={saving||roles===null} onClick={()=>save('suspended')}>Pause access</Button><Button disabled={saving||roles===null} onClick={()=>save('active')}>{saving?'Saving…':m.status==='active'?'Save membership':'Approve membership'}</Button></div></>}</div>
}
