import React,{useContext,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AppContext} from './ui-core.jsx';
import {usePageContent} from './page-content.jsx';
import {hasChatDrafts} from './messaging-model.js';
import {watchBuild} from './update-check.js';
import {createReloadController,isEditing} from './update-reload-controller.mjs';
import './update-toast.css';
export function BuildUpdateNotice(){
 const {data,state,messaging}=useContext(AppContext),page=usePageContent();
 const [ready,setReady]=useState(null),[hint,setHint]=useState(''),latest=useRef(null),dirtyForms=useRef(new WeakSet());
 useEffect(()=>watchBuild(setReady),[]);
 latest.current={ready,pending:!!(data.pending||page.pending),drafts:!!(data.hasLocalDrafts||hasChatDrafts(state.selfId)||page.hasUnsavedDrafts),storageSafe:page.storageSafe!==false&&data.draftStorageStatus?.ok!==false&&!data.draftStorageStatus?.omittedMedia&&messaging.draftStorageOk!==false,prepare:page.prepareReload};
 const controller=useRef(null);
 if(!controller.current)controller.current=createReloadController({
  read:()=>({...latest.current,visible:document.visibilityState==='visible',online:navigator.onLine!==false,editing:isEditing(document),dialogOpen:[...document.querySelectorAll('[role="dialog"],dialog[open]')].some(n=>n.getClientRects().length>0),drafts:latest.current.drafts||[...document.forms].some(f=>dirtyForms.current.has(f))}),
  prepare:()=>latest.current.prepare?.(),reload:()=>location.reload(),storage:{getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value)}
 });
 useEffect(()=>{
  const activity=()=>controller.current.activity(),changed=e=>{const form=e.target?.closest?.('form');if(form)dirtyForms.current.add(form);activity();};
  const events=['pointerdown','keydown','focusin','touchstart'];
  events.forEach(e=>document.addEventListener(e,activity,{capture:true,passive:true}));
  document.addEventListener('input',changed,true);document.addEventListener('change',changed,true);
  const timer=setInterval(()=>controller.current.tick(),1000);
  return()=>{clearInterval(timer);events.forEach(e=>document.removeEventListener(e,activity,true));document.removeEventListener('input',changed,true);document.removeEventListener('change',changed,true)};
 },[]);
 if(!ready||typeof document==='undefined')return null;
 const waiting=latest.current.pending||latest.current.drafts||!latest.current.storageSafe;
 return createPortal(<aside className="gw-update-toast" role="status" aria-live="polite"><span>{hint||(waiting?'Update ready. Save your changes first.':'Update ready. Refreshing when you’re idle.')}</span><button type="button" disabled={latest.current.pending} onClick={()=>{if(!controller.current.manual())setHint('Save or close your draft before reloading.')}} aria-label="Reload updated app">Reload</button></aside>,document.body);
}
