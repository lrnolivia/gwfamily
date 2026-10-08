import {photoFrameStyle} from './photo-framing-model.js';
import './photo-framing.css';
import React,{createContext,useContext,useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {LiquidGlass,LiquidGlassFilter} from '@sohumsuthar/liquid-glass';
import {buildDisplacementLUT,renderDisplacementMap} from '@sohumsuthar/liquid-glass/optics';
import {useLiquidGlassEffects} from '@sohumsuthar/liquid-glass/hooks';
import {useLiquidLens} from '@sohumsuthar/liquid-glass/hooks/useLiquidLens';
import paths from './glyph-paths.js';
import './member-badges.css';
import './filter-platter.css';
import {useFloatingPanelPosition} from './floating-panel-position.js';
import {bindViewportBounds} from './viewport-bounds.js';
import {bindNotificationPopoverPlacement} from './notification-popover-geometry.js';

export const AppContext=createContext(null);
export const FloatingSurfaceContext=createContext(false);
export const useApp=()=>useContext(AppContext);
// The loew.fi Send control uses the same package lens, interactive gel and four
// material layers. Keep the native button as the host so existing layout and
// keyboard semantics survive; Android returns only the native button.
export const Control=React.forwardRef(function Control({className='',children,glassLens,...props},forwardedRef){
  if(/^Close\b/.test(props['aria-label']||''))className+=' quiet-close';
  const floating=useContext(FloatingSurfaceContext),app=useApp(),platform=app?.platform||'ios',ref=useRef(null),glass=!floating&&platform==='ios'&&/\b(button|send-button|icon-button|filter-trigger)\b/.test(className)&&!/\b(list-row|brand|avatar)\b/.test(className);
  const lens=glass&&(glassLens??/\b(button|send-button|icon-button|fab)\b/.test(className));
  const radius=/\b(icon-button|send-button|fab|avatar)\b/.test(className)?28:/\bbutton\b/.test(className)?25:40;
  const lensState=useLiquidLens(lens?ref:{current:null},{bezel:6,refraction:.9,dispersion:0,radius});
  if(app?.data?.pending&&/\b(button|send-button)\b/.test(className))props.disabled=true;
  const setRef=useCallback(node=>{ref.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node},[forwardedRef]);
  if(!glass)return React.createElement('button',{...props,ref:setRef,className:[className,floating?'on-floating-surface':''].filter(Boolean).join(' ')},children);
  return React.createElement('button',{...props,ref:setRef,
    className:['liquid-glass','lg-interactive','gw-optic-control',className].filter(Boolean).join(' '),
    style:{...props.style,...(lens&&lensState.filter?{'--lg-refract':lensState.filter}:null)}},
    lens?lensState.svg:null,
    React.createElement('span',{key:'shadow',className:'glass-shadow','aria-hidden':'true'}),
    React.createElement('span',{key:'effect',className:'liquid-glass-effect','aria-hidden':'true'}),
    React.createElement('span',{key:'tint',className:'liquid-glass-tint','aria-hidden':'true'}),
    React.createElement('span',{key:'shine',className:'liquid-glass-shine','aria-hidden':'true'}),
    React.createElement('span',{key:'content',className:'liquid-glass-content gw-optic-content'},children));
});
export function Glyph({name,className=''}){return <svg className={'glyph '+className} viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]||paths.arrow}/></svg>}
export function Avatar({member,size}){return member?.photo?<span className={'avatar avatar-photo '+(size||'')}><img src={member.photo} style={photoFrameStyle(member.photoFrame)} alt=""/></span>:
  <span className={'avatar '+(size||'')}>{member?.name?.slice(0,1)||'?'}</span>}
export function MemberBadges({member,interactive=false,passive=false,id}){
  const {state,go}=useApp();
  // Never build membership or leader metadata from a management fallback record
  // or an ancestor. The existing member state is the authorized identity source.
  const person=member?.personKind==='ancestor'?null:(state.members||[]).find(p=>p.id===member?.id);
  if(!person)return null;
  const household=(state.households||[]).find(h=>h.memberIds?.includes(person.id)),group=(state.groups||[]).find(g=>g.id===person.groupId),destination=household?{type:'household',id:household.id}:group?{type:'group',id:group.id}:null,groupName=household?.name||group?.name,groupLabel=(household?'Household: ':'Family group: ')+groupName;
  const canOpen=interactive&&!passive,circleName=person.circle==='loved'?'Loved Ones':'Family';
  return <span id={id} className="membership-chips">
    {person.circle&&<span className="membership-chip" title={circleName}><Glyph name={person.circle==='loved'?'heart':'people'}/><span className="membership-label">{circleName}</span></span>}
    {destination&&(canOpen?<Control type="button" className="membership-chip-control" aria-label={groupLabel} title={groupName} onClick={event=>{event.stopPropagation();go(destination)}}><span className="membership-chip membership-group"><Glyph name="home"/><span className="membership-label">{groupName}</span></span></Control>:<span className="membership-chip membership-group" title={groupLabel}><Glyph name="home"/><span className="membership-label">{groupName}</span></span>)}
    {person.leader&&<span className="membership-chip membership-shield" role="img" aria-label="Family leader" title="Family leader"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM8.5 11.8l2.3 2.3 4.7-4.7"/></svg></span>}
  </span>
}
export function Button({children,onClick,secondary=false,level,className='',icon,...props}){
 const ref=useRef(null),requested=level||(secondary?'secondary':'primary');
 useEffect(()=>{
  const panel=ref.current?.closest('.card,.panel');if(!panel)return;
  const actions=[...panel.querySelectorAll('.button')].filter(button=>button.closest('.card,.panel')===panel);
  for(const action of actions)action.dataset.buttonLevel=actions.length===1&&!action.matches('.danger,.destructive,[data-destructive]')?'primary':action.dataset.requestedLevel;
 });
 return <Control ref={ref} type="button" data-requested-level={requested} data-button-level={requested} className={'button '+(requested==='secondary'?'secondary ':'')+className} onClick={onClick} {...props}>{icon&&<Glyph name={icon}/>}<span>{children}</span></Control>
}
export function ActionRow({icon,title,detail,onClick,tourTarget}){return <Control type="button" className="list-row" data-gw-tour={tourTarget} onClick={onClick}><Glyph name={icon}/><span><strong>{title}</strong><p>{detail}</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>}
export function formatTime(ms){const d=new Date(ms),delta=Math.max(0,Date.now()-ms);if(delta<60000)return 'now';if(delta<3600000)return Math.floor(delta/60000)+'m';
  if(delta<86400000)return Math.floor(delta/3600000)+'h';if(delta<604800000)return Math.floor(delta/86400000)+'d';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d)}
export function GlassSystem(){
  useLiquidGlassEffects({cursor:true,spotlight:false,reveal:false,scroll:false});
  const map=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');const image=ctx.createImageData(512,512);renderDisplacementMap(image.data,{width:512,height:512,radius:48,bezel:48,lut:buildDisplacementLUT(255).lut,channelDepth:127});ctx.putImageData(image,0,0);return canvas.toDataURL('image/png')},[]);
  return <LiquidGlassFilter displacementMap={map}/>;
}
export function useViewport(){
  useEffect(()=>bindViewportBounds(),[]);
}
export function Popover({open,onClose,anchor,children,kind='menu',className='',style}) {
  const glass=useApp()?.platform!=='android';
  const id=useId().replace(/:/g,'');
  useEffect(()=>{
    const el=document.getElementById(id);if(!el||!open)return;
    if(kind==='notifications'){
      if(!el.matches(':popover-open'))el.showPopover();
      const cleanup=bindNotificationPopoverPlacement(el,anchor,onClose);
      return ()=>{cleanup();if(el.matches(':popover-open'))el.hidePopover()};
    }
    const place=()=>{const v=window.visualViewport,r=anchor?.getBoundingClientRect?.();
      const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
      const w=Math.min(el.offsetWidth||300,width-24),h=Math.min(el.offsetHeight||300,height-24);
      const x=Math.max(left+12,Math.min(r?.left??left+12,left+width-w-12));
      const below=(r?.bottom??top)+8,above=(r?.top??top)-h-8;
      const y=below+h<=top+height-12?below:above>=top+12?above:Math.max(top+12,top+height-h-12);
      el.style.left=x+'px';el.style.top=y+'px';if(r)el.style.transformOrigin=(r.left+r.width/2-x)+'px '+(r.top+r.height/2-y)+'px';el.style.maxHeight=(height-24)+'px';el.style.maxWidth=(width-24)+'px'};
    if(!el.matches(':popover-open'))el.showPopover();place();const observer=new ResizeObserver(place);observer.observe(el);
    const follow=()=>{if(!className.includes('member-mini-pop'))return;const r=anchor?.getBoundingClientRect?.();if(!anchor?.isConnected||!r||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth){onClose?.();return}place()};window.addEventListener('scroll',follow,true);
    window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
    return ()=>{observer.disconnect();window.removeEventListener('scroll',follow,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);
      if(el.matches(':popover-open'))el.hidePopover()};
  },[id,open,anchor,glass,kind]);
  const options=kind==='nav'?{bezel:16,refraction:1.2,dispersion:5,radius:40}:
    kind==='button'?{bezel:9,refraction:.9,dispersion:3,radius:28}:{bezel:9,refraction:.9,dispersion:2,radius:28};
  const onToggle=e=>{if(e.newState==='closed'&&e.currentTarget.isConnected&&document.getElementById(id)===e.currentTarget&&!e.currentTarget.matches(':popover-open'))onClose?.()};
  const surfaceClass=(kind==='notifications'?'notification-popover ':'')+className;
  return glass?<LiquidGlass id={id} style={style} popover="auto" lens lensOptions={options} className={'gw-glass-menu '+surfaceClass}
    onToggle={onToggle}><FloatingSurfaceContext.Provider value={true}>{children}</FloatingSurfaceContext.Provider></LiquidGlass>:
    <div id={id} style={style} popover="auto" className={'gw-material-menu '+surfaceClass} onToggle={onToggle}><FloatingSurfaceContext.Provider value={true}>{children}</FloatingSurfaceContext.Provider></div>;
}
export function InlineFilters({label,children}){const [open,setOpen]=useState(false),id=useId(),trigger=useRef(null);return <div className={'inline-filters filter-platter '+(open?'is-open':'')} onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus()}}}><Control ref={trigger} className="feed-filter-toggle" aria-label={label} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}><Glyph name="settings"/><span>Filter updates</span><Glyph name="arrow"/></Control><div id={id} className="inline-filter-reveal" inert={!open}><div className="inline-filter-bar">{children}</div></div></div>}
const SheetFormContext=createContext(null);
export function useSheetForm({label=null,busy=false,disabled=false,dirty=false}={}){
 const register=useContext(SheetFormContext),id=useId().replace(/:/g,'')+'-sheet-form';
 useEffect(()=>{if(!register)return;return register({id,label,busy,disabled,dirty})},[register,id,label,busy,disabled,dirty]);
 return id;
}
export function Sheet({title,kind='normal',onClose,children,style,suppressGlobalPending=false,busy=false,completion=null}) {
 const app=useApp(),glass=app?.platform!=='android',ref=useRef(null),titleId=useId().replace(/:/g,'')+'-title';
 const floating=useFloatingPanelPosition(ref);
 const [form,setForm]=useState(null),[confirmDiscard,setConfirmDiscard]=useState(false);
 const register=useCallback(value=>{setForm(value);return()=>setForm(current=>current?.id===value.id?null:current)},[]);
 const locked=busy||Boolean(form?.busy)||Boolean(app?.data?.pending&&!suppressGlobalPending);
 const close=()=>{if(locked)return;if(form?.dirty){setConfirmDiscard(true);return}onClose?.()};
 useEffect(()=>{const el=ref.current;if(el&&!el.open)el.showModal();return()=>{if(el?.open)el.close()}},[]);
 const className=kind==='profile'?'profile-sheet':kind==='comments'?'comments-surface':kind==='post'?'focus-surface':kind==='composer'?'composer-surface':kind==='filter'?'filter-surface':kind==='viewer'?'focus-surface memory-sheet':'';
 const action=completion||form?.label&&{label:form.label,formId:form.id,disabled:form.disabled};
 const content=<FloatingSurfaceContext.Provider value={true}><SheetFormContext.Provider value={register}>
  <div className="sheet-head" {...floating.handle}>{action?<Control type={action.formId?'submit':'button'} form={action.formId} className="icon-button sheet-complete" aria-label={action.label} disabled={locked||action.disabled} onClick={action.onClick}><Glyph name="check"/></Control>:<span className="sheet-action-placeholder" aria-hidden="true"/>}<h2 id={titleId}>{title}</h2><Control type="button" id="close" className="icon-button sheet-close" aria-label="Close dialog" disabled={locked} onClick={close}><Glyph name="close"/></Control></div>
  <div id="sheet-body">{confirmDiscard?<section className="sheet-discard-confirm" role="alert"><h3>Discard unsaved changes?</h3><p>Your saved details will stay unchanged.</p><div className="row"><Button secondary onClick={()=>setConfirmDiscard(false)}>Keep editing</Button><Button onClick={()=>{setConfirmDiscard(false);onClose?.()}}>Discard changes</Button></div></section>:null}{app?.data?.error&&<p className="note" role="alert">{app.data.error}</p>}{locked&&!suppressGlobalPending&&<p role="status" className="small muted">Saving…</p>}<div inert={confirmDiscard||undefined}>{children}</div></div>
 </SheetFormContext.Provider></FloatingSurfaceContext.Provider>;
 return <dialog id="sheet" ref={ref} className={className} style={{...style,...floating.style}} aria-labelledby={titleId}
  onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===ref.current)close()}}>
  {glass?<LiquidGlass lens lensOptions={{bezel:14,refraction:1.05,dispersion:2,radius:32}} className="sheet-glass"><span className="glass-shadow" aria-hidden="true"/>{content}</LiquidGlass>:content}
 </dialog>;
}
