import React,{useRef,useState} from 'react';
import {Button,useApp} from './ui-core.jsx';
import {MemberPicker} from './member-picker.jsx';
import {isPreviewLeader} from './member-view-model.js';
// Founding-head handover, its answer, and scoped admin recovery for one household.
// Nothing changes until the named member accepts.
export function FounderSuccession({household:h}){
 const {state,dispatch,setToast}=useApp(),[memberId,setMemberId]=useState(''),[reason,setReason]=useState(''),[confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const self=state.selfId,pending=(state.founderTransfers||[]).find(t=>t.householdId===h.id),name=id=>state.members.find(m=>m.id===id)?.name||'A family member';
 const admin=state.mode==='preview'?isPreviewLeader(state):state.capabilities?.manageMembers===true,recovery=(state.householdRecovery||[]).find(r=>r.householdId===h.id);
 async function run(action,done){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{if(await dispatch(action)){setConfirming(false);setMemberId('');setReason('');if(done)setToast?.(done)}else setError('That wasn’t saved. Try again.')}catch(e){setError(e.message||'That wasn’t saved. Try again.')}finally{lock.current=false;setBusy(false)}}
 const candidates=m=>h.memberIds.includes(m.id)&&m.id!==self&&m.id!==h.founderId;
 let body=null;
 if(pending){
  if(pending.toId===self)body=<><p>{pending.kind==='recovery'?`A family admin asked you to become the founding head of ${h.name}.`:`${name(pending.fromId)} offered you the founding head role for ${h.name}.`}</p>{pending.reason&&<p className="field-help">Reason: {pending.reason}</p>}<p className="field-help">The founding head approves new account heads and keeps the household managed. Accepting makes you a head; nobody else’s role changes.</p><div className="row"><Button secondary disabled={busy} onClick={()=>run({type:'RESPOND_HOUSEHOLD_FOUNDER',id:pending.id,accept:false},'Handover declined.')}>Decline</Button><Button disabled={busy} onClick={()=>run({type:'RESPOND_HOUSEHOLD_FOUNDER',id:pending.id,accept:true},'You are now the founding head.')}>{busy?'Saving…':'Accept founding role'}</Button></div></>;
  else if(pending.initiatedBy===self||admin&&pending.kind==='recovery')body=<><p>Waiting for {name(pending.toId)} to accept the founding role.</p><Button secondary disabled={busy} onClick={()=>run({type:'CANCEL_HOUSEHOLD_FOUNDER',id:pending.id},'Handover cancelled.')}>Cancel handover</Button></>;
  else if(h.headIds?.includes(self))body=<p className="field-help">A founding-head handover to {name(pending.toId)} is waiting for their answer.</p>;
 }else if(h.founderId===self){
  body=<><p className="field-help">Hand the founding role to another adult in this household, for example before you leave it. They must accept; you stay a head.</p><MemberPicker label="New founding head" value={memberId} disabled={busy} onChange={id=>{setMemberId(id);setConfirming(false)}} filter={candidates}/>{memberId&&(confirming?<div className="row"><Button secondary disabled={busy} onClick={()=>setConfirming(false)}>Cancel</Button><Button disabled={busy} onClick={()=>run({type:'OFFER_HOUSEHOLD_FOUNDER',householdId:h.id,memberId},'Handover offered. Nothing changes until they accept.')}>{busy?'Saving…':`Offer to ${name(memberId)}`}</Button></div>:<Button secondary disabled={busy} onClick={()=>setConfirming(true)}>Hand over founding role…</Button>)}</>;
 }else if(admin&&recovery){
  body=<><p>{recovery.reason==='no-active-head'?'This household has no active head.':'This household’s founding head is no longer an active member.'} You can ask an adult in the household to take over. They must accept; you won’t become a head.</p><MemberPicker label="Ask to take over" value={memberId} disabled={busy} onChange={setMemberId} filter={m=>h.memberIds.includes(m.id)&&m.id!==h.founderId}/><label>Reason<textarea maxLength="300" rows="2" disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why this household needs a new founding head"/></label><Button disabled={busy||!memberId||reason.trim().length<3} onClick={()=>run({type:'RECOVER_HOUSEHOLD',householdId:h.id,memberId,reason:reason.trim()},'Recovery request sent for their answer.')}>{busy?'Saving…':'Ask to take over'}</Button></>;
 }
 if(!body)return null;
 return <section className="card stack household-succession" aria-label="Founding head" aria-busy={busy}><h2>Founding head</h2>{body}{error&&<p role="alert">{error}</p>}</section>;
}
