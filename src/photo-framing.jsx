import React,{useContext,useEffect,useId,useRef,useState} from 'react';
import {Button,Control} from './ui-core.jsx';
import {DEFAULT_PHOTO_FRAME,normalizePhotoFrame,photoFrameStyle,movePhotoFrame,keyboardPhotoFrame,photoFrameAt,updatePhotoFrame} from './photo-framing-model.js';
import {ImageLayoutContext,ImageLayoutControls,ImageControlRow,LayoutGlyph} from './image-edit-controls.jsx';
import './photo-framing.css';
export {photoFrameStyle} from './photo-framing-model.js';
// The caller owns persistence. Save changes only the framing metadata; Cancel
// never calls onSave. No canvas, re-encoding, replacement upload or crop file.
export function PhotoFramingEditor({src,alt='',frame,onSave,onCancel,disabled=false,aspect=1.5,label='Photo framing',onChangeMedia,changeMediaLabel='Change image'}){
 const imageLayout=useContext(ImageLayoutContext),[layoutDraft,setLayoutDraft]=useState(()=>imageLayout?.value),[naturalAspect,setNaturalAspect]=useState(aspect);
 disabled=disabled||!!imageLayout?.disabled;
 const [viewport]=useState(()=>typeof matchMedia==='function'&&matchMedia('(max-width: 700px)').matches?'mobile':'desktop'),[draft,setDraft]=useState(()=>photoFrameAt(frame,viewport)),[failed,setFailed]=useState(false),preview=useRef(null),photo=useRef(null),gesture=useRef(null),id=useId();
 useEffect(()=>{setDraft(photoFrameAt(frame,viewport));setFailed(false);gesture.current=null},[src]);
 useEffect(()=>{preview.current?.focus()},[]);
 const previewAspect=layoutDraft?.aspect==='original'?naturalAspect:({landscape:16/9,portrait:3/4,square:1}[layoutDraft?.aspect]||aspect);
 const cancel=()=>{gesture.current=null;onCancel?.()};
 return <section className="photo-framing-editor" aria-label={label} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel()}}}>
  <div className="photo-framing-canvas" data-photo-align={layoutDraft?.align||'stretch'}><div ref={preview} className="photo-framing-preview" style={{aspectRatio:previewAspect,width:(layoutDraft?.width||100)+'%'}} tabIndex={disabled?-1:0} role="group" aria-label="Photo framing preview" aria-describedby={id+'-help'} onKeyDown={event=>{if(disabled)return;const next=keyboardPhotoFrame(draft,event.key,event.shiftKey?10:2);if(next){event.preventDefault();setDraft(next)}}}
   onPointerDown={event=>{if(disabled||failed||event.button!==0)return;event.preventDefault();preview.current?.focus();const rect=event.currentTarget.getBoundingClientRect();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,frame:draft,width:rect.width,height:rect.height,imageWidth:photo.current?.naturalWidth,imageHeight:photo.current?.naturalHeight};try{event.currentTarget.setPointerCapture?.(event.pointerId)}catch{}}}
   onPointerMove={event=>{const g=gesture.current;if(!g||g.id!==event.pointerId||disabled)return;setDraft(movePhotoFrame(g.frame,event.clientX-g.x,event.clientY-g.y,g))}}
   onPointerUp={event=>{if(gesture.current?.id===event.pointerId)gesture.current=null}}
   onPointerCancel={event=>{const g=gesture.current;if(g?.id===event.pointerId){setDraft(g.frame);gesture.current=null}}}>
   {failed?<p role="alert">The photo couldn’t load. Cancel and try again.</p>:<img ref={photo} src={src} alt={alt} draggable={false} style={photoFrameStyle(draft)} onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth&&image.naturalHeight)setNaturalAspect(image.naturalWidth/image.naturalHeight)}} onError={()=>setFailed(true)}/>}<span className="photo-framing-center" aria-hidden="true"/>
  </div></div>
  <div className="photo-framing-tools"><div className="photo-framing-summary"><p id={id+'-help'} className="field-help">Drag the photo to reposition.</p><span className="photo-framing-layout-note">{viewport==='mobile'?'Mobile position':'Desktop & tablet position'}</span><span className="sr-only">Arrow keys move the photo. The other layout and original photo stay unchanged.</span></div>{layoutDraft&&<ImageLayoutControls value={layoutDraft} onChange={setLayoutDraft} disabled={disabled||failed} label={imageLayout.label}/>}
  <ImageControlRow label="Zoom"><div className="photo-framing-zoom card-image-size" role="group" aria-label="Photo zoom"><Control type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled||failed||draft.zoom<=1} onClick={()=>setDraft(value=>normalizePhotoFrame({...value,zoom:Math.max(1,value.zoom-.05)}))}><LayoutGlyph kind="minus"/></Control><output aria-label="Photo zoom percentage">{Math.round(draft.zoom*100)}%</output><Control type="button" aria-label="Zoom in" title="Zoom in" disabled={disabled||failed||draft.zoom>=3} onClick={()=>setDraft(value=>normalizePhotoFrame({...value,zoom:Math.min(3,value.zoom+.05)}))}><LayoutGlyph kind="plus"/></Control></div></ImageControlRow>
  <div className="photo-framing-secondary"><Control type="button" disabled={disabled||failed} onClick={()=>setDraft({...DEFAULT_PHOTO_FRAME})}>Reset framing</Control>{onChangeMedia&&<Control type="button" disabled={disabled} onClick={onChangeMedia}>{changeMediaLabel}</Control>}</div>
  <div className="photo-framing-actions"><Button secondary type="button" disabled={disabled} onClick={cancel}>Cancel</Button><Button type="button" disabled={disabled||failed} onClick={()=>{onSave?.(updatePhotoFrame(frame,viewport,draft));if(layoutDraft)imageLayout.commit(layoutDraft)}}>{layoutDraft?'Save image':'Save framing'}</Button></div>
 </div></section>;
}
