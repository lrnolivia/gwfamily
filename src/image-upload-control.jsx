import {PhotoFramingEditor,photoFrameStyle} from './photo-framing.jsx';
import React,{useEffect,useId,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import {privateMediaRetryUrl} from './media-retry.js';
import './image-upload-control.css';
function EditImageGlyph(){return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/></svg>;}
// Presentation only: the form continues to own upload validation, authorization,
// progress, errors and the confirmed image URL. Never invent upload success.
export function ImageUploadControl({src='',alt='',label='Photo',shape='panel',accept='image/*',multiple=false,onFiles,disabled=false,busy=false,progress='',error='',actionLabel,emptyLabel='No photo chosen',className='',frame,onFrameChange}){
 const id=useId(),picker=useRef(null),retryTimer=useRef(null),[failed,setFailed]=useState(false),[framing,setFraming]=useState(false),frameButton=useRef(null);
 const closeFraming=()=>{setFraming(false);requestAnimationFrame(()=>frameButton.current?.focus())};
 const clearPreviewRetry=()=>{clearTimeout(retryTimer.current);retryTimer.current=null};
 useEffect(()=>{clearPreviewRetry();setFailed(false);return clearPreviewRetry},[src]);
 useEffect(()=>setFraming(false),[src]);
 function previewError(event){
  clearPreviewRetry();const image=event.currentTarget,original=image.getAttribute('src')||'',next=privateMediaRetryUrl(original,globalThis.location?.origin);
  if(!next){setFailed(true);return}
  // Keep the same image mounted for the existing bounded private-media recovery.
  // The app-wide capture listener may win; source/connectivity guards prevent a
  // duplicate retry, an obsolete file rewrite, or work after unmount.
  retryTimer.current=setTimeout(()=>{retryTimer.current=null;if(image.isConnected&&image.getAttribute('src')===original)image.setAttribute('src',next)},200);
 }
 const hasImage=!!src&&!failed,action=actionLabel||(hasImage?'Edit':'Choose image'),description=[progress?id+'-progress':null,error?id+'-error':null].filter(Boolean).join(' ')||undefined;
 return <div className={'image-upload-control image-upload-'+(['avatar','profile'].includes(shape)?shape:'panel')+' '+className} aria-busy={busy}>
  <span className="image-upload-label" id={id+'-label'}>{label}</span>
  {!framing&&<div className="image-upload-preview">
   {hasImage?<img src={src} alt={alt} style={photoFrameStyle(frame)} onError={previewError}/>:<div className="image-upload-placeholder"><Glyph name="image"/><span>{failed?'Current photo unavailable':emptyLabel}</span></div>}
   <Control ref={frameButton} type="button" className="image-upload-choose" disabled={disabled||busy} aria-label={(hasImage?'Edit ':'Choose ')+label.toLowerCase()} aria-describedby={description} onClick={()=>hasImage&&onFrameChange?setFraming(true):picker.current?.click()}><span className="image-upload-action"><EditImageGlyph/>{busy?'Uploading…':action}</span></Control>
  </div>}
  {hasImage&&onFrameChange&&!framing&&<Control type="button" className="image-upload-frame-button" disabled={disabled||busy} onClick={()=>picker.current?.click()}>Change image</Control>}
  {hasImage&&onFrameChange&&framing&&<PhotoFramingEditor src={src} alt={alt} frame={frame} aspect={['avatar','profile'].includes(shape)?1:1.5} disabled={disabled||busy} onChangeMedia={()=>picker.current?.click()} onCancel={closeFraming} onSave={next=>{onFrameChange(next);closeFraming()}}/>}
  <input ref={picker} id={id+'-file'} className="sr-only" type="file" tabIndex={-1} aria-label={label+' file picker'} accept={accept} multiple={multiple} disabled={disabled||busy} onChange={event=>{const files=[...event.currentTarget.files];event.currentTarget.value='';if(files.length)onFiles?.(files)}}/>
  {progress&&<p id={id+'-progress'} className="image-upload-progress" role="status">{progress}</p>}
  {error&&<p id={id+'-error'} className="image-upload-error" role="alert">{error}</p>}
 </div>;
}
