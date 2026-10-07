import React,{useEffect,useLayoutEffect,useState} from 'react';
import {Control,Glyph,useApp} from './ui-core.jsx';
import {usePageContent} from './page-content.jsx';
import {pageIdentity,backUnread} from './page-navigation-model.js';
import {conversationTitle} from './messaging-model.js';
import {mainPages} from './navigation.js';
import './page-navigation.css';
export function useCompactChrome(){
 const [compact,setCompact]=useState(()=>window.scrollY>96);
 useEffect(()=>{let frame;const update=()=>{frame=null;setCompact(window.scrollY>96)},schedule=()=>{if(frame==null)frame=requestAnimationFrame(update)};window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(frame!=null)cancelAnimationFrame(frame)}},[]);
 return compact;
}
export function PageNavigationHeader({previous,compact}){
 // This component mounts with the real header after sign-in/bootstrap. The
 // app's initial render may have no header to measure yet.
 useLayoutEffect(()=>{
  const header=document.querySelector('.app>.app-header'),app=header?.parentElement;
  if(!header||!app)return;
  const measure=()=>app.style.setProperty('--gw-app-header-offset',Math.ceil(header.getBoundingClientRect().height)+'px');
  measure();const observer=new ResizeObserver(measure);observer.observe(header);
  return()=>{observer.disconnect();app.style.removeProperty('--gw-app-header-offset')};
 },[]);
 const {route,state,messaging,goBack}=useApp(),page=usePageContent(route.type),main=mainPages.has(route.type);
 const chat=route.type==='chat'?messaging.conversations?.find(item=>item.id===route.id):null;
 const title=page.content?.text?.heading||(chat?conversationTitle(chat,state.selfId):route.type==='chat'?'Conversation':pageIdentity(route,state)),destination=previous||{type:'home'},unread=backUnread(previous,messaging),label='Back to '+pageIdentity(destination,state)+(unread?', '+unread+' unread':'');
 return <div className={'page-back-row page-navigation-header '+(main?'is-main-page':'')} data-compact={compact||undefined}>
 {!main&&<Control type="button" className="page-back" aria-label={label} onClick={goBack}><Glyph name="arrow"/>{unread>0&&<span className="page-back-unread" aria-hidden="true">{unread>99?'99+':unread}</span>}<span className="page-back-label">Back</span></Control>}
 <span className="page-compact-title" aria-hidden="true">{title}</span></div>;
}
