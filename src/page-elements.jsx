import React,{useEffect,useId,useRef,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {PageObjectTools} from './page-object-tools.jsx';
import {usePageContent,safePageMediaUrl} from './page-content.jsx';
import {ImageLayoutContext} from './image-edit-controls.jsx';
import {ImageUploadControl} from './image-upload-control.jsx';
import {PhotoFramingEditor,photoFrameStyle} from './photo-framing.jsx';
import {readPreviewFile} from './uploads.js';
import {updateCardLayout,setCardSlotRemoved} from './card-content-layout-model.js';
import {PAGE_ELEMENT_TYPES,PAGE_ELEMENT_DESTINATIONS} from './page-elements-model.js';
import {SHARED_IMAGE_TYPES,SHARED_CONTENT_LIMITS} from './shared-content-schema.js';

export function PageAddedElement({page,panelId,element,editable}){
 const editor=usePageContent(page),app=useApp(),[open,setOpen]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[frame,setFrame]=useState(null),[ready,setReady]=useState(false),tool=useId(),trigger=useRef(null),lock=useRef(false),alive=useRef(true),label=PAGE_ELEMENT_TYPES.find(([kind])=>kind===element.kind)?.[1]||'Element',file=element.media?.[0];
 useEffect(()=>()=>{alive.current=false},[]);
 useEffect(()=>{if(!editable||open&&editor.activeEditor!==tool)setOpen(false)},[editable,open,editor.activeEditor,tool]);
 const change=patch=>editor.update(page,content=>({...content,panelLayout:{...content.panelLayout,panels:content.panelLayout.panels.map(panel=>panel.id===panelId&&!panel.locked?{...panel,elements:panel.elements.map(item=>item.id===element.id?{...item,...patch}:item)}:panel)}}),{historyLabel:'Edit '+label.toLowerCase()});
 const close=()=>{setOpen(false);setFrame(null);requestAnimationFrame(()=>trigger.current?.focus())};
 const remove=()=>{editor.update(page,content=>updateCardLayout(content,page,panelId,layout=>setCardSlotRemoved(layout,element.id)),{historyLabel:'Remove '+label});close()};
 const removeAction=<div className="page-editor-destructive-group sheet-footer"><Control type="button" className="page-editor-remove" disabled={uploading||editor.pending} onClick={remove}><Glyph name="close"/>Remove element</Control></div>;
 const start=()=>{editor.activateSurface(trigger.current,tool);setOpen(true)};
 async function upload(files){if(lock.current||!files[0])return;lock.current=true;setUploading(true);setError('');const finish=editor.beginWork();try{const selected=files[0],limit=editor.preview?2*1024*1024:SHARED_CONTENT_LIMITS.maxMediaBytes;if(!SHARED_IMAGE_TYPES.includes(selected.type)||!selected.size||selected.size>limit)throw Error('Choose a supported photo under '+limit/1024/1024+' MB.');const output=await readPreviewFile(selected,editor.preview?'preview':'live');if(alive.current)change({media:[{...output,id:output.id||'preview-'+crypto.randomUUID(),alt:''}]})}catch(cause){if(alive.current)setError(cause.message)}finally{lock.current=false;finish();if(alive.current)setUploading(false)}}
 if(element.kind==='media')return <div className="page-added-media">
  {editable?<ImageUploadControl label="Element photo" src={safePageMediaUrl(file?.url,editor.preview)} alt={file?.alt||''} frame={file?.frame} accept={SHARED_IMAGE_TYPES.join(',')} onFiles={upload} busy={uploading} disabled={editor.pending} error={error} onEdit={()=>{setFrame(file?.frame||{});start()}}/>:file?<img src={safePageMediaUrl(file.url,editor.preview)} alt={file.alt||''} style={photoFrameStyle(file.frame)}/>:null}
  {open&&file&&<PageObjectTools title="Photo · Added media" onClose={close} onDone={()=>{change({media:[{...file,frame}]});close()}} busy={uploading} doneDisabled={!ready}><ImageLayoutContext.Provider value={null}><PhotoFramingEditor src={safePageMediaUrl(file.url,editor.preview)} alt={file.alt||''} frame={file.frame} onReadyChange={setReady} onDraftChange={({frame})=>setFrame(frame)} onCancel={close} onSave={frame=>{change({media:[{...file,frame}]});close()}}/></ImageLayoutContext.Provider>{removeAction}</PageObjectTools>}
 </div>;
 const Tag=element.kind==='heading'?'h2':'p',copy=element.text||'Add '+label.toLowerCase();
 return <>
  {editable?<Control ref={trigger} type="button" className={'page-added-copy page-added-'+element.kind} aria-label={'Edit added '+label.toLowerCase()} onClick={start}>{copy}</Control>:element.kind==='button'?<Button onClick={()=>app.go({type:element.destination})}>{copy}</Button>:<Tag className={'page-added-copy page-added-'+element.kind}>{copy}</Tag>}
  {open&&<PageObjectTools title={label+' · Added element'} onClose={close} onDone={close} busy={uploading}>
   <label>{label}<textarea aria-label={'Added '+label.toLowerCase()} maxLength={element.kind==='text'?1500:160} rows={element.kind==='text'?5:2} autoFocus value={element.text} onChange={event=>change({text:event.target.value})}/></label>
   {element.kind==='button'&&<label>Open family page<select aria-label="Button destination" value={element.destination} onChange={event=>change({destination:event.target.value})}>{PAGE_ELEMENT_DESTINATIONS.map(value=><option key={value} value={value}>{value==='you'?'You':value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>}
   {removeAction}
  </PageObjectTools>}
 </>;
}
