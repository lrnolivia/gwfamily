import React,{useEffect,useId,useRef,useState} from 'react';
import {Button,Control} from './ui-core.jsx';
import {DEFAULT_PHOTO_FRAME,normalizePhotoFrame,photoFrameStyle,movePhotoFrame,keyboardPhotoFrame} from './photo-framing-model.js';
import './photo-framing.css';
export {photoFrameStyle} from './photo-framing-model.js';
// The caller owns persistence. Save changes only the framing metadata; Cancel
// never calls onSave. No canvas, re-encoding, replacement upload or crop file.
export function PhotoFramingEditor({src,alt='',frame,onSave,onCancel,disabled=false,aspect=1.5,label='Photo framing'}){
 const [draft,setDraft]=useState(()=>normalizePhotoFrame(frame)),[failed,setFailed]=useState(false),preview=useRef(null),photo=useRef(null),gesture=useRef(null),id=useId();
 useEffect(()=>{setDraft(normalizePhotoFrame(frame));setFailed(false);gesture.current=null},[src]);
 useEffect(()=>{preview.current?.focus()},[]);
 const cancel=()=>{gesture.current=null;onCancel?.()};
 return <section className="photo-framing-editor" aria-label={label} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel()}}}>
  <p id={id+'-help'} className="field-help">Drag the photo to frame it. Arrow keys adjust the focus. The original photo stays unchanged.</p>
  <div ref={preview} className="photo-framing-preview" style={{aspectRatio:aspect}} tabIndex={disabled?-1:0} role="group" aria-label="Photo framing preview" aria-describedby={id+'-help'} onKeyDown={event=>{if(disabled)return;const next=keyboardPhotoFrame(draft,event.key,event.shiftKey?10:2);if(next){event.preventDefault();setDraft(next)}}}
   onPointerDown={event=>{if(disabled||failed||event.button!==0)return;event.preventDefault();preview.current?.focus();const rect=event.currentTarget.getBoundingClientRect();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,frame:draft,width:rect.width,height:rect.height,imageWidth:photo.current?.naturalWidth,imageHeight:photo.current?.naturalHeight};try{event.currentTarget.setPointerCapture?.(event.pointerId)}catch{}}}
   onPointerMove={event=>{const g=gesture.current;if(!g||g.id!==event.pointerId||disabled)return;setDraft(movePhotoFrame(g.frame,event.clientX-g.x,event.clientY-g.y,g))}}
   onPointerUp={event=>{if(gesture.current?.id===event.pointerId)gesture.current=null}}
   onPointerCancel={event=>{const g=gesture.current;if(g?.id===event.pointerId){setDraft(g.frame);gesture.current=null}}}>
   {failed?<p role="alert">The photo couldn’t load. Cancel and try again.</p>:<img ref={photo} src={src} alt={alt} draggable={false} style={photoFrameStyle(draft)} onError={()=>setFailed(true)}/>}<span className="photo-framing-center" aria-hidden="true"/>
  </div>
  <div className="photo-framing-ranges"><label>Horizontal focus<input type="range" min="0" max="100" step="1" value={draft.x} disabled={disabled||failed} onChange={event=>setDraft(value=>({...value,x:Number(event.target.value)}))}/></label><label>Vertical focus<input type="range" min="0" max="100" step="1" value={draft.y} disabled={disabled||failed} onChange={event=>setDraft(value=>({...value,y:Number(event.target.value)}))}/></label><label>Zoom<input type="range" min="1" max="3" step="0.05" value={draft.zoom} disabled={disabled||failed} onChange={event=>setDraft(value=>({...value,zoom:Number(event.target.value)}))}/></label></div>
  <div className="photo-framing-actions"><Control type="button" disabled={disabled||failed} onClick={()=>setDraft({...DEFAULT_PHOTO_FRAME})}>Reset framing</Control><Button secondary type="button" disabled={disabled} onClick={cancel}>Cancel</Button><Button type="button" disabled={disabled||failed} onClick={()=>onSave?.(normalizePhotoFrame(draft))}>Save framing</Button></div>
 </section>;
}
