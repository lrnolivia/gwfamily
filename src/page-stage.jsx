import React,{useEffect,useRef,useState} from 'react';
import {Glyph} from './ui-core.jsx';
import {usePageContent,safePageMediaUrl} from './page-content.jsx';
import './page-stage.css';
// The page stage: a full-bleed photo (or a slow crossfade of a few) at the top
// of a main page, running under the glass header and fading into the page. It
// carries the page's own heading plus one live line and a few chips. Photos
// drift slowly; Reduce Motion keeps them still, and the stage eases back as the
// page scrolls. With no photo it falls back to a tinted, tree-marked surface.
const CYCLE_MS=7000;
const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export function PageStage({images=[],blur=false,tint,eyebrow,meta,chips=[],className='',label,children}){
 const root=useRef(null),chipList=chips.filter(Boolean),list=images.filter(image=>image?.src).slice(0,4),[index,setIndex]=useState(0);
 const key=list.map(image=>image.src).join('|');
 useEffect(()=>{setIndex(0)},[key]);
 // Crossfade only while visible and only when there is more than one photo.
 useEffect(()=>{
  if(list.length<2||reducedMotion())return;
  let timer=0;const tick=()=>{if(document.visibilityState==='visible')setIndex(i=>(i+1)%list.length)};
  timer=setInterval(tick,CYCLE_MS);return()=>clearInterval(timer);
 },[key]);
 // While the stage fills the top of the screen the header floats on it
 // (html[data-stage-top]); past it the header's glass returns. The stage also
 // eases back as the page scrolls, unless Reduce Motion is on.
 useEffect(()=>{
  const el=root.current,html=document.documentElement;if(!el)return;
  const still=reducedMotion();let frame=0;
  const update=()=>{frame=0;const h=el.offsetHeight||1,y=window.scrollY;
   if(y<h-(parseFloat(getComputedStyle(html).getPropertyValue('--gw-app-header-height'))||78)-24)html.dataset.stageTop='true';else delete html.dataset.stageTop;
   if(!still)el.style.setProperty('--stage-p',Math.min(1,Math.max(0,y/h)).toFixed(3))};
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update)};
  update();window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);
  return()=>{window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);if(frame)cancelAnimationFrame(frame);delete html.dataset.stageTop};
 },[]);
 return <section ref={root} className={'page-stage'+(list.length?' has-photo':' is-plain')+(blur?' is-blurred':'')+(className?' '+className:'')} aria-label={label} style={tint?{'--stage-tint':tint}:undefined}>
  <div className="page-stage-media" aria-hidden={list.every(image=>!image.alt)||undefined}>
   {list.length?list.map((image,i)=><img key={image.src} src={image.src} alt={i===index?image.alt||'':''} className={'page-stage-photo'+(i===index?' is-current':'')+(i%2?' drift-b':' drift-a')} style={image.position?{objectPosition:image.position}:undefined} decoding="async" fetchpriority={i===0?'high':'low'} loading={i===0?'eager':'lazy'} draggable={false}/>)
    :<img className="page-stage-art" src="tree-artwork.png" alt="" draggable={false}/>}
  </div>
  <div className="page-stage-shade" aria-hidden="true"/>
  <div className="page-stage-copy">
   {eyebrow&&<p className="page-stage-eyebrow">{eyebrow}</p>}
   {children}
   {(meta||chipList.length>0)&&<div className="page-stage-meta">
    {meta&&<span className="page-stage-line">{meta}</span>}
    {chipList.map(chip=><span key={chip.label} className="page-stage-chip"><Glyph name={chip.glyph||'info'}/>{chip.label}</span>)}
   </div>}
  </div>
 </section>;
}

// Photos for a page's stage: the page's own photo or gallery when a leader set
// one, otherwise the fallbacks the page passes (featured photos, memories).
export function useStageImages(page,fallback=[]){
 const editor=usePageContent(page),hero=editor?.content?.hero;
 const own=hero&&hero.mode!=='default'&&hero.mode!=='video'?(hero.media||[]).map(file=>({src:safePageMediaUrl(file.url,editor.preview),alt:file.alt||''})).filter(image=>image.src):[];
 return own.length?own:fallback.filter(image=>image?.src);
}
