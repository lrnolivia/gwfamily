import React,{useEffect,useState} from 'react';
import {api} from './live-adapter.js';
import {Button,useApp} from './ui-core.jsx';
import './content-history.css';
// What you sent: email invitations (revoke or resend safely) and household
// requests you can withdraw. Tokens are never shown here.
const label={pending:'Waiting',accepted:'Accepted',expired:'Expired',revoked:'Revoked',ended:'Ended'};
const day=ms=>Number.isFinite(ms)?new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
export function SentInvitations(){
 const {state,dispatch,setToast}=useApp(),preview=state.mode==='preview',[list,setList]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[confirm,setConfirm]=useState(null),[refresh,setRefresh]=useState(0);
 useEffect(()=>{if(preview){setList({invitations:[],requests:[]});return}let alive=true;setError('');api('/api/invitations/sent').then(v=>{if(alive)setList(v)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[preview,refresh,state.selfId]);
 async function act(path,item,done){setBusy(item.kind+item.id);setError('');try{await api('/api/invitations/'+path,{method:'POST',body:JSON.stringify({kind:item.kind,id:item.id,expectedAccountId:state.selfId})});setConfirm(null);setToast?.(done);setRefresh(n=>n+1)}catch(e){setError(e.message)}finally{setBusy('')}}
 async function withdraw(r){setBusy('request'+r.id);setError('');try{if(await dispatch({type:'CANCEL_HOUSEHOLD_REQUEST',id:r.id})){setToast?.('Request withdrawn.');setRefresh(n=>n+1)}}catch(e){setError(e.message)}finally{setBusy('')}}
 const invitations=list?.invitations||[],requests=list?.requests||[];
 return <section className="card stack sent-invitations" aria-label="Sent invitations"><h2>Sent invitations</h2>
  {preview&&<p className="note">Preview: no real invitations are sent or listed.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {list===null&&!error?<p role="status">Loading…</p>:!invitations.length&&!requests.length?<p className="muted">Email invitations and household requests you send appear here.</p>:null}
  {invitations.map(i=><div key={i.kind+i.id} className="sent-row"><span><strong>{i.email}</strong><small>{i.kind==='household'?i.householdName+' · ':'Family · '}{label[i.status]||i.status} · sent {day(i.createdAt)}{i.status==='pending'?' · ends '+day(i.expiresAt):''}</small></span>
   {confirm===i.kind+i.id?<div className="row"><Button secondary disabled={!!busy} onClick={()=>setConfirm(null)}>Keep</Button><Button className="danger-action" data-destructive disabled={!!busy} onClick={()=>act('revoke',i,'Invitation revoked. The link no longer works.')}>Revoke</Button></div>
   :<div className="row">{i.status==='pending'&&<Button secondary disabled={!!busy} onClick={()=>setConfirm(i.kind+i.id)}>Revoke…</Button>}{i.status!=='accepted'&&<Button secondary disabled={!!busy||!i.canResend} title={i.canResend?undefined:'You can resend a few minutes after sending'} onClick={()=>act('resend',i,'A new invitation was sent. The previous link stopped working.')}>{busy===i.kind+i.id?'Sending…':'Resend'}</Button>}</div>}</div>)}
  {requests.map(r=><div key={r.id} className="sent-row"><span><strong>{r.requestKind==='join'?'Asked to join '+r.householdName:r.requestKind==='invite'?'Invited '+(r.recipientName||'a family member')+' to '+r.householdName:'Head request for '+r.householdName}</strong><small>Waiting · sent {day(r.createdAt)}</small></span><Button secondary disabled={!!busy} onClick={()=>withdraw(r)}>{busy==='request'+r.id?'Withdrawing…':'Withdraw'}</Button></div>)}
 </section>;
}
