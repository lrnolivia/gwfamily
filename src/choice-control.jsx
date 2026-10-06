import React,{useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';

// Values stay strings, just like a native select. Labels may change without
// changing the stored value; disabled choices remain visible but unavailable.
export function normalizeChoices(options=[]){
 return options.map(option=>typeof option==='object'&&option!==null
  ?{...option,value:String(option.value??''),label:String(option.label??option.value??'')}
  :{value:String(option),label:String(option)});
}
const searchable=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function filterChoices(options,query=''){
 const words=searchable(query).trim().split(/\s+/).filter(Boolean);
 return options.filter(option=>words.every(word=>searchable(`${option.label} ${option.searchText||''}`).includes(word)));
}
export function nextChoiceIndex(options,current,key){
 const enabled=options.map((option,index)=>option.disabled?-1:index).filter(index=>index>=0);
 if(!enabled.length)return -1;
 if(key==='Home')return enabled[0];
 if(key==='End')return enabled.at(-1);
 const index=enabled.indexOf(current),direction=key==='ArrowUp'?-1:1;
 if(index<0)return direction<0?enabled.at(-1):enabled[0];
 return enabled[(index+direction+enabled.length)%enabled.length];
}

function ChoiceMark({checked}){return <svg className="choice-mark" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/>{checked&&<circle className="choice-mark-fill" cx="10" cy="10" r="4"/>}</svg>}

/** Short, stable options use real radio inputs. Search choices use an editable
 * ARIA combobox and a non-modal native popover, including inside a dialog.
 * Manual popover dismissal keeps pointer focus on the searchable input; outside
 * pointer events, blur, Tab, Escape, and selection all close the choices.
 * onChange receives the selected string value; typing never commits a value. */
export function ChoiceControl({label,options=[],value='',onChange,variant='auto',required=false,disabled=false,error='',help='',name,id:providedId,form,placeholder='Choose an option',searchPlaceholder='Search choices',emptyText='No choices match. Try another search.',className='',...aria}){
 const generatedId=useId(),id=providedId||`choice-${generatedId.replace(/:/g,'')}`;
 const normalized=useMemo(()=>normalizeChoices(options),[options]);
 const choices=required?normalized.filter(option=>option.value!==''):normalized;
 const selected=choices.find(option=>option.value===String(value??''));
 const chips=choices.length>0&&(variant==='chips'||variant==='auto'&&choices.length<=4);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(-1),[invalid,setInvalid]=useState(false);
 const root=useRef(null),input=useRef(null),popup=useRef(null),list=useRef(null);
 const matches=useMemo(()=>filterChoices(choices,query),[choices,query]);
 const activeIndex=matches[active]&&!matches[active].disabled?active:nextChoiceIndex(matches,-1,'Home');
 const labelId=id+'-label',helpId=id+'-help',errorId=id+'-error',listId=id+'-list';
 const message=typeof error==='string'&&error?error:invalid?'Choose an option to continue.':'';
 const describedBy=[aria['aria-describedby'],help?helpId:'',message?errorId:''].filter(Boolean).join(' ')||undefined;
 const isInvalid=!!error||invalid||aria['aria-invalid']==='true'||aria['aria-invalid']===true;
 const accessibleName=aria['aria-label'];
 const validSelection=!!selected&&selected.value!==''&&!selected.disabled;
 const close=()=>{setOpen(false);setQuery('')};
 const begin=(last=false)=>{
  if(disabled)return;
  setQuery('');setOpen(true);
  const index=choices.findIndex(option=>option.value===String(value??'')&&!option.disabled);
  setActive(index>=0?index:nextChoiceIndex(choices,-1,last?'End':'Home'));
 };
 const choose=option=>{
  if(disabled||!option||option.disabled)return;
  setInvalid(false);close();onChange?.(option.value);
 };
 useEffect(()=>{if(disabled)close()},[disabled]);
 useEffect(()=>{if(!required||validSelection)setInvalid(false)},[required,validSelection,value]);
 useLayoutEffect(()=>{
  // A search query is not a selection. Native form validation still blocks an
  // unselected required field, even when somebody has typed into the search.
  input.current?.setCustomValidity(required&&!validSelection?'Choose an option to continue.':'');
 },[required,validSelection]);
 useLayoutEffect(()=>{
  const element=popup.current,anchor=input.current;if(chips||!element||!anchor||!open)return;
  const place=()=>{
   const view=window.visualViewport,rect=anchor.getBoundingClientRect();
   const left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
   if(!anchor.isConnected||rect.bottom<top||rect.top>top+height){close();return}
   const spaceBelow=top+height-rect.bottom-12,spaceAbove=rect.top-top-12;
   const below=spaceBelow>=Math.min(280,height*.45)||spaceBelow>=spaceAbove;
   const maxHeight=Math.max(80,Math.min(340,below?spaceBelow:spaceAbove));
   element.style.width=Math.min(Math.max(rect.width,260),width-24)+'px';
   element.style.maxHeight=maxHeight+'px';
   element.style.left=Math.max(left+12,Math.min(rect.left,left+width-element.offsetWidth-12))+'px';
   element.style.top=(below?rect.bottom+6:Math.max(top+12,rect.top-element.offsetHeight-6))+'px';
  };
  if(typeof element.showPopover==='function'&&!element.matches(':popover-open'))element.showPopover();
  place();
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(place):null;resize?.observe(element);
  const outside=event=>{if(!root.current?.contains(event.target))close()};
  window.addEventListener('pointerdown',outside,true);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  return()=>{resize?.disconnect();window.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);if(typeof element.hidePopover==='function'&&element.matches(':popover-open'))element.hidePopover()};
 },[open,chips]);
 useEffect(()=>{
  const viewport=list.current,option=viewport?.querySelector('[data-active="true"]');
  if(!open||!viewport||!option)return;
  const top=option.offsetTop-viewport.offsetTop,bottom=top+option.offsetHeight;
  if(top<viewport.scrollTop)viewport.scrollTop=top;
  else if(bottom>viewport.scrollTop+viewport.clientHeight)viewport.scrollTop=bottom-viewport.clientHeight;
 },[open,activeIndex,query]);
 const feedback=<>{help&&<p id={helpId} className="choice-help">{help}</p>}{message&&<p id={errorId} className="choice-error" role="alert">{message}</p>}</>;
 if(chips)return <fieldset className={`choice-control choice-control-chips ${className}`} disabled={disabled} aria-invalid={isInvalid||undefined} aria-describedby={describedBy} aria-label={accessibleName}>
  <legend id={labelId}>{label}{required&&<span className="choice-required">Required</span>}</legend>
  <div className="choice-chips">{choices.map((option,index)=><label className="choice-chip" key={option.value}>
   <input type="radio" id={id+'-'+index} name={name||id} form={form} value={option.value} checked={String(value??'')===option.value} disabled={disabled||option.disabled} required={required} aria-describedby={describedBy} aria-invalid={isInvalid||undefined} onInvalid={()=>setInvalid(true)} onChange={()=>choose(option)}/>
   <span className="choice-chip-face"><ChoiceMark checked={String(value??'')===option.value}/><span>{option.label}</span></span>
  </label>)}</div>{!choices.length&&<p className="choice-help">No choices are available yet.</p>}{feedback}
 </fieldset>;
 return <div ref={root} className={`choice-control choice-control-search ${className}`} data-disabled={disabled||undefined} data-invalid={isInvalid||undefined} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close()}}>
  <label id={labelId} htmlFor={id}>{label}{required&&<span className="choice-required">Required</span>}</label>
  <div className="choice-search-field">
   <input ref={input} id={id} type="text" role="combobox" aria-label={accessibleName} aria-labelledby={accessibleName?undefined:labelId} aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&activeIndex>=0?id+'-option-'+activeIndex:undefined} aria-describedby={describedBy} aria-invalid={isInvalid||undefined} aria-required={required||undefined} required={required} disabled={disabled} form={form} autoComplete="off" autoCorrect="off" spellCheck={false} value={open?query:selected?.label||''} placeholder={open?searchPlaceholder:placeholder} onFocus={()=>begin()} onClick={()=>{if(!open)begin()}} onChange={event=>{setQuery(event.target.value);setActive(-1);setOpen(true)}} onInvalid={event=>{event.preventDefault();setInvalid(true);begin();input.current?.focus()}} onKeyDown={event=>{
    if(event.nativeEvent.isComposing)return;
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&(open||event.key.startsWith('Arrow'))){event.preventDefault();if(!open)begin(event.key==='ArrowUp');else setActive(nextChoiceIndex(matches,activeIndex,event.key))}
    else if(event.key==='Enter'&&open){event.preventDefault();choose(matches[activeIndex])}
    else if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close()}
    else if(event.key==='Tab')close();
   }}/>
   <button type="button" className="choice-change" aria-label={(open?'Close choices for ':'Show choices for ')+(accessibleName||label)} aria-expanded={open} aria-controls={listId} disabled={disabled} tabIndex={-1} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(open)close();else{input.current?.focus();begin()}}}>{open?'Done':'Change'}</button>
  </div>
  {name&&<input type="hidden" name={name} form={form} value={String(value??'')} disabled={disabled}/>}
  <div ref={popup} popover="manual" className="choice-popover" data-open={open} data-empty={!matches.length||undefined} onToggle={event=>{if(event.newState==='closed'&&!event.currentTarget.matches(':popover-open'))close()}}>
   <div ref={list} id={listId} className="choice-options" role="listbox" aria-label={accessibleName||label}>
    {matches.map((option,index)=><button key={option.value} id={id+'-option-'+index} type="button" role="option" className="choice-option" tabIndex={-1} aria-selected={option.value===String(value??'')} aria-disabled={option.disabled||undefined} disabled={disabled||option.disabled} data-active={index===activeIndex} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>{if(!option.disabled)setActive(index)}} onClick={()=>choose(option)}><span>{option.label}</span><ChoiceMark checked={option.value===String(value??'')}/></button>)}
   </div>
   {!matches.length&&<p role="status" className="choice-empty">{emptyText}</p>}
   <p className="choice-search-help" aria-hidden="true">{matches.length} {matches.length===1?'choice':'choices'} · Type to find · Enter to choose</p>
  </div>
  {feedback}
 </div>;
}
