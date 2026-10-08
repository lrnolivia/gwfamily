import {contactRows} from './profile-contact-model.js';
import {ContactGlyph} from './profile-contact-actions.jsx';
import {EditableText} from './page-content.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {api} from './live-adapter.js';
import {Button,useApp} from './ui-core.jsx';
import {PersonIdentity} from './person-identity.jsx';
import {directoryView} from './contact-directory-state.js';
export function ContactDirectory(){
 const {state}=useApp(),account=state.mode+':'+state.selfId,generation=useRef(0),[retry,setRetry]=useState(0),[result,setResult]=useState({account:'',status:'loading',cards:null,error:''});
 useEffect(()=>{
  const current=++generation.current,controller=new AbortController();
  if(state.mode!=='live'){setResult({account,status:'idle',cards:null,error:''});return()=>{generation.current++;controller.abort()}}
  setResult({account,status:'loading',cards:null,error:''});
  api('/api/directory',{signal:controller.signal}).then(response=>{
   if(!Array.isArray(response?.cards))throw Error('Contact cards could not be read. Try again.');
   if(generation.current===current&&!controller.signal.aborted)setResult({account,status:'ready',cards:response.cards,error:''});
  }).catch(error=>{if(generation.current===current&&!controller.signal.aborted)setResult({account,status:'error',cards:null,error:error.message||'Contact cards could not be loaded.'})});
  return()=>{generation.current++;controller.abort()};
 },[state.mode,state.selfId,state.contact,retry]);
 if(state.mode!=='live')return null;
 const view=directoryView(result,account,state.selfId);
 return <section className="card stack" aria-busy={view.status==='loading'}><EditableText page="people" field="sharedTitle" as="h3">Shared with you</EditableText>{view.status==='loading'?<p role="status">Loading shared contact cards…</p>:view.status==='error'?<div className="stack"><p role="alert">{view.error}</p><p className="small muted">We couldn’t check which cards are shared with you.</p><Button secondary onClick={()=>setRetry(value=>value+1)}>Try again</Button></div>:<>{view.cards.map(card=><div className="contact-entry" key={card.memberId}><PersonIdentity memberId={card.memberId} fallbackName={card.name} displayName={card.name} photo={card.photo} photoFrame={card.photoFrame}/><div className="shared-contact-actions">{contactRows(card,{apple:/iPhone|iPad|Macintosh/.test(navigator.userAgent)}).map(row=><a className="shared-contact-badge" key={row.key} href={row.href} aria-label={row.label+': '+row.value} title={row.value} {...(/^https:/.test(row.href)?{target:'_blank',rel:'noreferrer'}:{})}><ContactGlyph name={row.glyph}/><span>{row.value}</span></a>)}</div></div>)}{view.empty&&<EditableText page="people" field="sharedEmptyBody" as="p" className="muted">No family contact cards have been shared with you yet.</EditableText>}</>}</section>;
}
