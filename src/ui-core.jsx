import React,{createContext,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import {LiquidGlass as PackageLiquidGlass,LiquidGlassFilter} from '@sohumsuthar/liquid-glass';
import {nativeGlassOnly} from './glass-capabilities.js';
import {buildDisplacementLUT,renderDisplacementMap} from '@sohumsuthar/liquid-glass/optics';
import {useLiquidGlassEffects} from '@sohumsuthar/liquid-glass/hooks';
import {useLiquidLens} from '@sohumsuthar/liquid-glass/hooks/useLiquidLens';
import paths from './glyph-paths.js';

// Keep a single compositor policy for controls, navigation, popovers, and sheets.
// lens=false alone still uses package CSS's shared SVG filter. Disable that
// reference as well on WebKit while retaining native blur/tint glass layers.
export function LiquidGlass({lens=false,style,...props}) {
  const nativeOnly=nativeGlassOnly();
  return <PackageLiquidGlass {...props} lens={lens&&!nativeOnly} style={nativeOnly?{...style,'--lg-refract':'none'}:style}/>;
}
export const AppContext=createContext(null);
const FloatingSurfaceContext=createContext(false);
export const useApp=()=>useContext(AppContext);
// The loew.fi Send control uses the same package lens, interactive gel and four
// material layers. Keep the native button as the host so existing layout and
// keyboard semantics survive; Android returns only the native button.
export const Control=React.forwardRef(function Control({className='',children,glassLens,...props},forwardedRef){
  const floating=useContext(FloatingSurfaceContext),app=useApp(),platform=app?.platform||'ios',ref=useRef(null),glass=!floating&&platform==='ios'&&/\b(button|send-button|icon-button|filter-trigger)\b/.test(className)&&!/\b(list-row|brand|avatar)\b/.test(className);
  const nativeOnly=nativeGlassOnly(),lens=glass&&!nativeOnly&&(glassLens??/\b(button|send-button|icon-button|fab)\b/.test(className));
  const radius=/\b(icon-button|send-button|fab|avatar)\b/.test(className)?28:/\bbutton\b/.test(className)?25:40;
  const lensState=useLiquidLens(lens?ref:{current:null},{bezel:6,refraction:.9,dispersion:0,radius});
  if(app?.data?.pending&&/\b(button|send-button)\b/.test(className))props.disabled=true;
  const setRef=node=>{ref.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node};
  if(!glass)return React.createElement('button',{...props,ref:setRef,className:[className,floating?'on-floating-surface':''].filter(Boolean).join(' ')},children);
  return React.createElement('button',{...props,ref:setRef,
    className:['liquid-glass','lg-interactive','gw-optic-control',className].filter(Boolean).join(' '),
    style:{...props.style,...(nativeOnly?{'--lg-refract':'none'}:lens&&lensState.filter?{'--lg-refract':lensState.filter}:null)}},
    lens?lensState.svg:null,
    React.createElement('span',{key:'shadow',className:'glass-shadow','aria-hidden':'true'}),
    React.createElement('span',{key:'effect',className:'liquid-glass-effect','aria-hidden':'true'}),
    React.createElement('span',{key:'tint',className:'liquid-glass-tint','aria-hidden':'true'}),
    React.createElement('span',{key:'shine',className:'liquid-glass-shine','aria-hidden':'true'}),
    React.createElement('span',{key:'content',className:'liquid-glass-content gw-optic-content'},children));
});
export function Glyph({name,className=''}){return <svg className={'glyph '+className} viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]||paths.arrow}/></svg>}
export function Avatar({member,size}){return member?.photo?<img className={'avatar '+(size||'')} src={member.photo} alt=""/>:
  <span className={'avatar '+(size||'')}>{member?.name?.slice(0,1)||'?'}</span>}
export function MemberBadges({member,interactive=false}){
  const {state,go}=useApp();
  if(!member)return null;
  const household=(state.households||[]).find(h=>h.memberIds.includes(member.id));const group=state.groups.find(g=>g.id===member.groupId);
  return <span className="membership-chips">
    {member.circle&&<span className="membership-chip"><Glyph name={member.circle==='loved'?'heart':'people'}/>{member.circle==='loved'?'Loved Ones':'Family'}</span>}
    {household?<Control type="button" className="membership-chip membership-group" aria-label={'Household: '+household.name} onClick={e=>{e.stopPropagation();go({type:'household',id:household.id})}}><Glyph name="home"/>{household.name}</Control>:group&&(interactive?<Control type="button" className="membership-chip membership-group" onClick={e=>{e.stopPropagation();go({type:'group',id:group.id})}}><Glyph name="home"/>{group.name}</Control>:<span className="membership-chip membership-group"><Glyph name="home"/>{group.name}</span>)}
    {member.leader&&<span className="membership-chip membership-shield" role="img" aria-label="Family leader" title="Family leader"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM8.5 11.8l2.3 2.3 4.7-4.7"/></svg></span>}
  </span>
}
export function Button({children,onClick,secondary=false,className='',icon,...props}){return <Control type="button" className={'button '+(secondary?'secondary ':'')+className} onClick={onClick} {...props}>{icon&&<Glyph name={icon}/>}<span>{children}</span></Control>}
export function ActionRow({icon,title,detail,onClick}){return <Control type="button" className="list-row" onClick={onClick}><Glyph name={icon}/><span><strong>{title}</strong><p>{detail}</p></span><span className="arrow"><Glyph name="arrow"/></span></Control>}
export function formatTime(ms){const d=new Date(ms),delta=Math.max(0,Date.now()-ms);if(delta<60000)return 'now';if(delta<3600000)return Math.floor(delta/60000)+'m';
  if(delta<86400000)return Math.floor(delta/3600000)+'h';if(delta<604800000)return Math.floor(delta/86400000)+'d';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d)}
export function GlassSystem(){
  useLiquidGlassEffects({cursor:true,spotlight:false,reveal:false,scroll:false});
  const nativeOnly=nativeGlassOnly();
  const map=useMemo(()=>{if(nativeOnly)return null;const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');const image=ctx.createImageData(512,512);renderDisplacementMap(image.data,{width:512,height:512,radius:48,bezel:48,lut:buildDisplacementLUT(255).lut,channelDepth:127});ctx.putImageData(image,0,0);return canvas.toDataURL('image/png')},[nativeOnly]);
  return <LiquidGlassFilter displacementMap={map}/>;
}
export function useViewport(){
  useEffect(()=>{
    const update=()=>{const v=window.visualViewport;const root=document.documentElement;
      root.style.setProperty('--vv-left',(v?.offsetLeft||0)+'px');
      root.style.setProperty('--vv-top',(v?.offsetTop||0)+'px');
      root.style.setProperty('--vv-width',(v?.width||innerWidth)+'px');
      root.style.setProperty('--vv-height',(v?.height||innerHeight)+'px')};
    update();window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
    return ()=>{window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update)};
  },[]);
}
export function Popover({open,onClose,anchor,children,kind='menu',className='',style}) {
  const glass=useApp()?.platform!=='android';
  const id=useId().replace(/:/g,'');
  useEffect(()=>{
    const el=document.getElementById(id);if(!el||!open)return;
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
  },[id,open,anchor,glass]);
  const options=kind==='nav'?{bezel:16,refraction:1.2,dispersion:5,radius:40}:
    kind==='button'?{bezel:9,refraction:.9,dispersion:3,radius:28}:{bezel:9,refraction:.9,dispersion:2,radius:28};
  const onToggle=e=>{if(e.newState==='closed'&&e.currentTarget.isConnected&&document.getElementById(id)===e.currentTarget&&!e.currentTarget.matches(':popover-open'))onClose?.()};
  return glass?<LiquidGlass id={id} style={style} popover="auto" lens={open} lensOptions={options} className={'gw-glass-menu '+className}
    onToggle={onToggle}><FloatingSurfaceContext.Provider value={true}>{children}</FloatingSurfaceContext.Provider></LiquidGlass>:
    <div id={id} style={style} popover="auto" className={'gw-material-menu '+className} onToggle={onToggle}><FloatingSurfaceContext.Provider value={true}>{children}</FloatingSurfaceContext.Provider></div>;
}
export function InlineFilters({label,children}){const [open,setOpen]=useState(false),id=useId();return <div className={'inline-filters '+(open?'is-open':'')}><Control className="filter-trigger" aria-label={label} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}><Glyph name="settings"/></Control><div id={id} className="inline-filter-reveal" inert={!open}><div className="inline-filter-bar">{children}</div></div></div>}
export function Sheet({title,kind='normal',onClose,children,style}) {
  const app=useApp(),glass=app?.platform!=='android';
  const ref=useRef(null);
  useEffect(()=>{const el=ref.current;if(el&&!el.open)el.showModal();return ()=>{if(el?.open)el.close()}},[]);
  const className=kind==='profile'?'profile-sheet':kind==='comments'?'comments-surface':kind==='post'?'focus-surface':kind==='composer'?'composer-surface':kind==='filter'?'filter-surface':kind==='viewer'?'focus-surface memory-sheet':'';
  const content=<FloatingSurfaceContext.Provider value={true}><div className="sheet-head"><h2 id="sheet-title">{title}</h2><Control type="button" id="close" className="icon-button" aria-label="Close dialog" onClick={onClose}><Glyph name="close"/></Control></div>
    <div id="sheet-body">{app?.data?.error&&<p className="note" role="alert">{app.data.error}</p>}{app?.data?.pending&&<p role="status" className="small muted">Saving…</p>}{children}</div></FloatingSurfaceContext.Provider>;
  return <dialog id="sheet" ref={ref} className={className} style={style} aria-labelledby="sheet-title"
    onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current)onClose()}}>
    {glass?<LiquidGlass lens lensOptions={{bezel:14,refraction:1.05,dispersion:2,radius:32}} className="sheet-glass"><span className="glass-shadow" aria-hidden="true"/>{content}</LiquidGlass>:content}
  </dialog>;
}
