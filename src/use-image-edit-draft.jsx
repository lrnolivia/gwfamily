import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui-core.jsx';
import {pageBrowserStorage} from './page-content-model.js';
import {imageDraftKey,readImageDraft,writeImageDraft,removeImageDraft} from './image-edit-recovery.js';
export function useImageEditDraft({page,object,initial,validate}){
 const {state}=useApp(),account=(state.mode==='preview'?'preview:':'live:')+state.selfId,key=useRef(imageDraftKey(account,page,object)),baseline=useRef(JSON.stringify(initial)),storage=useRef(pageBrowserStorage('sessionStorage')),cleared=useRef(false),recovered=useRef(undefined);
 if(recovered.current===undefined)recovered.current=readImageDraft(storage.current,key.current,baseline.current,validate);
 const [value,setValue]=useState(()=>recovered.current||initial),[storageError,setStorageError]=useState(''),dirty=JSON.stringify(value)!==baseline.current;
 useEffect(()=>{if(cleared.current)return;if(!dirty){removeImageDraft(storage.current,key.current);return}if(!writeImageDraft(storage.current,key.current,baseline.current,value))setStorageError('This browser cannot keep this image draft. Keep the task open until you apply or cancel it.')},[value,dirty]);
 useEffect(()=>{if(!dirty)return;const protect=event=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)},[dirty]);
 const clear=()=>{cleared.current=true;removeImageDraft(storage.current,key.current)};
 return {value,setValue,clear,storageError,recovered:!!recovered.current};
}
