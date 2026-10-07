import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Control,Glyph,FloatingSurfaceContext,useApp} from './ui-core.jsx';
import {LiquidGlass} from '@sohumsuthar/liquid-glass';
import './page-object-tools.css';

// One out-of-flow tool surface. A compact window gets a protected task; wide
// windows keep a nonmodal inspector. Neither presentation resizes the canvas.
export function PageObjectTools({title,children,onClose,returnFocus,fullHeight=false,protectedTask=false,modalOnCompact=true}){
 const app=useApp(),ref=useRef(null),heading=useId(),closeRef=useRef(onClose),focusRef=useRef(returnFocus);
 const [compact,setCompact]=useState(()=>!matchMedia('(min-width: 1100px)').matches);
 closeRef.current=onClose;
 useEffect(()=>{const query=matchMedia('(min-width: 1100px)'),update=()=>setCompact(!query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const focused=document.activeElement;if(dialog.open)dialog.close();if(compact&&modalOnCompact||protectedTask)dialog.showModal();else dialog.show();if(dialog.contains(focused))focused.focus();return()=>{if(dialog.open)dialog.close()}},[compact,protectedTask,modalOnCompact]);
 useEffect(()=>{const prior=focusRef.current||document.activeElement;return()=>requestAnimationFrame(()=>{if(prior?.isConnected&&(document.activeElement===document.body||ref.current?.contains(document.activeElement)))prior.focus?.({preventScroll:true})})},[]);
 const content=<FloatingSurfaceContext.Provider value={true}>
  <header className="page-object-tools-heading"><h2 id={heading}>{title}</h2><Control type="button" aria-label="Close object tools" onClick={onClose}><Glyph name="close"/></Control></header>
  <div className="page-object-tools-body">{children}</div>
 </FloatingSurfaceContext.Provider>;
 return createPortal(<dialog ref={ref} className={'page-object-tools'+(fullHeight?' is-full-height':'')} aria-labelledby={heading} aria-modal={compact&&modalOnCompact||protectedTask||undefined} onCancel={event=>{event.preventDefault();closeRef.current?.()}} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();closeRef.current?.()}}}>
  {app?.platform==='android'?content:<LiquidGlass lens lensOptions={{bezel:14,refraction:1.05,dispersion:2,radius:16}} className="page-object-glass">{content}</LiquidGlass>}
 </dialog>,document.body);
}
