import React,{useEffect,useLayoutEffect,useState,useRef} from 'react';
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
  const measure=()=>{const height=Math.ceil(header.getBoundingClientRect().height)+'px';app.style.setProperty('--gw-app-header-offset',height);document.documentElement.style.setProperty('--gw-app-header-offset',height)};
  measure();const observer=new ResizeObserver(measure);observer.observe(header);
  return()=>{observer.disconnect();app.style.removeProperty('--gw-app-header-offset');document.documentElement.style.removeProperty('--gw-app-header-offset')};
 },[]);
 const {route,state,messaging,goBack}=useApp(),page=usePageContent(route.type),main=mainPages.has(route.type),showBack=!main||Boolean(previous),[heading,setHeading]=useState(null),headerRef=useRef(null),[position,setPosition]=useState(null);
 useLayoutEffect(()=>{
  const root=document.getElementById('main');if(!root||!showBack){setHeading(null);return;}
  const update=()=>{const next=root.querySelector('h1');setHeading(current=>current===next?current:next)};
  update();const observer=new MutationObserver(update);observer.observe(root,{childList:true,subtree:true});return()=>observer.disconnect();
 },[route.type,route.id,showBack]);
 useLayoutEffect(()=>{
  if(!heading||compact){setPosition(null);return;}
  const original=heading.getAttribute('data-page-back-anchor');heading.setAttribute('data-page-back-anchor','true');
  let frame;
  const measure=()=>{frame=null;const host=headerRef.current;if(!host||!heading.isConnected)return;const titleBox=heading.getBoundingClientRect(),hostBox=host.getBoundingClientRect(),next={top:titleBox.top-hostBox.top+(titleBox.height-44)/2,left:titleBox.left-hostBox.left};setPosition(current=>current&&Math.abs(current.top-next.top)<.5&&Math.abs(current.left-next.left)<.5?current:next)};
  const schedule=()=>{if(frame==null)frame=requestAnimationFrame(measure)};
  measure();const observer=new ResizeObserver(schedule);observer.observe(heading);observer.observe(document.getElementById('main'));window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  return()=>{observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(frame!=null)cancelAnimationFrame(frame);if(original===null)heading.removeAttribute('data-page-back-anchor');else heading.setAttribute('data-page-back-anchor',original)};
 },[heading,compact]);
 const chat=route.type==='chat'?messaging.conversations?.find(item=>item.id===route.id):null;
 const title=page.content?.text?.heading||(chat?conversationTitle(chat,state.selfId):route.type==='chat'?'Conversation':pageIdentity(route,state)),destination=previous||{type:'home'},unread=backUnread(previous,messaging),label='Back to '+pageIdentity(destination,state)+(unread?', '+unread+' unread':'');
 const back=className=><Control type="button" className={'page-back '+className} aria-label={label} onClick={goBack}><svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>{unread>0&&<span className="page-back-unread" aria-hidden="true">{unread>99?'99+':unread}</span>}</Control>;
 const inline=showBack&&heading&&!compact;
 return <div ref={headerRef} style={inline&&position?{'--gw-inline-back-top':position.top+'px','--gw-inline-back-left':position.left+'px'}:undefined} className={'page-back-row page-navigation-header '+(main&&!showBack?'is-main-page':'')+(inline?' has-inline-title':'')} data-compact={compact||undefined}>
 {showBack&&back(inline?'page-title-back icon-button':'icon-button')}
 <span className="page-compact-title" aria-hidden="true">{title}</span></div>;
}
