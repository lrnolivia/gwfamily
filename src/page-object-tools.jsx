import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Control,Glyph,FloatingSurfaceContext} from './ui-core.jsx';
import './page-object-tools.css';
import {useFloatingPanelPosition} from './floating-panel-position.js';

// One out-of-flow tool surface. A compact window gets a protected task; wide
// windows keep a nonmodal inspector. Neither presentation resizes the canvas.
export function PageObjectTools({title,children,onClose,returnFocus,fullHeight=false,protectedTask=false,modalOnCompact=true,onDone,busy=false,doneDisabled=false}){
 const ref=useRef(null),heading=useId(),closeRef=useRef(onClose),focusRef=useRef(returnFocus);
 const floating=useFloatingPanelPosition(ref);
 const [compact,setCompact]=useState(()=>!matchMedia('(min-width: 701px)').matches);
 closeRef.current=busy?null:onClose;
 useEffect(()=>{const query=matchMedia('(min-width: 701px)'),update=()=>setCompact(!query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const focused=document.activeElement;if(dialog.open)dialog.close();if(compact&&modalOnCompact||protectedTask)dialog.showModal();else dialog.show();if(dialog.contains(focused))focused.focus();return()=>{if(dialog.open)dialog.close()}},[compact,protectedTask,modalOnCompact]);
 useEffect(()=>{const prior=focusRef.current||document.activeElement;return()=>requestAnimationFrame(()=>{if(prior?.isConnected&&(document.activeElement===document.body||ref.current?.contains(document.activeElement)))prior.focus?.({preventScroll:true})})},[]);
 const content=<FloatingSurfaceContext.Provider value={true}>
  <header className="page-object-tools-heading" {...floating.handle}><Control type="button" className="page-object-complete" aria-label="Done editing" title="Done" disabled={busy||doneDisabled} onClick={onDone||onClose}><Glyph name="check"/></Control><h2 id={heading}>{title}</h2><Control type="button" aria-label="Close object tools" title="Exit" disabled={busy} onClick={onClose}><Glyph name="close"/></Control></header>
  <div className="page-object-tools-body">{children}</div>
 </FloatingSurfaceContext.Provider>;
 return createPortal(<dialog ref={ref} className={'page-object-tools'+(fullHeight?' is-full-height':'')} style={floating.style} aria-labelledby={heading} aria-modal={compact&&modalOnCompact||protectedTask||undefined} onCancel={event=>{event.preventDefault();closeRef.current?.()}} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();closeRef.current?.()}}}>
  {content}
 </dialog>,document.body);
}
