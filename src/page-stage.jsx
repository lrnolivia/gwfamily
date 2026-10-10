import React,{useEffect,useId,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import {useCarouselSwipe} from './carousel-controls.jsx';
import {carouselKeyboardDestination,wrapCarouselIndex} from './carousel-model.js';
import {usePageContent,safePageMediaUrl} from './page-content.jsx';
import './page-stage.css';
// The page stage: a full-bleed photo (or a slow crossfade of a few) at the top
// of a main page, running under the glass header and fading into the page. It
// carries the page's own heading plus one live line and a few chips. Photos
// drift slowly; Reduce Motion keeps them still, and the stage eases back as the
// page scrolls. With no photo it falls back to a tinted, tree-marked surface.
const CYCLE_MS=6000;
const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
// Brightness behind the header: the photo's top edge (what the extension shows)
// under the theme's light top shade, so the wordmark switches to the ink that
// reads on it. null when unreadable.
function topTone(img){
 try{
  const w=48,h=4,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,img.naturalWidth,Math.max(1,img.naturalHeight*.025),0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data;let sum=0;
  for(let i=0;i<d.length;i+=4){const [r,g,b]=[d[i],d[i+1],d[i+2]].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});sum+=.2126*r+.7152*g+.0722*b}
  const bg=document.documentElement.dataset.theme==='light'?.85:.02,seen=.7*(sum/(d.length/4))+.3*bg;
  return seen>.3?'light':'dark';
 }catch{return null}
}
// The photo's top edge, a few rows tall, as a tiny image. Stretched upward and
// blurred it continues the photo behind the header with the same colors, so the
// seam disappears without a mirrored shape. null when the photo can't be read.
function topEdge(img){
 try{
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=4;
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,img.naturalWidth,Math.max(1,img.naturalHeight*.025),0,0,48,4);
  ctx.getImageData(0,0,1,1);return canvas.toDataURL('image/png');
 }catch{return null}
}
export function PageStage({images=[],blur=false,tint,eyebrow,meta,chips=[],className='',label,editing=false,children}){
 const root=useRef(null),chipList=chips.filter(Boolean),list=images.filter(image=>image?.src).slice(0,4),[index,setIndex]=useState(0);
 const [ratio,setRatio]=useState(4/3),[tones,setTones]=useState({}),[edges,setEdges]=useState({});
 const key=list.map(image=>image.src).join('|'),framed=list.length>0&&!blur;
 useEffect(()=>{setIndex(0)},[key]);
 // Several photos work like the page gallery: Previous/Next, swipe and arrow
 // keys, and a slideshow only after the member presses Play (paused while
 // hovered or focused; never with Reduce Motion). While editing, the card's own
 // gallery carries the controls.
 const [playing,setPlaying]=useState(false),[held,setHeld]=useState(false),photoId='page-stage-photo-'+useId().replace(/:/g,''),gallery=framed&&list.length>1&&!editing,still=reducedMotion();
 const step=amount=>{setPlaying(false);setIndex(value=>wrapCarouselIndex(value+amount,list.length))};
 const swipe=useCarouselSwipe({enabled:gallery,onStep:step});
 useEffect(()=>{if(editing)setPlaying(false)},[editing]);
 useEffect(()=>{if(!playing||held||editing||list.length<2||reducedMotion())return;const tick=()=>{if(document.visibilityState==='visible')setIndex(i=>(i+1)%list.length)};const timer=setInterval(tick,CYCLE_MS);return()=>clearInterval(timer)},[playing,held,editing,key]);
 // Span the screen beside any side rail, and tuck the stage under the header only when nothing (a notice, the edit toolbar) sits
 // between them. While it fills the top of the screen the header floats on it
 // (html[data-stage-top]); past it the header's glass returns. The stage also
 // eases back as the page scrolls, unless Reduce Motion is on.
 useEffect(()=>{
  const el=root.current,html=document.documentElement;if(!el)return;
  const still=reducedMotion();let frame=0,tucked=false;
  const clear=node=>{for(let n=node;n&&!n.classList?.contains('app');n=n.parentElement)for(let s=n.previousElementSibling;s;s=s.previousElementSibling){if(s.classList.contains('app-header'))return true;if(s.offsetHeight>0&&getComputedStyle(s).position!=='fixed')return false}return true};
  // The area the app sits in (the whole screen unless a side rail takes some).
  const fit=()=>{const app=el.closest('.app'),host=app?.parentElement,parent=el.parentElement?.getBoundingClientRect();
   if(host&&parent){const box=host.getBoundingClientRect(),cs=getComputedStyle(host),left=box.left+(parseFloat(cs.paddingLeft)||0),right=Math.min(box.right-(parseFloat(cs.paddingRight)||0),html.clientWidth);el.style.setProperty('--stage-x',Math.round(parent.left-left)+'px');el.style.setProperty('--stage-w',Math.round(right-left)+'px')}
   tucked=clear(el);el.classList.toggle('is-tucked',tucked)};
  const update=()=>{frame=0;const h=el.offsetHeight||1,y=window.scrollY,head=parseFloat(getComputedStyle(html).getPropertyValue('--gw-app-header-height'))||78;
   if(tucked&&y<h-head-24)html.dataset.stageTop='true';else delete html.dataset.stageTop;
   if(!still)el.style.setProperty('--stage-p',Math.min(1,Math.max(0,y/h)).toFixed(3))};
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update)};
  const onLayout=()=>{fit();onScroll()};
  fit();update();window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onLayout);
  const watch=new MutationObserver(onLayout),app=el.closest('.app'),main=document.getElementById('main');
  if(app)watch.observe(app,{childList:true});if(main)watch.observe(main,{childList:true});
  return()=>{window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onLayout);watch.disconnect();if(frame)cancelAnimationFrame(frame);delete html.dataset.stageTop};
 },[]);
 // The header's ink follows the photo behind it.
 const tone=framed?tones[list[index]?.src]:blur&&list.length?'dark':null;
 useEffect(()=>{const html=document.documentElement;if(tone)html.dataset.stageTone=tone;else delete html.dataset.stageTone;return()=>{delete html.dataset.stageTone}},[tone]);
 const loaded=(image,i)=>event=>{const img=event.currentTarget;if(i===0&&img.naturalWidth)setRatio(img.naturalWidth/img.naturalHeight);const t=topTone(img),e=topEdge(img);if(t)setTones(prev=>({...prev,[image.src]:t}));if(e)setEdges(prev=>({...prev,[image.src]:e}))};
 const layer=(image,i,cls)=><span key={cls+image.src} aria-hidden="true" className={cls+(i===index?' is-current':'')} style={{backgroundImage:`url("${String(image.src).replace(/"/g,'%22')}")`}}/>;
 return <section ref={root} className={'page-stage'+(framed?' is-framed':list.length?' is-blurred':' is-plain')+(className?' '+className:'')} role={gallery?'region':undefined} aria-roledescription={gallery?'carousel':undefined} aria-label={gallery?'Family page photos':label} style={{...(tint?{'--stage-tint':tint}:{}),'--stage-ratio':ratio}}
  onMouseEnter={()=>setHeld(true)} onMouseLeave={()=>setHeld(false)} onFocus={()=>setHeld(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHeld(false)}}
  onKeyDown={event=>{if(!gallery||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;const next=carouselKeyboardDestination(event.key,index,list.length);if(next===null)return;event.preventDefault();setPlaying(false);setIndex(next)}}>
  {/* Blurred fill behind everything: the header strip and any side gaps. */}
  <div className="page-stage-media" aria-hidden="true">
   {list.length?list.map((image,i)=>layer(image,i,'page-stage-backdrop'+(i%2?' drift-b':' drift-a'))):<img className="page-stage-art" src="tree-artwork.png" alt="" draggable={false}/>}
  </div>
  {framed&&<div className="page-stage-figure">
   {/* The photo's own top edge, stretched and blurred, continues it up behind the header. */}
   <div className="page-stage-extend" aria-hidden="true">{list.map((image,i)=>edges[image.src]&&<span key={image.src} className={'page-stage-extend-wash'+(i===index?' is-current':'')} style={{backgroundImage:`url(${edges[image.src]})`}}/>)}</div>
   {/* The photo itself is never cropped, so everyone in it stays visible. */}
   <div className="page-stage-frame" {...swipe}>
    {list[index]&&<img key={'p'+list[index].src} id={photoId} src={list[index].src} alt={list[index].alt||''} className="page-stage-photo is-current page-hero-asset" decoding="async" fetchpriority="high" draggable={false} onLoad={loaded(list[index],index)}/>}
   </div>
  </div>}
  <div className="page-stage-shade" aria-hidden="true"/>
  <div className="page-stage-copy">
   {eyebrow&&<p className="page-stage-eyebrow">{eyebrow}</p>}
   {children}
   {(meta||chipList.length>0||gallery)&&<div className="page-stage-meta">
    {meta&&<span className="page-stage-line">{meta}</span>}
    {chipList.map(chip=><span key={chip.label} className="page-stage-chip"><Glyph name={chip.glyph||'info'}/>{chip.label}</span>)}
    {gallery&&<div className="page-stage-gallery" role="group" aria-label="Photo navigation">
     <Control type="button" className="page-stage-gallery-step is-previous" aria-label="Previous page photo" aria-controls={photoId} onClick={()=>step(-1)}><Glyph name="arrow"/></Control>
     <span className="page-stage-gallery-count" aria-live={playing?'off':'polite'} aria-atomic="true">{index+1} / {list.length}</span>
     <Control type="button" className="page-stage-gallery-step" aria-label="Next page photo" aria-controls={photoId} onClick={()=>step(1)}><Glyph name="arrow"/></Control>
     <Control type="button" className="page-stage-gallery-play" aria-label={playing?'Pause page photos':'Play page photos'} aria-pressed={playing} disabled={still} onClick={()=>setPlaying(value=>!value)}><Glyph name={playing?'pause':'play'}/></Control>
    </div>}
   </div>}
  </div>
 </section>;
}

// Photos for a page's stage: the page's own photo or gallery when a leader set
// one, otherwise the fallbacks the page passes (featured photos, memories). A
// page video stays in its card, so the stage keeps its plain look then.
export function useStageImages(page,fallback=[]){
 const editor=usePageContent(page),hero=editor?.content?.hero;
 if(hero?.mode==='video')return [];
 const own=hero&&hero.mode!=='default'&&hero.mode!=='video'?(hero.media||[]).map(file=>({src:safePageMediaUrl(file.url,editor.preview),alt:file.alt||''})).filter(image=>image.src):[];
 return own.length?own:fallback.filter(image=>image?.src);
}
