import React,{useRef,useState} from 'react';
import {Control,Glyph,Popover} from './ui-core.jsx';
import {installDevice} from './install-guide-selection.js';
import {DeviceReset} from './device-reset.jsx';
export function OnboardingMore({onPreview,onInstall}){
 const [open,setOpen]=useState(false),[help,setHelp]=useState(false),[reset,setReset]=useState(false),anchor=useRef(null);
 const close=()=>{setOpen(false);setHelp(false);anchor.current?.focus()};
 const row=(icon,label,action)=><Control type="button" className="onboarding-more-row" onClick={action}><Glyph name={icon}/><span>{label}</span></Control>;
 return <div className="onboarding-more"><Control ref={anchor} type="button" className="button secondary onboarding-more-trigger" data-button-level="secondary" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setHelp(false);setOpen(value=>!value)}}><Glyph name="arrow"/><span>More</span></Control><Popover open={open} onClose={close} anchor={anchor.current} kind="top-menu" className="onboarding-more-pop"><div className="onboarding-more-content" role="dialog" aria-label={help?'Help signing in':'More options'}>{help?<><h3>Help signing in</h3><p>Use Google, Microsoft, Yahoo, or your email. If you already have an account, use the same method you used before.</p><p>For an email code, check Junk or Spam too. Use the newest code we send you.</p>{row('back','Back to options',()=>setHelp(false))}</>:<>{row('info','Help signing in',()=>setHelp(true))}{installDevice()&&row('download','Install GW',()=>{close();onInstall(anchor.current)})}<div className="onboarding-more-divider"/>{row('grid','Explore preview',()=>{close();onPreview()})}<div className="onboarding-more-divider"/>{row('refresh','Reset GW on this device',()=>{close();setReset(true)})}</>}</div></Popover>{reset&&<DeviceReset onClose={()=>{setReset(false);anchor.current?.focus()}}/>}</div>;
}
