import React,{useEffect,useRef,useState} from 'react';
import {Button,useApp} from './ui-core.jsx';
import {api} from './live-adapter.js';
// Block and report controls for private chats. Preview keeps everything on this
// device; live requests never give moderators access to the conversation.
const memberId=m=>m.id||m.memberId;
export function useBlocks(){
 const {state}=useApp(),[blocks,setBlocks]=useState([]),[error,setError]=useState(''),preview=state.mode==='preview',key='gw-preview-blocks:'+state.selfId;
 const load=async()=>{if(preview){try{setBlocks(JSON.parse(localStorage.getItem(key))||[])}catch{setBlocks([])}return}try{setBlocks((await api('/api/conversations/blocks')).blocks.map(b=>b.memberId));setError('')}catch(e){setError(e.message)}};
 useEffect(()=>{load()},[state.mode,state.selfId]);
 async function set(id,blocked){if(preview){const next=blocked?[...new Set([...blocks,id])]:blocks.filter(x=>x!==id);try{localStorage.setItem(key,JSON.stringify(next))}catch{}setBlocks(next);return true}await api('/api/conversations/blocks',{method:'POST',body:JSON.stringify({memberId:id,blocked})});await load();return true}
 return {blocks,error,set};
}
// Conversation details: block or unblock other participants.
// Per-chat notification mute for this participant only.
export function ConversationMute({conversation:c,onChanged}){
 const {state}=useApp(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[shown,setShown]=useState(null);
 if(state.mode!=='live')return null;
 const muted=shown??Boolean(c.muted);
 async function toggle(next){setShown(next);setBusy(true);setError('');try{await api('/api/conversations/'+encodeURIComponent(c.id)+'/notifications',{method:'PUT',body:JSON.stringify({muted:next,expectedAccountId:state.selfId})});onChanged?.()}catch(e){setShown(null);setError(e.message)}finally{setBusy(false)}}
 return <section className="card stack" aria-label="Notifications for this chat"><h2>Notifications</h2><label className="check-row"><input type="checkbox" checked={muted} disabled={busy} onChange={e=>toggle(e.target.checked)}/>Mute this conversation</label><p className="small muted">You’ll still see new messages here and in Messages. Only alerts are silenced.</p>{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
export function ConversationSafety({conversation:c,onChanged}){
 const {state,go}=useApp(),{blocks,error:loadError,set}=useBlocks(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
 const others=(c.members||[]).filter(m=>memberId(m)!==state.selfId&&!['removed'].includes(m.status));
 async function toggle(person,blocked){setBusy(memberId(person));setError('');try{await set(memberId(person),blocked);setConfirm(null);onChanged?.()}catch(e){setError(e.message)}finally{setBusy('')}}
 return <section className="card stack chat-safety" aria-label="Safety"><h2>Safety</h2><p className="small muted">Blocking stops new invitations between you and that person. It doesn’t remove anyone from chats you already share; leave a chat to stop reading it.</p>
  {others.map(p=>{const id=memberId(p),blocked=blocks.includes(id);return <div key={id} className="chat-safety-row"><span>{p.name}</span>{confirm===id?<div className="row"><Button secondary disabled={!!busy} onClick={()=>setConfirm(null)}>Cancel</Button><Button className="danger-action" data-destructive disabled={!!busy} onClick={()=>toggle(p,true)}>{busy===id?'Blocking…':'Block '+p.name}</Button></div>:<Button secondary disabled={!!busy} onClick={()=>blocked?toggle(p,false):setConfirm(id)}>{busy===id?'Saving…':blocked?'Unblock':'Block…'}</Button>}</div>})}
  <Button secondary onClick={()=>go({type:'chat',id:c.id,section:'report'})}>Report messages…</Button>
  {(error||loadError)&&<p className="form-error" role="alert">{error||loadError}</p>}
 </section>;
}
// Choose the messages to report. Only these, not the whole conversation, reach moderators.
export function ReportMessagesBar({conversationId,selected,onCancel,onDone}){
 const {state,setToast}=useApp(),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),requestId=useRef(crypto.randomUUID()),lock=useRef(false);
 async function submit(e){e.preventDefault();if(lock.current||!selected.length||!reason.trim())return;lock.current=true;setBusy(true);setError('');try{if(state.mode!=='preview')await api('/api/conversations/'+encodeURIComponent(conversationId)+'/reports',{method:'POST',body:JSON.stringify({requestId:requestId.current,messageIds:selected,reason:reason.trim()})});setToast?.(state.mode==='preview'?'Preview: report not sent.':'Report sent to the moderators with the messages you chose.');onDone()}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 return <form className="card stack report-messages-bar" aria-label="Report messages" aria-busy={busy} onSubmit={submit}><strong>{selected.length?`${selected.length} ${selected.length===1?'message':'messages'} chosen`:'Choose the messages to report'}</strong><p className="small muted">Moderators see only the messages you choose and your reason. They can’t open this conversation.</p><label>Reason<textarea required maxLength="1000" rows="2" disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} placeholder="What happened?"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="row"><Button secondary disabled={busy} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy||!selected.length||!reason.trim()}>{busy?'Sending…':'Send report'}</Button></div></form>;
}
// Inbox invitation: decline and block the person who sent it.
export function DeclineAndBlock({invitation,onDone}){
 const {set}=useBlocks(),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!invitation.invitedBy)return null;
 async function run(){setBusy(true);setError('');try{await set(invitation.invitedBy,true);onDone?.()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return confirm?<div className="row" role="group" aria-label="Decline and block"><Button secondary disabled={busy} onClick={()=>setConfirm(false)}>Cancel</Button><Button className="danger-action" data-destructive disabled={busy} onClick={run}>{busy?'Blocking…':`Decline and block ${invitation.invitedByName||'sender'}`}</Button>{error&&<p className="form-error" role="alert">{error}</p>}</div>:<Button secondary className="text-button" disabled={busy} onClick={()=>setConfirm(true)}>Decline and block…</Button>;
}
