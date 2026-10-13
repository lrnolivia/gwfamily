import React,{useEffect,useRef,useState} from 'react';
import {Button,useApp,useSheetForm} from './ui-core.jsx';
import {ImageUploadControl} from './image-upload-control.jsx';
import {mayEditMemorial} from './memorial-page-model.mjs';
import './memorial-edit-form.css';
export function MemorialEditForm({id}){
 const {state,data,dispatch,openSheet}=useApp(),person=(state.memorials||[]).find(p=>p.id===id),[value,setValue]=useState(()=>({...person})),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),initial=useRef(JSON.stringify(person)),scope=state.mode+':'+state.selfId+':'+id,scopeRef=useRef(scope);
 scopeRef.current=scope;useEffect(()=>()=>{scopeRef.current=null},[]);
 const editable=person&&mayEditMemorial(state,person),dirty=JSON.stringify(value)!==initial.current,formId=useSheetForm({label:editable?'Save memorial':null,busy,disabled:busy||!value.name?.trim(),dirty});
 const set=(key,next)=>setValue(v=>({...v,[key]:next}));
 async function upload(files){if(lock.current||!editable||!files.length)return;lock.current=true;setBusy(true);setError('');const expected=scope;try{const next=await data.upload(files[0]);if(scopeRef.current===expected)set('photo',next.url||next.dataUrl)}catch(e){if(scopeRef.current===expected)setError(e.message||'The photo could not be uploaded.')}finally{lock.current=false;if(scopeRef.current===expected)setBusy(false)}}
 async function save(event){event.preventDefault();if(lock.current||!editable)return;const year=v=>!v||/^\d{4}$/.test(String(v));if(!year(value.birthYear)||!year(value.deathYear)){setError('Enter four-digit years, or leave them blank.');return}if(value.birthYear&&value.deathYear&&Number(value.deathYear)<Number(value.birthYear)){setError('The year of passing cannot be before the birth year.');return}lock.current=true;setBusy(true);setError('');const expected=scope;try{const ok=await dispatch({type:'SAVE_MEMORIAL',memorial:{...value,name:value.name.trim(),quote:(value.quote||'').trim()}});if(scopeRef.current!==expected)return;if(ok===false)setError('Your memorial was not saved. Your changes are still here.');else openSheet(null)}catch(e){if(scopeRef.current===expected)setError(e.message||'The memorial could not be saved.')}finally{lock.current=false;if(scopeRef.current===expected)setBusy(false)}}
 if(!editable)return <p>This memorial cannot be edited by your account.</p>;
 return <form id={formId} className="gw-form memorial-edit-form form-density-scope" onSubmit={save} aria-busy={busy}>
  <p className="field-help">Share confirmed details. Leave anything you don’t know blank.</p>
  <div className="form-image-intro"><div className="form-image-control"><ImageUploadControl label="Memorial photo" src={value.photo||''} alt={value.name||'Memorial portrait'} shape="profile" accept="image/png,image/jpeg,image/webp,image/gif" onFiles={upload} busy={busy}/></div><div className="form-image-fields"><label>Name<input required maxLength={120} value={value.name||''} disabled={busy} onChange={e=>set('name',e.target.value)}/></label><label>Maiden name <span className="field-optional">Optional</span><input maxLength={120} value={value.maidenName||''} disabled={busy} onChange={e=>set('maidenName',e.target.value)}/></label></div></div>
  <div className="memorial-years"><label>Birth year<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={value.birthYear||''} disabled={busy} onChange={e=>set('birthYear',e.target.value)}/></label><label>Year of passing<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={value.deathYear||''} disabled={busy} onChange={e=>set('deathYear',e.target.value)}/></label></div>
  <label>Quote <span className="field-optional">Optional</span><textarea rows={3} maxLength={1000} value={value.quote||''} placeholder="Words you want to remember" disabled={busy} onChange={e=>set('quote',e.target.value)}/></label>
  <label>Family story <span className="field-optional">Optional</span><textarea rows={5} maxLength={10000} value={value.story||''} disabled={busy} onChange={e=>set('story',e.target.value)}/></label>
  <label className="memorial-color-field">Profile color<input type="color" value={/^#[0-9a-f]{6}$/i.test(value.profileColor||'')?value.profileColor:'#387b51'} disabled={busy} onChange={e=>set('profileColor',e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}<Button type="submit" disabled={busy||!value.name?.trim()}>{busy?'Saving…':'Save memorial'}</Button>
 </form>;
}
