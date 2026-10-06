import React,{useLayoutEffect,useRef} from 'react';
import './toast.css';

export function ToastHost({toast,dismissToast,pauseToast,resumeToast}){
 const surface=useRef(null),focusOrigin=useRef(null),ownsFocus=useRef(false);
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
   <p className="gw-toast-message">{toast.message}</p>
   <button type="button" className="gw-toast-dismiss" aria-label="Dismiss notification" onClick={dismiss}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
  </div></div>}
 </>;
}
