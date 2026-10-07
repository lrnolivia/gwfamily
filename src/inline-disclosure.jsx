import React,{useEffect,useId,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import glyphPaths from './glyph-paths.js';
import './inline-disclosure.css';

// Optional supporting fields stay in the parent form. Hiding them never clears
// their values or changes permission, sharing, or submission behavior.
export function InlineDisclosure({label,openLabel,icon='plus',summary='',populated=false,invalid=false,disabled=false,children,className=''}){
 const id=useId(),[open,setOpen]=useState(()=>populated||invalid),[validation,setValidation]=useState(''),content=useRef(null),invalidField=useRef(null),focusing=useRef(false),needsAttention=invalid||!!validation,expanded=needsAttention||open;
 const meaningfulIcon=Object.hasOwn(glyphPaths,icon)?icon:'plus';
 function focusInvalid(){content.current?.querySelector('input[aria-invalid="true"],textarea[aria-invalid="true"],select[aria-invalid="true"],[role="combobox"][aria-invalid="true"],input:invalid,textarea:invalid,select:invalid')?.focus()}
 useEffect(()=>{if(populated||invalid)setOpen(true);if(invalid)requestAnimationFrame(focusInvalid)},[populated,invalid]);
 useEffect(()=>{if(validation&&invalidField.current?.validity?.valid){setValidation('');invalidField.current=null}},[children,validation]);
 function showInvalid(event){
  event.preventDefault();setOpen(true);if(focusing.current)return;
  focusing.current=true;invalidField.current=event.target;
  setValidation(event.target.validationMessage||'Check this field.');
  requestAnimationFrame(()=>{focusing.current=false;invalidField.current?.focus()});
 }
 function recheck(event){if(event.target===invalidField.current&&event.target.validity?.valid){setValidation('');invalidField.current=null}}
 return <section className={'inline-disclosure '+className}>
  <Control type="button" className="button inline-disclosure-trigger" disabled={disabled} aria-expanded={expanded} aria-controls={id+'-content'} onClick={()=>{if(needsAttention)focusInvalid();else setOpen(value=>!value)}}><Glyph name={meaningfulIcon}/><span>{expanded&&!needsAttention?(openLabel||label):label}</span></Control>
  {!expanded&&summary&&<p className="inline-disclosure-summary">{summary}</p>}
  <div ref={content} id={id+'-content'} className="inline-disclosure-content" hidden={!expanded} inert={!expanded} onInvalidCapture={showInvalid} onChangeCapture={recheck}>{validation&&<p className="form-error" role="alert">{validation}</p>}{children}</div>
 </section>;
}
