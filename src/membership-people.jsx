import React,{useEffect,useRef,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {PersonIdentity} from './person-identity.jsx';
import {PeopleFilters} from './people-filters.jsx';
import {emptyPeopleFilters,filterDirectoryMembers,managementDirectoryMembers} from './people-directory-model.js';
import {membershipStatus} from './membership-model.js';
import {isPreviewLeader,isMemberView} from './member-view-model.js';
import {routeHash} from './navigation.js';
import {approvePendingMemberships,capturePendingMemberships,membershipRoles} from './membership-queue-model.js';
import './membership-people.css';
const views={active:'Active Members',pending:'Waiting for approval',suspended:'Paused memberships',removed:'Removed memberships'};
export function MembershipPeople({members,onSave,readMembers}){
 const {state,data,route,go,openSheet}=useApp(),[localView,setLocalView]=useState('active'),[filters,setFilters]=useState({...emptyPeopleFilters}),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[result,setResult]=useState(null),[needsRefresh,setNeedsRefresh]=useState(false);
 const accountKey=state.mode+':'+state.selfId,scopeKey=accountKey+':'+state.selectedReunionId,allowed=!isMemberView(state)&&(isPreviewLeader(state)||state.capabilities?.manageMembers),latest=useRef(null),lock=useRef(false),alive=useRef(true);
 latest.current={scopeKey,allowed};useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const currentScope=()=>alive.current&&latest.current?.allowed?latest.current.scopeKey:null;
 const view=route?.type==='leader-tools'&&route.section==='members'?(views[route.tab]?route.tab:'active'):localView;
 const all=managementDirectoryMembers(state,members),counts=Object.fromEntries(Object.keys(views).map(status=>[status,all.filter(member=>membershipStatus(member)===status).length]));
 const visible=filterDirectoryMembers(state,all.filter(member=>membershipStatus(member)===view),{...filters,status:'all'}),pending=capturePendingMemberships(all,state.selfId),pendingIds=new Set(pending.map(member=>member.id)),selectedIds=selected.filter(id=>pendingIds.has(id)),visiblePending=visible.filter(member=>member.id!==state.selfId&&membershipStatus(member)==='pending');
 const allVisibleSelected=visiblePending.length>0&&visiblePending.every(member=>selectedIds.includes(member.id));
 useEffect(()=>{setSelected([]);setResult(null);setNeedsRefresh(false);setFilters({...emptyPeopleFilters})},[scopeKey,view]);
 const navigate=(event,status)=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(busy)return;if(route?.type==='leader-tools')go({type:'leader-tools',section:'members',...(status==='active'?{}:{tab:status})});else setLocalView(status)};
 const review=member=>openSheet({type:'leader-member-review',id:member.id,member,accountKey,onSave});
 async function approve(ids=null){
  if(lock.current||!allowed||data?.pending||needsRefresh)return;
  const targets=capturePendingMemberships(all,state.selfId,ids);if(!targets.length)return;
  lock.current=true;setBusy(true);setResult(null);setProgress({done:0,total:targets.length});
  try{const outcome=await approvePendingMemberships({targets,accountId:state.selfId,scopeKey,currentScope,dispatch:onSave,readMembers,onProgress:(done,total)=>{if(currentScope()===scopeKey)setProgress({done,total})}});if(currentScope()===scopeKey){setResult(outcome);setSelected([]);setNeedsRefresh(!outcome.verified)}}
  finally{lock.current=false;if(alive.current){setBusy(false);setProgress(null)}}
 }
 async function refresh(){if(lock.current)return;lock.current=true;setBusy(true);try{const fresh=await readMembers();if(currentScope()===scopeKey&&Array.isArray(fresh)){setNeedsRefresh(false);setResult(null)}}catch{if(currentScope()===scopeKey)setNeedsRefresh(true)}finally{lock.current=false;if(alive.current)setBusy(false)}}
 if(!allowed)return <p>You don’t have access to member management.</p>;
 return <div className="membership-management" aria-busy={busy}>
  <aside className="membership-tasks" aria-label="Member management"><h2>Member management</h2><nav aria-label="Membership lists">{Object.entries(views).map(([status,label])=><a key={status} href={routeHash({type:'leader-tools',section:'members',...(status==='active'?{}:{tab:status})})} aria-current={view===status?'page':undefined} aria-disabled={busy||undefined} onClick={event=>navigate(event,status)}><span>{label}</span><span className="membership-count">{counts[status]}</span><Glyph name="arrow"/></a>)}</nav></aside>
  <section className="membership-list stack" aria-label={views[view]}>
   <header className="membership-list-heading"><div><h2>{views[view]}</h2><p className="muted">{view==='active'?'Manage family access and organizer roles.':view==='pending'?'Review the people waiting to join your family.':view==='removed'?'Restore a membership for review before approving access.':'Manage memberships with paused family access.'}</p></div><Button secondary disabled={busy||data?.pending} onClick={refresh}>Refresh list</Button></header>
   <PeopleFilters state={state} value={filters} onChange={setFilters} resultCount={visible.length}/>
   {view==='pending'&&<div className="membership-approval-tools"><div><p><strong>{selectedIds.length} selected</strong> · {counts.pending} waiting</p><p className="small muted">Approve Selected uses your selection. Approve All includes all {pending.length} currently waiting, including people hidden by filters. Existing organizer roles stay unchanged.</p></div><div className="card-actions"><Button disabled={busy||data?.pending||needsRefresh||!selectedIds.length} onClick={()=>approve(selectedIds)}>Approve Selected ({selectedIds.length})</Button><Button secondary disabled={busy||data?.pending||needsRefresh||!pending.length} onClick={()=>approve()}>Approve All ({pending.length})</Button></div>{visiblePending.length>0&&<label className="check-row membership-select-all"><input type="checkbox" disabled={busy||needsRefresh} checked={allVisibleSelected} onChange={event=>setSelected(event.target.checked?[...new Set([...selectedIds,...visiblePending.map(member=>member.id)])]:selectedIds.filter(id=>!visiblePending.some(member=>member.id===id)))}/>Select all {visiblePending.length} shown</label>}</div>}
   {progress&&<p role="status">Approving memberships: {progress.done} of {progress.total} saved…</p>}
   {result&&<p className="membership-result" role={result.stopped||!result.verified?'alert':'status'}>{result.verified?`${result.active.length} of ${result.requested} memberships now active. ${result.waiting.length} still waiting.${result.changed.length?` ${result.changed.length} changed and need review.`:''}`:`${result.acknowledged.length} of ${result.requested} approvals saved; the latest list is not verified.`} {result.reason}</p>}
   {needsRefresh&&<p role="alert">Refresh the list to check the latest status before approving again.</p>}
   <div className="membership-rows">{visible.map(member=><article key={member.id} className="manage-member-row membership-person-row">{view==='pending'&&member.id!==state.selfId&&<label className="membership-person-select"><input type="checkbox" aria-label={`Select ${member.name}`} checked={selectedIds.includes(member.id)} disabled={busy||needsRefresh} onChange={event=>setSelected(event.target.checked?[...new Set([...selectedIds,member.id])]:selectedIds.filter(id=>id!==member.id))}/></label>}<PersonIdentity memberId={member.id} fallbackName={member.name}><p className="muted small">{member.email} · {membershipStatus(member)}</p>{member.invited_by_name&&<p className="muted small">Invited by {member.invited_by_name}</p>}</PersonIdentity>{member.id===state.selfId?<p className="muted small">Your account</p>:<div className="membership-row-actions"><Button secondary disabled={busy||data?.pending} onClick={()=>review(member)}>{view==='pending'?'Review Membership':'Manage Membership'}</Button>{view==='pending'&&<Button disabled={busy||data?.pending||needsRefresh||membershipRoles(member.roles_json)===null} onClick={()=>approve([member.id])}>Approve</Button>}</div>}</article>)}</div>
   {!visible.length&&<p className="membership-empty muted">{counts[view]?'No people match these filters.':view==='pending'?'No requests are waiting for approval.':view==='active'?'No active memberships yet.':`No ${view==='suspended'?'paused':'removed'} memberships.`}</p>}
  </section>
 </div>;
}
