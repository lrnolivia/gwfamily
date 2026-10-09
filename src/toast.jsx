import React,{useLayoutEffect,useRef,useState} from 'react';
import './toast.css';

export function ToastHost({toast,dismissToast,pauseToast,resumeToast}){
 const surface=useRef(null),focusOrigin=useRef(null),ownsFocus=useRef(false);
 const current=useRef(toast?.id);current.current=toast?.id;const lock=useRef(false),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 useLayoutEffect(()=>{lock.current=false;setBusy(false);setActionError('')},[toast?.id]);
 async function act(action){
  if(lock.current||typeof action.run!=='function')return;const id=toast.id;lock.current=true;setBusy(true);setActionError('');pauseToast('focus',id);
  try{const result=await action.run();if(current.current===id){if(result!==false){restoreFocus();dismissToast(id)}else setActionError('This action is unavailable. Open Notifications to review the update.')}}
  catch{if(current.current===id)setActionError('This action could not finish. Open Notifications to try again.')}
  finally{if(current.current===id){lock.current=false;setBusy(false);if(!surface.current?.contains(document.activeElement))resumeToast('focus',id)}}
 }
 function restoreFocus(node=surface.current){
  const documentRef=globalThis.document,origin=focusOrigin.current;
  if(ownsFocus.current&&origin?.isConnected&&(node?.contains(documentRef?.activeElement)||documentRef?.activeElement===documentRef?.body))origin.focus({preventScroll:true});
  ownsFocus.current=false;
 }
 useLayoutEffect(()=>{const node=surface.current;return()=>{restoreFocus(node);focusOrigin.current=null;};},[toast?.id]);
 function dismiss(){restoreFocus();dismissToast(toast.id);}
 return <>
  <div className="gw-toast-announcement" role="status" aria-live="polite" aria-atomic="true">{toast?.kind==='status'&&<span key={toast.id}>{toast.message}</span>}</div>
  <div className="gw-toast-announcement" role="alert" aria-live="assertive" aria-atomic="true">{toast?.kind==='error'&&<span key={toast.id}>{toast.message}</span>}</div>
  {toast&&<div className="gw-toast-host"><div ref={surface} className="gw-toast" data-kind={toast.kind}
   onPointerEnter={()=>pauseToast('hover',toast.id)} onPointerLeave={()=>resumeToast('hover',toast.id)}
   onFocus={event=>{if(!event.currentTarget.contains(event.relatedTarget)){focusOrigin.current=event.relatedTarget;ownsFocus.current=true;pauseToast('focus',toast.id);}}}
   onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){ownsFocus.current=false;resumeToast('focus',toast.id);}}}
   onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}}}>
   <div className="gw-toast-copy"><p className="gw-toast-message">{toast.message}</p>{toast.actions?.length>0&&<div className="gw-toast-actions">{toast.actions.map((action,index)=><button key={index} type="button" disabled={busy} aria-busy={busy} className="gw-toast-action" onClick={()=>act(action)}>{action.label}</button>)}</div>}{actionError&&<p role="alert" className="small">{actionError}</p>}</div>
   <button type="button" className="gw-toast-dismiss" aria-label="Dismiss notification" onClick={dismiss}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
  </div></div>}
 </>;
}
