import React,{useState} from 'react';
import {Button,useApp} from './ui-core.jsx';
import './content-history.css';
// Recoverable cleanup and account requests. Nothing here erases data.
const when=v=>{const t=Date.parse(String(v||'').replace(' ','T')+(String(v).match(/Z|[+-]\d\d:\d\d$/)?'':'Z'));return Number.isFinite(t)?new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):''};
function useAct(){const {dispatch,setToast}=useApp(),[busy,setBusy]=useState(''),[error,setError]=useState('');return {busy,error,async run(key,action,done){if(busy)return false;setBusy(key);setError('');try{const ok=await dispatch(action);if(ok&&done)setToast?.(done);if(!ok)setError('That wasn’t saved. Try again.');return ok}catch(e){setError(e.message);return false}finally{setBusy('')}}}}
// Children's private records: remove with confirmation, restore for 30 days.
export function ChildRecordActions({child}){
 const {openSheet}=useApp(),[confirm,setConfirm]=useState(false),act=useAct();
 return confirm?<div className="content-change" role="group" aria-label={'Remove '+child.name}><strong>Remove {child.name}’s record?</strong><p>Only you can see this record. You can restore it from this page for 30 days.</p><div className="row"><Button secondary disabled={!!act.busy} onClick={()=>setConfirm(false)}>Keep record</Button><Button className="danger-action" data-destructive disabled={!!act.busy} onClick={async()=>{if(await act.run('remove',{type:'REMOVE_DEPENDENT',id:child.id},'Record removed. You can restore it for 30 days.')){setConfirm(false);openSheet(null)}}}>{act.busy?'Removing…':'Remove record'}</Button></div>{act.error&&<p className="form-error" role="alert">{act.error}</p>}</div>:<Button secondary className="danger-action" data-destructive onClick={()=>setConfirm(true)}>Remove {child.name}’s record…</Button>;
}
export function RemovedChildRecords(){
 const {state}=useApp(),act=useAct(),items=state.removedDependents||[];
 if(!items.length)return null;
 return <section className="card stack" aria-label="Removed records"><h3>Removed records</h3><p className="small muted">Restore within 30 days.</p>{items.map(d=><div key={d.id} className="sent-row"><span><strong>{d.name}</strong><small>Removed {when(d.removedAt)}</small></span><Button secondary disabled={!!act.busy} onClick={()=>act.run(d.id,{type:'RESTORE_DEPENDENT',id:d.id},'Record restored.')}>{act.busy===d.id?'Restoring…':'Restore'}</Button></div>)}{act.error&&<p className="form-error" role="alert">{act.error}</p>}</section>;
}
// Archived memorials and households the viewer may restore (shown on Recently removed).
export function ArchivedItems(){
 const {state}=useApp(),act=useAct(),memorials=state.archivedMemorials||[],households=state.archivedHouseholds||[];
 if(!memorials.length&&!households.length)return null;
 return <section className="card stack" aria-label="Archived"><h2>Archived</h2><p className="small muted">Archived memorials and households are hidden from the family until restored.</p>
  {memorials.map(m=><div key={m.id} className="sent-row"><span><strong>{m.name}</strong><small>Memorial · archived {when(m.archivedAt)}</small></span><Button secondary disabled={!!act.busy} onClick={()=>act.run(m.id,{type:'RESTORE_MEMORIAL',id:m.id},'Memorial restored.')}>Restore</Button></div>)}
  {households.map(h=><div key={h.id} className="sent-row"><span><strong>{h.name}</strong><small>Household · archived {when(h.archivedAt)}</small></span><Button secondary disabled={!!act.busy} onClick={()=>act.run(h.id,{type:'RESTORE_HOUSEHOLD',householdId:h.id},'Household restored.')}>Restore</Button></div>)}
  {act.error&&<p className="form-error" role="alert">{act.error}</p>}</section>;
}
export function ArchiveControl({label,action,detail,done,after,startConfirm=false,onCancel}){
 const [confirm,setConfirm]=useState(startConfirm),act=useAct();
 return confirm?<div className="content-change" role="group" aria-label={label}><strong>{label}?</strong><p>{detail}</p><div className="row"><Button secondary disabled={!!act.busy} onClick={()=>{setConfirm(false);onCancel?.()}}>Cancel</Button><Button className="danger-action" data-destructive disabled={!!act.busy} onClick={async()=>{if(await act.run('archive',action,done)){setConfirm(false);after?.()}}}>{act.busy?'Archiving…':label}</Button></div>{act.error&&<p className="form-error" role="alert">{act.error}</p>}</div>:<Button secondary className="danger-action" data-destructive onClick={()=>setConfirm(true)}>{label}…</Button>;
}
// You → Your account data: ask for a copy or a deletion review; admins acknowledge.
export function AccountDataPage(){
 const {state}=useApp(),act=useAct(),[note,setNote]=useState(''),requests=state.accountRequests||[],open=kind=>requests.find(r=>r.kind===kind&&r.status==='open');
 const ask=kind=>act.run(kind,{type:'REQUEST_ACCOUNT_DATA',kind,note:note.trim()},kind==='export'?'Request sent. An admin will prepare your copy.':'Request sent. Nothing is deleted until an admin reviews it with you.').then(ok=>{if(ok)setNote('')});
 return <section className="stack account-data-page"><h1>Your account data</h1>
  <section className="card stack"><h2>How removal works here</h2><p>Removing something hides it and can be undone. Leaving a household or losing membership never deletes your posts, memories or messages; they stay part of the family’s history.</p><p>Account deletion isn’t automatic. Ask for a review and an admin will talk through what happens to shared content before anything is erased.</p></section>
  <section className="card stack"><h2>Make a request</h2>{state.mode==='preview'&&<p className="note">Preview: requests stay on this device.</p>}<label>Note <span className="field-optional">Optional</span><textarea rows="2" maxLength="1000" value={note} disabled={!!act.busy} onChange={e=>setNote(e.target.value)}/></label><div className="row"><Button secondary disabled={!!act.busy||!!open('export')} onClick={()=>ask('export')}>{open('export')?'Copy requested':'Request a copy of my data'}</Button><Button secondary disabled={!!act.busy||!!open('deletion')} onClick={()=>ask('deletion')}>{open('deletion')?'Deletion review requested':'Request a deletion review'}</Button></div>
   {requests.map(r=><div key={r.id} className="sent-row"><span><strong>{r.kind==='export'?'Copy of my data':'Deletion review'}</strong><small>{r.status==='open'?'Waiting for an admin':r.status==='acknowledged'?'Acknowledged by an admin':'Withdrawn'} · {when(r.createdAt)}</small></span>{r.status==='open'&&<Button secondary disabled={!!act.busy} onClick={()=>act.run(r.id,{type:'WITHDRAW_ACCOUNT_REQUEST',id:r.id},'Request withdrawn.')}>Withdraw</Button>}</div>)}
  </section>
  {state.openAccountRequests?.length>0&&<section className="card stack" aria-label="Account requests to review"><h2>Requests to review</h2>{state.openAccountRequests.map(r=><div key={r.id} className="sent-row"><span><strong>{r.name} · {r.kind==='export'?'copy of data':'deletion review'}</strong><small>{r.note||'No note'} · {when(r.createdAt)}</small></span><Button secondary disabled={!!act.busy} onClick={()=>act.run(r.id,{type:'ACKNOWLEDGE_ACCOUNT_REQUEST',id:r.id},'Acknowledged. Follow up with them directly.')}>Acknowledge</Button></div>)}</section>}
  {act.error&&<p className="form-error" role="alert">{act.error}</p>}
 </section>;
}
