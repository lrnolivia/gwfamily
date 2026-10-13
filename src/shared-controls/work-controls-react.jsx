import React,{useId,useRef,useState} from 'react';
import {workControlGlyph,controlBarVariants} from './work-controls.js';

export function SharedControlGlyph({name}) {
 return <span className="filter-shared-glyph" aria-hidden="true" dangerouslySetInnerHTML={{__html:workControlGlyph(name)}}/>;
}

/** Configurable, domain-free adapter. Never owns backend state or actions. */
export function BrowseControls({variant='work',label='Browse',search='',onSearch,placeholder,searchLabel,views,view,onView,renderViewIcon,filters,organize,filterTitle='Filter & sort',organizeTitle='Organize',organizeIcon='check',filterHint='Your list updates as you choose.',organizeHint='Choose an action to continue.',doneLabel='Done',defaultOpen=false,allowMultipleOpen=true,children}) {
 const id=useId(),filterTrigger=useRef(null),organizeTrigger=useRef(null);
 const defaults=controlBarVariants[variant]||controlBarVariants.work,options=views??defaults.viewOptions;
 const [open,setOpen]=useState(()=>new Set(Array.isArray(defaultOpen)?defaultOpen:defaultOpen===true?['filters']:typeof defaultOpen==='string'?[defaultOpen]:[]));
 function close(name) {setOpen(previous=>{const next=new Set(previous);next.delete(name);return next;});(name==='filters'?filterTrigger:organizeTrigger).current?.focus();}
 function toggle(name) {setOpen(previous=>{const next=allowMultipleOpen?new Set(previous):new Set();previous.has(name)?next.delete(name):next.add(name);return next;});}
 function menu(name,title,content,icon) {
  if(content==null||content===false)return null;
  return <div className="work-control-menu" data-control-menu={name}><button ref={name==='filters'?filterTrigger:organizeTrigger} type="button" className="browse-menu-trigger" aria-expanded={open.has(name)} aria-controls={id+'-'+name} onClick={()=>toggle(name)}><SharedControlGlyph name={icon}/><span>{title}</span><SharedControlGlyph name="next"/></button><div id={id+'-'+name} className="work-control-panel browse-control-panel" hidden={!open.has(name)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close(name);}}}>{content}<div className="work-controls-footer"><p>{name==='filters'?filterHint:organizeHint}</p><button type="button" className="work-controls-done" onClick={()=>close(name)}>{doneLabel}<SharedControlGlyph name="check"/></button></div></div></div>;
 }
 return <section className="browse-controls work-view-controls" data-controls-variant={variant} aria-label={label}><div className="work-control-summary"><label className="work-search-compact" htmlFor={id+'-search'}><span className="sr-only">{searchLabel??defaults.searchLabel}</span><input id={id+'-search'} type="search" value={search} placeholder={placeholder??defaults.placeholder} onChange={event=>onSearch?.(event.target.value)}/></label>{options.length>0&&<div className="work-view-switch" role="group" aria-label={label+' layout'}>{options.map(option=><button key={option.value} type="button" title={option.label} aria-label={option.label} aria-pressed={view===option.value} onClick={()=>onView?.(option.value)}>{renderViewIcon?renderViewIcon(option):<SharedControlGlyph name={option.icon}/>}</button>)}</div>}</div><div className={'work-control-pair '+(organize==null||organize===false?'single-control':'')}>{menu('filters',filterTitle,filters,'filter')}{menu('organize',organizeTitle,organize,organizeIcon)}</div>{children}</section>;
}

export function ControlChoiceGroup({label,name,value,onChange,options,renderIcon}) {
 const controls=useRef([]);
 return <div className="work-control-field"><p className="work-control-label">{label}</p><div className="work-control-choices" role="radiogroup" aria-label={label}>{options.map((option,index)=><button ref={element=>{controls.current[index]=element;}} key={option.value} type="button" className="work-choice" data-query={name} role="radio" aria-checked={value===option.value} tabIndex={value===option.value?0:-1} onClick={()=>onChange(option.value)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+options.length)%options.length;onChange(options[next].value);controls.current[next]?.focus();}}>{option.icon&&(renderIcon?renderIcon(option):<SharedControlGlyph name={option.icon}/>)}<span>{option.label}</span></button>)}</div></div>;
}
