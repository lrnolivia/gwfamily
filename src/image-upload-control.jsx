import React,{useEffect,useId,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import './image-upload-control.css';
function EditImageGlyph(){return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/></svg>;}
// Presentation only: the form continues to own upload validation, authorization,
// progress, errors and the confirmed image URL. Never invent upload success.
export function ImageUploadControl({src='',alt='',label='Photo',shape='panel',accept='image/*',multiple=false,onFiles,disabled=false,busy=false,progress='',error='',actionLabel,emptyLabel='No photo chosen',className=''}){
 const id=useId(),picker=useRef(null),[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 const hasImage=!!src&&!failed,action=actionLabel||(hasImage?'Edit':'Choose image'),description=[progress?id+'-progress':null,error?id+'-error':null].filter(Boolean).join(' ')||undefined;
 return <div className={'image-upload-control image-upload-'+(['avatar','profile'].includes(shape)?shape:'panel')+' '+className} aria-busy={busy}>
  <span className="image-upload-label" id={id+'-label'}>{label}</span>
  <div className="image-upload-preview">
   {hasImage?<img src={src} alt={alt} onError={()=>setFailed(true)}/>:<div className="image-upload-placeholder"><Glyph name="image"/><span>{failed?'Current photo unavailable':emptyLabel}</span></div>}
   <Control type="button" className="image-upload-choose" disabled={disabled||busy} aria-label={(hasImage?'Edit ':'Choose ')+label.toLowerCase()} aria-describedby={description} onClick={()=>picker.current?.click()}><span className="image-upload-action"><EditImageGlyph/>{busy?'Uploading…':action}</span></Control>
  </div>
  <input ref={picker} id={id+'-file'} className="sr-only" type="file" tabIndex={-1} aria-label={'Choose '+label.toLowerCase()} accept={accept} multiple={multiple} disabled={disabled||busy} onChange={event=>{const files=[...event.currentTarget.files];event.currentTarget.value='';if(files.length)onFiles?.(files)}}/>
  {progress&&<p id={id+'-progress'} className="image-upload-progress" role="status">{progress}</p>}
  {error&&<p id={id+'-error'} className="image-upload-error" role="alert">{error}</p>}
 </div>;
}
