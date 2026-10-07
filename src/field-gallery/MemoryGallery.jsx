import {photoFrameStyle} from '../photo-framing-model.js';
import React,{useId,useRef,useState} from 'react';
import {getGalleryRootPatch,getGalleryItemPatch,getGalleryImagePatch,getGalleryStripHoverPatch} from './gallery-views';
import {CarouselControls,useCarouselReducedMotion} from '../carousel-controls.jsx';
import {carouselFrameScrollLeft,carouselKeyboardDestination,wrapCarouselIndex} from '../carousel-model.js';
// Thin family-data adapter. Field remains the source of gallery composition;
// GW's shared side controls replace only the carousel's former bottom row.
export function MemoryGallery({items,view,onOpen}){
 const [hovered,setHovered]=useState(null),root=useRef(null),instance=useId(),reduced=useCarouselReducedMotion(),galleryId='memory-gallery-'+instance;
 const idFor=item=>'memory-frame-'+instance+'-'+item.id;
 const move=index=>{
  const buttons=root.current?.querySelectorAll('.field-memory-open');
  if(!buttons?.length)return;
  const target=buttons[wrapCarouselIndex(index,buttons.length)],frame=target.closest('figure'),scroller=root.current;
  target.focus({preventScroll:true});
  const bounds=scroller.getBoundingClientRect(),itemBounds=frame.getBoundingClientRect();
  scroller.scrollTo({left:carouselFrameScrollLeft({scrollLeft:scroller.scrollLeft,clientWidth:scroller.clientWidth,scrollWidth:scroller.scrollWidth,left:bounds.left},{left:itemBounds.left,width:itemBounds.width}),behavior:reduced?'instant':'smooth'});
 };
 return <section ref={root} id={galleryId} onKeyDown={event=>{
  if(view!=='carousel'&&view!=='strip'||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const figure=event.target.closest('figure'),index=[...root.current.children].indexOf(figure),next=carouselKeyboardDestination(event.key,index,items.length);
  if(index<0||next===null)return;
  event.preventDefault();move(next);
 }} className="field-memory-gallery" style={{...getGalleryRootPatch(view),scrollBehavior:reduced?'auto':'smooth'}} aria-label="Family memories" aria-roledescription={view==='carousel'?'carousel':undefined} data-view={view}>
  {items.map((item,index)=>{
   const carousel=view==='carousel',imageStyle={...getGalleryImagePatch(view),objectFit:'cover'},assetStyle=carousel?{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}:imageStyle;
   const media=<button type="button" className="field-memory-open" style={{position:'relative',padding:0,width:'100%',height:'100%',display:'block',overflow:'hidden'}} aria-label={'Open '+(item.title||'memory')} onClick={()=>onOpen(item.id)}>
    {item.mediaType?.startsWith('video/')?<video src={item.image} muted playsInline preload="metadata" style={assetStyle}/>:item.mediaType&&!item.mediaType.startsWith('image/')?<span className="memory-file-tile" style={assetStyle}>{item.mediaType.startsWith('audio/')?'Audio memory':'Memory file'}</span>:<img src={item.image} alt={item.title||'Family memory'} draggable={false} style={{...assetStyle,...photoFrameStyle(item.photoFrame)}}/>}
    <span className="field-memory-caption">{item.title}</span>
   </button>;
   return <figure id={idFor(item)} key={item.id} className={carousel?'gw-carousel-stage':undefined} style={{...getGalleryItemPatch(view,index),...(carousel?{gridTemplateRows:'clamp(520px, calc(100vw - 48px), 820px)',gridTemplateColumns:'minmax(0, 1fr)',rowGap:0}:{}),...(view==='strip'&&hovered===item.id?getGalleryStripHoverPatch():{})}} onMouseEnter={()=>setHovered(item.id)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(item.id)} onBlur={()=>setHovered(null)}>
    {carousel?<div className="gw-carousel-photo" style={{...imageStyle,maxWidth:undefined,position:'relative'}}>{media}{items.length>1&&<><CarouselControls previousLabel="Previous memory" nextLabel="Next memory" controls={galleryId} onPrevious={()=>move(index-1)} onNext={()=>move(index+1)}/><span className="gw-carousel-status">{index+1} / {items.length}</span></>}</div>:media}
   </figure>;
  })}
 </section>;
}
