import React,{useEffect,useRef} from 'react';

// Copy the rendered element without mounting a second editor or operational
// component. The preview has no event handlers, identifiers or active controls.
export function PageElementPreview({sourceRoot,slotId,label,revision}){
 const preview=useRef(null);
 useEffect(()=>{
  const source=[...(sourceRoot.current?.querySelectorAll('[data-card-slot]')||[])].find(node=>node.dataset.cardSlot===slotId)?.querySelector('.card-slot-content');
  if(!source||!preview.current)return;
  const refresh=()=>{
   const clone=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
   copies.forEach((node,index)=>{
    for(const attribute of [...node.attributes])if(attribute.name==='id'||attribute.name.startsWith('aria-')||attribute.name.startsWith('on')||['for','tabindex','contenteditable','autofocus','href','name','form','autoplay'].includes(attribute.name))node.removeAttribute(attribute.name);
    const style=getComputedStyle(originals[index]);node.style.fontFamily=style.fontFamily;node.style.fontWeight=style.fontWeight;node.style.fontSize=Math.min(parseFloat(style.fontSize)||16,28)+'px';node.style.color=style.color;
    if(node.matches('input,textarea,select,button'))node.disabled=true;
    if(node.matches('video,audio')){node.removeAttribute('src');node.querySelectorAll('source').forEach(item=>item.remove());node.preload='none';}
   });
   clone.querySelectorAll('script,iframe,object,embed,.page-copy-input-wrap,.page-field-done,.page-media-edit,.image-upload-choose,.page-object-tools').forEach(node=>node.remove());
   clone.inert=true;clone.setAttribute('aria-hidden','true');preview.current.replaceChildren(clone);
  };
  refresh();const observer=new MutationObserver(refresh);observer.observe(source,{subtree:true,childList:true,characterData:true,attributes:true});
  return()=>{observer.disconnect();preview.current?.replaceChildren()};
 },[sourceRoot,slotId,revision]);
 return <div className="page-element-preview" role="img" aria-label={'Preview of '+label}><div ref={preview}/><span className="page-element-preview-caption">{label} preview</span></div>;
}
