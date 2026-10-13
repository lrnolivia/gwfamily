import React,{forwardRef,useEffect,useRef,useState} from 'react';
import {Control,Avatar} from './ui-core.jsx';
import {optionsTipKey,claimOptionsTip} from './profile-options-tip.js';
import './profile-options-trigger.css';
export const ProfileOptionsTrigger=forwardRef(function ProfileOptionsTrigger({member,mode,accountId,eligible,expanded,onClick},ref){
 const key=eligible?optionsTipKey(mode,accountId):null,claimed=useRef(new Set()),[shown,setShown]=useState(null);
 useEffect(()=>{if(!key||claimed.current.has(key))return;claimed.current.add(key);if(!claimOptionsTip(localStorage,key))return;setShown(key);const timer=setTimeout(()=>setShown(previous=>previous===key?null:previous),12000);return()=>clearTimeout(timer)},[key]);
 const visible=!!key&&shown===key&&!expanded;
 return <span className="profile-options-trigger"><Control ref={ref} className={'avatar'+(visible?' options-intro-glow':'')} aria-label="Profile and appearance" aria-expanded={expanded} aria-describedby={visible?'gw-options-tooltip':undefined} onClick={event=>{setShown(null);onClick?.(event)}}><Avatar member={member}/></Control>{visible&&<span id="gw-options-tooltip" className="profile-options-tooltip" role="tooltip">Your options are here</span>}</span>
});
