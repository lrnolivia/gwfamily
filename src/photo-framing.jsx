import React,{useEffect,useId,useRef,useState} from 'react';
import {Button,Control} from './ui-core.jsx';
import {DEFAULT_PHOTO_FRAME,normalizePhotoFrame,photoFrameStyle,movePhotoFrame,keyboardPhotoFrame,photoFrameAt,updatePhotoFrame} from './photo-framing-model.js';
import './photo-framing.css';
export {photoFrameStyle} from './photo-framing-model.js';
// The caller owns persistence. Save changes only the framing metadata; Cancel
// never calls onSave. No canvas, re-encoding, replacement upload or crop file.
export function PhotoFramingEditor({src,alt='',frame,onSave,onCancel,disabled=false,aspect=1.5,label='Photo framing'}){
 const [viewport]=useState(()=>typeof matchMedia==='function'&&matchMedia('(max-width: 700px)').matches?'mobile':'desktop'),[draft,setDraft]=useState(()=>photoFrameAt(frame,viewport)),[failed,setFailed]=useState(false),preview=useRef(null),photo=useRef(null),gesture=useRef(null),id=useId();
 useEffect(()=>{setDraft(photoFrameAt(frame,viewport));setFailed(false);gesture.current=null},[src]);
 useEffect(()=>{preview.current?.focus()},[]);
 const cancel=()=>{gesture.current=null;onCancel?.()};
 return <section className="photo-framing-editor" aria-label={label} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel()}}}>
  <div ref={preview} className="photo-framing-preview" style={{aspectRatio:aspect}} tabIndex={disabled?-1:0} role="group" aria-label="Photo framing preview" aria-describedby={id+'-help'} onKeyDown={event=>{if(disabled)return;const next=keyboardPhotoFrame(draft,event.key,event.shiftKey?10:2);if(next){event.preventDefault();setDraft(next)}}}
   onPointerDown={event=>{if(disabled||failed||event.button!==0)return;event.preventDefault();preview.current?.focus();const rect=event.currentTarget.getBoundingClientRect();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,frame:draft,width:rect.width,height:rect.height,imageWidth:photo.current?.naturalWidth,imageHeight:photo.current?.naturalHeight};try{event.currentTarget.setPointerCapture?.(event.pointerId)}catch{}}}
   onPointerMove={event=>{const g=gesture.current;if(!g||g.id!==event.pointerId||disabled)return;setDraft(movePhotoFrame(g.frame,event.clientX-g.x,event.clientY-g.y,g))}}
   onPointerUp={event=>{if(gesture.current?.id===event.pointerId)gesture.current=null}}
   onPointerCancel={event=>{const g=gesture.current;if(g?.id===event.pointerId){setDraft(g.frame);gesture.current=null}}}>
   {failed?<p role="alert">The photo couldn’t load. Cancel and try again.</p>:<img ref={photo} src={src} alt={alt} draggable={false} style={photoFrameStyle(draft)} onError={()=>setFailed(true)}/>}<span className="photo-framing-center" aria-hidden="true"/>
  </div>
  <div className="photo-framing-tools"><div className="photo-framing-summary"><p id={id+'-help'} className="field-help">Drag the photo to reposition.</p><span className="photo-framing-layout-note">{viewport==='mobile'?'Mobile position':'Desktop & tablet position'}</span><span className="sr-only">Arrow keys move the photo. The other layout and original photo stay unchanged.</span></div><div className="photo-framing-ranges">{[['x','Horizontal','Horizontal focus',0,100,1],['y','Vertical','Vertical focus',0,100,1],['zoom','Zoom','Zoom',1,3,.05]].map(([key,text,accessible,min,max,step])=><label key={key}><span className="photo-framing-range-heading"><span>{text}</span><output aria-hidden="true">{key==='zoom'?draft[key].toFixed(2)+'×':Math.round(draft[key])+'%'}</output></span><input aria-label={accessible} type="range" min={min} max={max} step={step} value={draft[key]} style={{'--position-fill':((draft[key]-min)/(max-min)*100)+'%'}} disabled={disabled||failed} onChange={event=>setDraft(value=>({...value,[key]:Number(event.target.value)}))}/></label>)}</div>
  <div className="photo-framing-actions"><Control type="button" disabled={disabled||failed} onClick={()=>setDraft({...DEFAULT_PHOTO_FRAME})}>Reset framing</Control><Button secondary type="button" disabled={disabled} onClick={cancel}>Cancel</Button><Button type="button" disabled={disabled||failed} onClick={()=>onSave?.(updatePhotoFrame(frame,viewport,draft))}>Save framing</Button></div>
 </div></section>;
}
