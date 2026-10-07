import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createToastController} from './toast-model.js';

export function useToast({scopeKey='',routeKey='',clock,documentRef=globalThis.document,windowRef=globalThis.window}={}){
 const [snapshot,setSnapshot]=useState(()=>({scopeKey,toast:null}));
 const controllerRef=useRef(null);
 if(!controllerRef.current)controllerRef.current=createToastController({scopeKey,clock,onChange:setSnapshot});
 const controller=controllerRef.current,owner=useRef({scopeKey,token:{}});
 if(owner.current.scopeKey!==scopeKey)owner.current={scopeKey,token:{}};
 const token=owner.current.token;
 // Synchronous render masking prevents an old account's notice from painting.
 // The token also rejects a captured setter after A -> B -> A account changes.
 const setToast=useCallback(input=>owner.current.token===token?controller.show(input,scopeKey):false,[controller,scopeKey,token]);
 useLayoutEffect(()=>{controller.setScope(scopeKey);},[controller,scopeKey]);
 useEffect(()=>{
  const visibility=()=>controller.setVisible(documentRef?.visibilityState!=='hidden');
  const hide=()=>controller.setVisible(false);
  const resume=()=>{visibility();controller.reconcile();};
  visibility();controller.activate();
  documentRef?.addEventListener('visibilitychange',visibility);
  windowRef?.addEventListener('pagehide',hide);
  windowRef?.addEventListener('pageshow',resume);
  windowRef?.addEventListener('focus',resume);
  return()=>{
   documentRef?.removeEventListener('visibilitychange',visibility);
   windowRef?.removeEventListener('pagehide',hide);
   windowRef?.removeEventListener('pageshow',resume);
   windowRef?.removeEventListener('focus',resume);
   controller.deactivate();
  };
 },[controller,documentRef,windowRef]);
 useEffect(()=>{controller.setRoute(routeKey);},[controller,routeKey]);
 return {toast:snapshot.scopeKey===scopeKey?snapshot.toast:null,setToast,dismissToast:controller.dismiss,pauseToast:controller.pause,resumeToast:controller.resume};
}
