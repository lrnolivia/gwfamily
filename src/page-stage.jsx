import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Glyph,useApp} from './ui-core.jsx';
import {usePageContent,safePageMediaUrl} from './page-content.jsx';
import {luminance,wordmarkPalette} from './page-stage-model.js';
import './page-stage.css';
// The page stage: one full-bleed photo at the top of a main page, running under
// the floating header and fading into the page, with the page heading, one live
// line and a few chips. Every stage shares Home's photo height (Home shows the
// whole family), so moving between pages never jumps: the photo crossfades
// while the page slides in from the side. Pages without a photo keep a short,
// non-photographic stage and the usual wordmark.
const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const PAGE_ORDER={home:0,reunion:1,family:2,you:3};
const RATIO_KEY='gw-stage-ratio:v1';
const storedRatio=()=>{try{const v=Number(localStorage.getItem(RATIO_KEY));return v>.4&&v<4?v:1.5}catch{return 1.5}};
// What the last stage showed, so the next one can crossfade from it.
let lastStage=null;
// Reads one image into small pixel samples: the top strip behind the header (for
// the edge extension and the wordmark background) and the whole photo (for the
// wordmark colors). null when the image can't be read.
function readPhoto(img){
 try{
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  canvas.width=48;canvas.height=4;ctx.drawImage(img,0,0,img.naturalWidth,Math.max(1,img.naturalHeight*.025),0,0,48,4);
  const edge=canvas.toDataURL('image/png');
  // Behind the wordmark: the top-left of the photo under the theme's top shade.
  const strip=ctx.getImageData(0,0,20,4).data;let r=0,g=0,b=0,n=0;for(let i=0;i<strip.length;i+=4){r+=strip[i];g+=strip[i+1];b+=strip[i+2];n++}
  const shade=document.documentElement.dataset.theme==='light'?[231,239,223]:[9,31,23],bg=[r/n,g/n,b/n].map((v,i)=>.7*v+.3*shade[i]);
  canvas.width=24;canvas.height=24;ctx.drawImage(img,0,0,24,24);const all=ctx.getImageData(0,0,24,24).data,pixels=[];for(let i=0;i<all.length;i+=4)pixels.push([all[i],all[i+1],all[i+2]]);
  return {edge,tone:luminance(bg)>.3?'light':'dark',palette:wordmarkPalette(pixels,bg)};
 }catch{return null}
}
export function PageStage({images=[],blur=false,tint,eyebrow,meta,chips=[],className='',label,page,editing=false,children}){
 const root=useRef(null),chipList=chips.filter(Boolean),photo=images.find(image=>image?.src)||null,framed=Boolean(photo)&&!blur;
 const [ratio,setRatio]=useState(storedRatio),[read,setRead]=useState(null);
 // Every stage takes Home's photo shape, read straight from Home's photo, so a
 // page opened first (before Home) is already the same height.
 const {state}=useApp(),anchor=useStageImages('home',homeStageFallback(state))[0]?.src;
 useEffect(()=>{
  if(page==='home'||!anchor)return;let live=true;const img=new Image();
  img.onload=()=>{if(!live||!img.naturalWidth)return;const r=img.naturalWidth/img.naturalHeight;setRatio(current=>Math.abs(current-r)<.005?current:r);try{localStorage.setItem(RATIO_KEY,String(r))}catch{}};
  img.src=anchor;return()=>{live=false};
 },[page,anchor]);
 // Crossfade from the previous page's photo, and slide this page's content in
 // from the side it lies on in the bottom navigation.
 const [previous]=useState(()=>lastStage&&lastStage.page!==page&&framed&&!reducedMotion()?lastStage:null);
 useLayoutEffect(()=>{
  const html=document.documentElement,from=PAGE_ORDER[lastStage?.page],to=PAGE_ORDER[page];
  if(reducedMotion()||from==null||to==null||from===to)return;
  html.dataset.stageEnter=to>from?'from-right':'from-left';
  const timer=setTimeout(()=>{delete html.dataset.stageEnter},700);
  return()=>{clearTimeout(timer);delete html.dataset.stageEnter};
 },[page]);
 useEffect(()=>{lastStage=framed?{page,src:photo.src,edge:read?.edge||lastStage?.edge}:{page,src:null}},[page,framed,photo?.src,read?.edge]);
 // Tuck the stage under the header only when nothing (a notice, the edit
 // toolbar) sits between them; span the screen beside any side rail. While the
 // stage fills the top the header floats on it (html[data-stage-top]).
 useEffect(()=>{
  const el=root.current,html=document.documentElement;if(!el)return;
  const still=reducedMotion();let frame=0,tucked=false;
  const clear=node=>{for(let n=node;n&&!n.classList?.contains('app');n=n.parentElement)for(let s=n.previousElementSibling;s;s=s.previousElementSibling){if(s.classList.contains('app-header'))return true;if(s.offsetHeight>0&&getComputedStyle(s).position!=='fixed')return false}return true};
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
 // With a hero photo, the wordmark takes its three colors from the photo (and
 // the header ink tone from what sits behind it). Without one, the wordmark is
 // left exactly as it is everywhere else.
 useEffect(()=>{
  const html=document.documentElement,p=read?.palette,show=Boolean(photo)&&!editing;
  if(show&&read?.tone)html.dataset.stageTone=read.tone;else delete html.dataset.stageTone;
  if(show&&p){html.dataset.stageWordmark='photo';html.style.setProperty('--stage-wm-green',p.green);html.style.setProperty('--stage-wm-white',p.white);html.style.setProperty('--stage-wm-family',p.family)}
  else delete html.dataset.stageWordmark;
 },[photo?.src,read,editing]);
 useEffect(()=>()=>{const html=document.documentElement;delete html.dataset.stageTone;delete html.dataset.stageWordmark},[]);
 const loaded=event=>{const img=event.currentTarget;
  // Home sets the height every stage uses, so its whole family always shows.
  if(page==='home'&&img.naturalWidth){const r=img.naturalWidth/img.naturalHeight;setRatio(r);try{localStorage.setItem(RATIO_KEY,String(r))}catch{}}
  setRead(readPhoto(img));};
 const bg=src=>({backgroundImage:`url("${String(src).replace(/"/g,'%22')}")`});
 return <section ref={root} className={'page-stage'+(framed?' is-framed':photo?' is-blurred':' is-plain')+(className?' '+className:'')} aria-label={label} style={{...(tint?{'--stage-tint':tint}:{}),'--stage-ratio':ratio}}>
  <div className="page-stage-media" aria-hidden="true">{photo?<span className="page-stage-backdrop" style={bg(photo.src)}/>:null}</div>
  {framed&&<div className="page-stage-figure">
   {/* The photo's own top edge, stretched and blurred, continues it up behind the header. */}
   <div className="page-stage-extend" aria-hidden="true">{previous?.edge&&<span key="was" className="page-stage-extend-wash is-leaving" style={{backgroundImage:`url(${previous.edge})`}}/>}{read?.edge&&<span className="page-stage-extend-wash is-current" style={{backgroundImage:`url(${read.edge})`}}/>}</div>
   <div className="page-stage-frame">
    {previous?.src&&previous.src!==photo.src&&<img key="was" src={previous.src} alt="" aria-hidden="true" className="page-stage-photo is-leaving" draggable={false}/>}
    {/* The photo itself is never cropped, so everyone in it stays visible. */}
    <img key={photo.src} src={photo.src} alt={photo.alt||''} className={'page-stage-photo is-current'+(photo.own?' page-hero-asset':'')} decoding="async" fetchpriority="high" draggable={false} onLoad={loaded}/>
   </div>
  </div>}
  {/* Reads the You photo for its wordmark colors without showing it framed. */}
  {!framed&&photo&&<img src={photo.src} alt="" aria-hidden="true" className="page-stage-probe" onLoad={loaded}/>}
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

// The stage photo for a page: the page's own photo when a leader set one,
// otherwise the fallbacks the page passes (featured photos, memories). A page
// gallery or video stays in its card with its own controls. Live pages never
// show the bundled preview photos; with nothing real they get the plain stage.
const SAMPLE=/^(\.\/)?photos\//;
// Home's stage photos in order: the primary featured photo, the other featured
// photos, recent memories, then the preview-only sample.
export function homeStageFallback(state){
 const featured=[(state?.featuredPhotos||[]).find(m=>m.id===state.primaryMemoryId),...(state?.featuredPhotos||[])].filter(m=>m?.image);
 return [...featured.map(m=>({src:m.image,alt:m.title||''})),...(state?.memories||[]).filter(m=>m.image).slice(0,4).map(m=>({src:m.image,alt:m.title||''})),{src:'photos/garden.jpg',alt:'Family smiling together outdoors'}];
}
export function useStageImages(page,fallback=[]){
 const {state,data}=useApp(),editor=usePageContent(page),hero=editor?.content?.hero,preview=state?.mode==='preview'||Boolean(data?.preview);
 const allowed=image=>image?.src&&(preview||!SAMPLE.test(image.src));
 if(hero?.mode==='image'){const own=(hero.media||[]).map(file=>({src:safePageMediaUrl(file.url,preview),alt:file.alt||'',own:true})).filter(allowed);if(own.length)return own}
 return fallback.filter(allowed);
}
