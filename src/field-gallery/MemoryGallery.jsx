import React,{useRef,useState} from 'react';
import {getGalleryRootPatch,getGalleryItemPatch,getGalleryImagePatch,getGalleryStripHoverPatch,getGalleryCarouselControlPatch} from './gallery-views';
// Thin family-data adapter. All composition geometry is the unchanged Field source.
export function MemoryGallery({items,view,onOpen}){
  const [hovered,setHovered]=useState(null),root=useRef(null);
  const move=(index)=>{const buttons=root.current?.querySelectorAll('.field-memory-open');if(!buttons?.length)return;const target=buttons[(index+buttons.length)%buttons.length];target.focus({preventScroll:true});target.closest('figure').scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})};
  const idFor=item=>'memory-frame-'+item.id;
  return <section ref={root} onKeyDown={e=>{if(view!=='carousel'&&view!=='strip')return;const figure=e.target.closest('figure'),index=[...root.current.children].indexOf(figure);if(index<0)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(index+(e.key==='ArrowRight'?1:-1))}else if(e.key==='Home'||e.key==='End'){e.preventDefault();move(e.key==='Home'?0:items.length-1)}}} className="field-memory-gallery" style={getGalleryRootPatch(view)} aria-label="Family memories" data-view={view}>
    {items.map((item,index)=>{const imageStyle={...getGalleryImagePatch(view),objectFit:'cover'};return <figure id={idFor(item)} key={item.id} style={{...getGalleryItemPatch(view,index),...(view==='strip'&&hovered===item.id?getGalleryStripHoverPatch():{})}} onMouseEnter={()=>setHovered(item.id)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(item.id)} onBlur={()=>setHovered(null)}>
      <button type="button" className="field-memory-open" style={view==='carousel'?{...imageStyle,padding:0,position:'relative'}:{position:'relative',padding:0,width:'100%',height:'100%',display:'block'}} aria-label={'Open '+item.title} onClick={()=>onOpen(item.id)}><img src={item.image} alt={item.title} style={view==='carousel'?{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}:imageStyle}/><span className="field-memory-caption">{item.title}</span></button>
      {view==='carousel'&&items.length>1&&<><a href={'#'+idFor(items[(index-1+items.length)%items.length])} onClick={e=>{e.preventDefault();move(index-1)}} style={getGalleryCarouselControlPatch('previous')} aria-label="Previous memory">←</a><span style={getGalleryCarouselControlPatch('counter')}>{index+1} / {items.length}</span><a href={'#'+idFor(items[(index+1)%items.length])} onClick={e=>{e.preventDefault();move(index+1)}} style={getGalleryCarouselControlPatch('next')} aria-label="Next memory">→</a></>}
    </figure>})}
  </section>
}
