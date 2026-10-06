import React,{useId,useLayoutEffect,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import './view-switcher.css';
export function ViewSwitcher({label,options,value,onChange,className='',panelId,disabled=false,tourTargets={}}){
 const id=useId(),root=useRef(null),buttons=useRef([]),[compact,setCompact]=useState(false),[slider,setSlider]=useState({left:0,width:0}),choices=options.map(option=>Array.isArray(option)?{value:option[0],label:option[1],icon:option[2]}:option),index=Math.max(0,choices.findIndex(option=>option.value===value));
 useLayoutEffect(()=>{
  const element=root.current;if(!element)return;
  const measure=()=>{const required=buttons.current.reduce((total,button)=>total+(button?Math.max(64,(button.querySelector('.view-switcher-label')?.scrollWidth||0)+48):0),0)+12;setCompact(required>element.clientWidth);const selected=buttons.current[index];if(selected)setSlider({left:selected.offsetLeft,width:selected.offsetWidth})};
  measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(element);buttons.current.forEach(button=>button&&observer?.observe(button));window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure)};
 },[index,choices.length]);
 const move=(event,position)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||disabled)return;event.preventDefault();const direction=document.documentElement.dir==='rtl'?-1:1,next=event.key==='Home'?0:event.key==='End'?choices.length-1:(position+(event.key==='ArrowRight'?direction:-direction)+choices.length)%choices.length;onChange(choices[next].value);buttons.current[next]?.focus()};
 return <div ref={root} className={'view-switcher '+className+(compact?' is-compact':'')} role="tablist" aria-label={label} style={{'--view-slider-left':slider.left+'px','--view-slider-width':slider.width+'px'}}><span className="view-switcher-slider" aria-hidden="true"/>{choices.map((option,position)=><Control ref={element=>buttons.current[position]=element} key={option.value} id={id+'-'+option.value} data-gw-tour={tourTargets[option.value]} type="button" role="tab" aria-label={option.label} aria-selected={value===option.value} aria-controls={value===option.value?panelId:undefined} disabled={disabled||option.disabled} tabIndex={value===option.value?0:-1} onKeyDown={event=>move(event,position)} onClick={()=>onChange(option.value)}>{option.icon&&<Glyph name={option.icon}/>}<span className="view-switcher-label">{option.label}</span></Control>)}</div>;
}
