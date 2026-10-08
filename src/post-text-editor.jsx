import React,{useLayoutEffect,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import {PageMarkdownEditor} from './page-markdown.jsx';
import {plainTextToMarkdown} from './page-markdown-model.js';

const POST_PROMPTS=['What’s on your mind?','What made you smile today?','What’s a memory you love?','What would you like to share?','What’s happening with you?'];

// Formatting is optional; the original compose surface and its media/send
// actions stay in place. Closing tools keeps the rich field and draft alive.
export function PostTextEditor({value,textFormat,onChange,onFormatChange,onSubmit,background,disabled,children}){
 const [prompt]=useState(()=>POST_PROMPTS[Math.floor(Math.random()*POST_PROMPTS.length)]);
 const [open,setOpen]=useState(false),[error,setError]=useState(''),field=useRef(null),rich=textFormat==='markdown';
 useLayoutEffect(()=>{
  const node=field.current;if(!node||!background||rich)return;
  const size=()=>{node.style.height='0px';node.style.height=node.scrollHeight+'px'};
  size();const observer=new ResizeObserver(size);observer.observe(node.parentElement);return()=>observer.disconnect();
 },[value,background,rich]);
 function format(){const next=rich?value:plainTextToMarkdown(value);if(next.length>3000){setError('Shorten this post before adding formatting. Your words are unchanged.');return}setError('');if(!rich){onChange(next);onFormatChange('markdown')}setOpen(true)}
 return <div className={'writing-box post-writing post-compose-field'+(open?' formatting-open':'')+(rich?' formatted-post':'')} onKeyDownCapture={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();if(!disabled)onSubmit()}}}>
  {!open&&<Control type="button" className="post-format-toggle" aria-label="Formatting" aria-expanded={false} disabled={disabled} onClick={format}><Glyph name="edit"/><span>Formatting</span></Control>}
  {rich?<PageMarkdownEditor autoFocus compact controlsVisible={open} value={value} maxLength={3000} onChange={onChange} disabled={disabled} onDone={()=>setOpen(false)} ariaLabel="What's on your mind" placeholder=""/>:<textarea ref={field} aria-label="What's on your mind" maxLength={3000} rows={5} placeholder="" value={value} disabled={disabled} onChange={event=>onChange(event.target.value)} style={background?undefined:{height:'',resize:'vertical'}}/>}
  {!value.trim()&&<span className="post-compose-prompt" aria-hidden="true">{prompt}</span>}
  {error&&<p role="alert" className="post-format-error">{error}</p>}{children}
 </div>;
}
