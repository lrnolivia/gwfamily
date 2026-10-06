import React,{useId,useState} from 'react';
import {Avatar,Control,Glyph,useApp} from './ui-core.jsx';
import {directoryPeople,directoryPerson} from './member-directory.js';

export function MemberPicker({value,multiple=false,onChange,purpose='member',filter,label='Family member',placeholder='Search the family directory',disabled=false,required=false,emptyText='No family members match.',help}){
 const {state}=useApp(),id=useId(),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const selected=multiple?(Array.isArray(value)?value:[]):value?[value]:[],all=directoryPeople(state,{purpose,query,filter}),choices=all.slice(0,30),activeIndex=Math.min(active,Math.max(choices.length-1,0));
 const choose=person=>{onChange(multiple?(selected.includes(person.id)?selected.filter(id=>id!==person.id):[...selected,person.id]):person.id);setQuery('');setActive(0);if(!multiple)setOpen(false)};
 const remove=personId=>onChange(multiple?selected.filter(id=>id!==personId):'');
 return <div className="member-picker stack" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}>
  <label htmlFor={id}>{label}{required?' *':''}</label>
  {selected.length>0&&<div className="member-picker-selected memory-people-tags" aria-label={label+' selected'}>{selected.map(personId=>{const p=directoryPerson(state,personId);return <Control type="button" key={personId} className="memory-person-tag" disabled={disabled} onClick={()=>remove(personId)} aria-label={'Remove '+(p?.name||'unavailable person')}><Avatar member={p}/><span>{p?.name||'Unavailable person'}{p?.personKind==='ancestor'&&<small> · In loving memory</small>}</span><Glyph name="close"/></Control>})}</div>}
  <input id={id} type="search" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'} aria-activedescendant={open&&choices.length?id+'-option-'+activeIndex:undefined} aria-describedby={id+'-help'} required={required&&!selected.length} value={query} placeholder={placeholder} disabled={disabled} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true)}} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false)}
   else if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,choices.length-1))}
   else if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(i-1,0))}
   else if(e.key==='Enter'){e.preventDefault();if(open&&choices[activeIndex])choose(choices[activeIndex]);else setOpen(true)}
  }}/>
  <p id={id+'-help'} className="field-help">{help||(purpose==='ancestral-head'?'Choose an ancestor from the family tree.':purpose==='tag'?'Choose family members or ancestors from the directory and tree.':'Choose a person from the family directory.')}</p>
  {open&&<div className="member-picker-options" style={{maxHeight:'min(18rem, 40dvh)',overflowY:'auto'}}><div id={id+'-list'} role="listbox" aria-label={label} aria-multiselectable={multiple||undefined}>{choices.map((person,index)=><Control type="button" id={id+'-option-'+index} key={person.id} role="option" aria-label={person.name+(person.personKind==='ancestor'?' · In loving memory':'')} tabIndex={-1} className={'list-row member-picker-option'+(activeIndex===index?' is-active':'')} aria-selected={selected.includes(person.id)} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(person)}><Avatar member={person}/><span><strong>{person.name}</strong>{person.personKind==='ancestor'&&<small className="muted">In loving memory</small>}</span>{selected.includes(person.id)&&<span aria-hidden="true">✓</span>}</Control>)}</div>{!choices.length&&<p role="status" className="muted">{emptyText}</p>}{all.length>choices.length&&<p className="field-help">{all.length} matches. Keep typing to narrow the list.</p>}</div>}
 </div>
}
