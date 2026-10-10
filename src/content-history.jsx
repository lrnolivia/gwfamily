import React,{useEffect,useRef,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
const formatTime=ms=>new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
import {api} from './live-adapter.js';
import {canRemoveMemory,removalLabel} from './content-history-model.js';
import {isPreviewLeader} from './member-view-model.js';
import './content-history.css';

// "Show older" for the feed, Memories or one conversation. Live only: preview
// sample data is a single page.
export function LoadOlder({kind,postId,label}){
 const {state,data}=useApp(),[busy,setBusy]=useState(false),lock=useRef(false);
 const cursor=kind==='posts'?state.postsCursor:kind==='memories'?state.memoriesCursor:state.commentHistory?.[postId]?.cursor;
 if(state.mode!=='live'||!cursor||!data?.loadHistory)return null;
 const more=kind==='comments'?Math.max(0,(state.commentHistory?.[postId]?.total||0)-(state.comments?.[postId]?.length||0)):0;
 async function load(){if(lock.current)return;lock.current=true;setBusy(true);try{await data.loadHistory(kind,postId)}finally{lock.current=false;setBusy(false)}}
 return <div className={'load-older load-older-'+kind}><Button secondary disabled={busy} aria-busy={busy} onClick={load}>{busy?'Loading…':label||(kind==='comments'?`Show earlier comments${more?` (${more})`:''}`:kind==='memories'?'Show older memories':'Show older posts')}</Button></div>;
}

// Loads one post or memory that is older than the loaded pages (Saved, links).
export function useDeepLoad(kind,id,present){
 const {state,data}=useApp(),[status,setStatus]=useState(present?'ready':'idle');
 useEffect(()=>{if(present){setStatus('ready');return}if(state.mode!=='live'||!id||!data?.loadContent){setStatus('missing');return}let alive=true;setStatus('loading');data.loadContent(kind==='post'?'/api/posts/'+encodeURIComponent(id)+'/bundle':'/api/memories/'+encodeURIComponent(id)).then(page=>{if(alive)setStatus(page?'ready':'missing')});return()=>{alive=false}},[kind,id,present,state.mode,state.selfId]);
 return status;
}
export {SavedPage} from './saved.jsx';
// Live search also asks the server so older history that is not loaded still matches.
export function useHistorySearch(query){
 const {state}=useApp(),[result,setResult]=useState(null),text=String(query||'').trim(),live=state.mode==='live'&&text.length>=2&&text.length<=80&&Boolean(state.memoriesCursor||state.postsCursor);
 useEffect(()=>{if(!live){setResult(null);return}let alive=true;setResult(previous=>({...(previous||{}),loading:true}));const timer=setTimeout(()=>{api('/api/search?q='+encodeURIComponent(text)).then(value=>{if(alive)setResult({...value,loading:false})}).catch(()=>{if(alive)setResult(null)})},300);return()=>{alive=false;clearTimeout(timer)}},[live,text,state.selfId]);
 return live?result:null;
}

// Remove a memory with its feed post and conversation; Undo stays available.
export function RemoveMemoryControl({memory}){
 const {state,dispatch,openSheet,go,setToast}=useApp(),[confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 if(!canRemoveMemory(state,memory))return null;
 async function remove(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{if(await dispatch({type:'DELETE_MEMORY',id:memory.id})){openSheet(null);go({type:'family',tab:'memories'});setToast?.({message:'Memory removed. You can restore it from Recently removed for 30 days.',actions:[{label:'Recently removed',run:()=>go({type:'removed'})}]})}else setError('The memory could not be removed. Try again.')}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 if(!confirming)return <Button secondary className="danger-action" data-destructive onClick={()=>setConfirming(true)}>Remove memory</Button>;
 return <div className="content-change" role="group" aria-label="Remove memory" aria-busy={busy}><strong>Remove this memory?</strong><p>The memory, its feed post and its conversation are hidden from the family. Saved and featured references pause. {memory.authorId===state.selfId?'You':'A moderator'} can restore it for 30 days.</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="row"><Button secondary disabled={busy} onClick={()=>setConfirming(false)}>Keep memory</Button><Button className="danger-action" data-destructive disabled={busy} onClick={remove}>{busy?'Removing…':'Remove memory'}</Button></div></div>;
}

// Recently removed: what this person (or, for moderators, anyone) removed, with Restore.
export function RemovedItemsPage(){
 const {state,dispatch,go}=useApp(),[live,setLive]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[refresh,setRefresh]=useState(0),preview=state.mode==='preview';
 useEffect(()=>{if(preview)return;let alive=true;setError('');api('/api/content/removed').then(value=>{if(alive)setLive(value)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[preview,refresh,state.selfId]);
 const items=preview?(state.previewRemoved||[]):live?.removed||null;
 async function restore(item){if(busy)return;setBusy(item.id);setError('');try{if(await dispatch({type:'RESTORE_CONTENT',id:item.id})){setRefresh(n=>n+1);if(item.kind==='memory')go({type:'memory',id:item.targetId})}else setError('That item could not be restored. Try again.')}catch(e){setError(e.message)}finally{setBusy('')}}
 return <section className="stack removed-page"><h1>Recently removed</h1><p className="muted">Removed posts, comments and memories stay recoverable for {live?.days||30} days. Files are kept until then.</p>{preview&&<p className="note">Preview: removals and restores stay on this device.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {items===null&&!error?<p role="status">Loading…</p>:items?.length?<ul className="card removed-list">{items.map(item=><li key={item.id} className="removed-row"><Glyph name={item.kind==='memory'?'image':'chat'}/><span><strong>{removalLabel(item.kind)}{item.source==='report'?' · removed after a report':item.source==='moderator'?' · removed by a moderator':''}</strong><small>{item.excerpt||'No preview available'} · {formatTime(item.removedAt)}</small></span><Button secondary disabled={!!busy} onClick={()=>restore(item)}>{busy===item.id?'Restoring…':'Restore'}</Button></li>)}</ul>:<p className="muted">Nothing has been removed recently.</p>}
 </section>;
}

// Reports reach moderators through You → Reports. Content context is shown only
// as far as the moderator may already read it; removal asks for confirmation.
export function ModerationQueue(){
 const {state,dispatch,go}=useApp(),preview=state.mode==='preview',allowed=preview?isPreviewLeader(state):state.capabilities?.moderate===true;
 const [status,setStatus]=useState('open'),[live,setLive]=useState(null),[error,setError]=useState(''),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{if(preview||!allowed)return;let alive=true;setLive(null);setError('');api('/api/moderation/reports?status='+status).then(value=>{if(alive)setLive(value.reports)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[preview,allowed,status,refresh,state.selfId]);
 if(!allowed)return <section className="stack"><h1>Reports</h1><p>This page is available to family moderators.</p><Button secondary onClick={()=>go({type:'you'})}>Back to You</Button></section>;
 const previewReports=(state.reports||[]).filter(r=>status==='open'?r.status==='open':r.status!=='open').map(r=>{const post=state.posts.find(p=>p.id===r.targetId),memory=state.memories.find(m=>m.id===r.targetId);return {...r,reporterName:'Preview member',target:{kind:memory?'memory':post?'post':'comment',excerpt:memory?.title||post?.text||'',route:memory?{type:'memory',id:memory.id}:post?{type:'post',id:post.id}:null}}});
 const reports=preview?previewReports:live;
 async function resolve(report,decision){if(busy)return;setBusy(report.id);setError('');try{if(await dispatch({type:'MODERATE',id:report.id,targetId:report.targetId,status:decision,...(report.kind==='message'?{kind:'message'}:{})})){setConfirm(null);setRefresh(n=>n+1)}else setError('The decision could not be saved. Refresh and try again.')}catch(e){setError(e.message)}finally{setBusy('')}}
 return <section className="stack moderation-page"><h1>Reports</h1><p className="muted">Reports from family members. Removing an item hides it for everyone and can be undone from Recently removed.</p>
  <div className="segmented" role="tablist" aria-label="Report status"><Control role="tab" aria-selected={status==='open'} onClick={()=>setStatus('open')}>Open</Control><Control role="tab" aria-selected={status==='resolved'} onClick={()=>setStatus('resolved')}>Resolved</Control></div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {reports===null&&!error?<p role="status">Loading reports…</p>:reports?.length?reports.map(r=><article key={r.id} className="card stack report-card"><div><strong>{removalLabel(r.target?.kind)}{r.target?.authorName?' by '+r.target.authorName:''}</strong><p className="small muted">Reported by {r.reporterName}{r.createdAt?' · '+formatTime(r.createdAt):''}</p></div>
   <blockquote className={'report-excerpt'+(r.kind==='message'?' is-messages':'')}>{r.target?.private?'Private group content. Only the reporter’s description is shown.':r.target?.excerpt||'No preview available'}</blockquote>{r.status==='open'&&r.target?.removed&&<p className="small muted">This item is already removed.</p>}<p className="report-reason"><span className="form-label">Reason</span><span>{r.reason}</span></p>
   {r.status==='open'&&r.kind==='message'?<div className="row"><p className="small muted">Private chat: only the chosen messages are shown. Follow up with the people involved.</p><Button secondary disabled={!!busy} onClick={()=>resolve(r,'dismissed')}>Dismiss</Button><Button disabled={!!busy} onClick={()=>resolve(r,'handled')}>{busy===r.id?'Saving…':'Mark handled'}</Button></div>:r.status==='open'?confirm===r.id?<div className="content-change" role="group" aria-label="Confirm removal"><strong>Remove this {removalLabel(r.target?.kind).toLowerCase()}?</strong><p>It will be hidden for everyone. You can restore it from Recently removed.</p><div className="row"><Button secondary disabled={!!busy} onClick={()=>setConfirm(null)}>Cancel</Button><Button className="danger-action" data-destructive disabled={!!busy} onClick={()=>resolve(r,'removed')}>{busy===r.id?'Removing…':'Remove item'}</Button></div></div>
    :<div className="row">{r.target?.route&&<Button secondary onClick={()=>go(r.target.route)}>Open in context</Button>}<Button secondary disabled={!!busy} onClick={()=>resolve(r,'dismissed')}>{busy===r.id?'Saving…':'Dismiss'}</Button>{!r.target?.removed&&<Button className="danger-action" data-destructive disabled={!!busy} onClick={()=>setConfirm(r.id)}>Remove item…</Button>}</div>
    :<p className="small muted">{r.status==='removed'?'Removed':r.status==='handled'?'Handled':'Dismissed'}{r.resolvedAt?' · '+formatTime(r.resolvedAt):''}</p>}
  </article>):<p className="muted">{status==='open'?'No open reports.':'No resolved reports yet.'}</p>}
 </section>;
}
