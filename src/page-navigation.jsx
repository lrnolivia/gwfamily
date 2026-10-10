import React,{useEffect,useLayoutEffect,useState,useRef} from 'react';
import {Control,Glyph,useApp} from './ui-core.jsx';
import {usePageContent} from './page-content.jsx';
import {pageIdentity,backUnread} from './page-navigation-model.js';
import {conversationTitle} from './messaging-model.js';
import {mainPages} from './navigation.js';
import './page-navigation.css';
// Pages whose title lives inside a decorative hero plate keep a real header row;
// anchoring Back to that title would place it on the plate under the top fade.
const HEADER_ROW_PAGES=new Set(['memorial']);
const headerTitles={memorial:'In loving memory'};
export function useCompactChrome(){
 const [compact,setCompact]=useState(()=>window.scrollY>96);
 useEffect(()=>{let frame;const update=()=>{frame=null;setCompact(window.scrollY>96)},schedule=()=>{if(frame==null)frame=requestAnimationFrame(update)};window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(frame!=null)cancelAnimationFrame(frame)}},[]);
 return compact;
}
// How far a page's content is mid-slide (the page stage slides in from the side).
// The title icon rides the same slide, so it is placed where the title will
// rest, not where it happens to be in the middle of the motion.
function slideOffset(node){let x=0,y=0;for(let n=node.parentElement;n&&n.id!=='main';n=n.parentElement){const t=getComputedStyle(n).transform;if(t&&t!=='none'){const m=new DOMMatrixReadOnly(t);x+=m.m41;y+=m.m42}}return {x,y}}
export function PageNavigationHeader({previous,compact}){
 // This component mounts with the real header after sign-in/bootstrap. The
 // app's initial render may have no header to measure yet.
 useLayoutEffect(()=>{
  const header=document.querySelector('.app>.app-header'),app=header?.parentElement;
  if(!header||!app)return;
  const title=document.querySelector('.page-navigation-header');const measure=()=>{const height=Math.ceil(header.getBoundingClientRect().height)+'px',titleHeight=Math.ceil(title?.getBoundingClientRect().height||0)+'px';app.style.setProperty('--gw-app-header-offset',height);document.documentElement.style.setProperty('--gw-app-header-offset',height);app.style.setProperty('--gw-page-title-height',titleHeight)};
  measure();let frame=null;const schedule=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;measure()})};const observer=new ResizeObserver(schedule);observer.observe(header);if(title)observer.observe(title);
  return()=>{if(frame!==null)cancelAnimationFrame(frame);observer.disconnect();app.style.removeProperty('--gw-page-title-height');app.style.removeProperty('--gw-app-header-offset');document.documentElement.style.removeProperty('--gw-app-header-offset')};
 },[]);
 const {route,state,messaging,goBack,go}=useApp(),page=usePageContent(route.type),main=mainPages.has(route.type),showBack=!main,[heading,setHeading]=useState(null),headerRef=useRef(null),[position,setPosition]=useState(null);
 useLayoutEffect(()=>{
  const root=document.getElementById('main');if(!root||HEADER_ROW_PAGES.has(route.type)){setHeading(null);return;}
  const update=()=>{const next=root.querySelector('h1')||(!['post','photo','memory','chat'].includes(route.type)&&root.querySelector(':scope > section > h2,:scope > div > h2'));setHeading(current=>current===next?current:next)};
  update();const observer=new MutationObserver(update);observer.observe(root,{childList:true,subtree:true});return()=>observer.disconnect();
 },[route.type,route.id,showBack]);
 useLayoutEffect(()=>{
  if(!heading||compact){setPosition(null);return;}
  const original=heading.getAttribute('data-page-back-anchor');heading.setAttribute('data-page-back-anchor','true');
  let frame;
  const measure=()=>{frame=null;const host=headerRef.current;if(!host||!heading.isConnected)return;const titleBox=heading.getBoundingClientRect(),hostBox=host.getBoundingClientRect(),style=getComputedStyle(heading),slide=slideOffset(heading),line=Math.min(titleBox.height,parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2||titleBox.height),next={top:titleBox.top-slide.y-hostBox.top+(parseFloat(style.paddingTop)||0)+(line-44)/2,left:titleBox.left-slide.x-hostBox.left};/* Centered on the first line, so a wrapping title keeps its icon beside the top line. */setPosition(current=>current&&Math.abs(current.top-next.top)<.5&&Math.abs(current.left-next.left)<.5?current:next)};
  const schedule=()=>{if(frame==null)frame=requestAnimationFrame(measure)};
  const main=document.getElementById('main');measure();const observer=new ResizeObserver(schedule);observer.observe(heading);observer.observe(main);main.addEventListener('animationend',schedule);window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  return()=>{observer.disconnect();main.removeEventListener('animationend',schedule);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(frame!=null)cancelAnimationFrame(frame);if(original===null)heading.removeAttribute('data-page-back-anchor');else heading.setAttribute('data-page-back-anchor',original)};
 },[heading,compact]);
 const chat=route.type==='chat'?messaging.conversations?.find(item=>item.id===route.id):null;
 const title=page.content?.text?.heading||headerTitles[route.type]||(chat?conversationTitle(chat,state.selfId):route.type==='chat'?'Conversation':pageIdentity(route,state)),destination=previous||{type:'home'},unread=backUnread(previous,messaging),label='Back to '+pageIdentity(destination,state)+(unread?', '+unread+' unread':'');
 const back=className=><Control type="button" className={'page-back '+className} aria-label={label} onClick={goBack}><svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>{unread>0&&<span className="page-back-unread" aria-hidden="true">{unread>99?'99+':unread}</span>}</Control>;
 const inline=Boolean(heading)&&!compact,mainGlyph={home:'home',reunion:'calendar',family:'people',you:'user'}[route.type];
 return <div ref={headerRef} style={inline&&position?{'--gw-inline-back-top':position.top+'px','--gw-inline-back-left':position.left+'px'}:undefined} className={'page-back-row page-navigation-header '+(main?'is-main-page':'')+(inline?' has-inline-title':'')} data-compact={compact||undefined}>
 {main?<span className={'page-route-glyph '+(inline?'page-title-glyph':'')} aria-hidden="true"><Glyph name={mainGlyph}/></span>:showBack&&back(inline?'page-title-back icon-button':'icon-button')}
 <span className="page-compact-title" aria-hidden="true">{title}</span>{route.type==='family'&&<Control type="button" className="family-calendar-entry" aria-label="Family Calendar" title="Family Calendar" onClick={()=>go({type:'family-calendar'})}><Glyph name="calendar"/></Control>}</div>;
}
