import React,{useState} from 'react';
import {Button,Control,useApp} from './ui-core.jsx';
import {ChoiceControl} from './choice-control.jsx';
import {isPreviewLeader} from './member-view-model.js';
import './member-view.css';
export function MemberViewControls({onChange}){
 const {state,data}=useApp(),[error,setError]=useState('');
 if(state.mode==='preview')return <div className="member-view-controls"><ChoiceControl label="Preview role" value={isPreviewLeader(state)?'leader':'member'} disabled={data.pending} options={[{value:'member',label:'Member'},{value:'leader',label:'Leader'}]} onChange={async value=>{if(data.pending)return;onChange?.();await data.dispatch({type:'SET_PREVIEW_ROLE_VIEW',value})}}/><p className="small muted">Fictional preview only. Your real account permissions stay unchanged.</p></div>;
 if(data.session?.canViewAsMember!==true)return null;
 async function change(){setError('');onChange?.();if(!await data.setMemberView(!state.viewAsMember))setError('Finish any pending save, then try again.')}
 return <div className="member-view-controls live-member-view"><Control type="button" className="icon-button member-view-eye" aria-label={state.viewAsMember?'Return to Leader view':'View as ordinary member'} aria-pressed={!!state.viewAsMember} disabled={data.pending} onClick={change}><svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></Control>{state.viewAsMember&&<p className="small muted">Member view uses member-filtered reads and is read-only. Return to Leader view to make changes.</p>}{error&&<p role="alert">{error}</p>}</div>;
}
export function MemberViewNotice(){const {state,data}=useApp();return state.viewAsMember?<section className="member-view-notice" role="status"><span>Viewing as an ordinary member · Read-only</span><Button secondary disabled={data.pending} onClick={()=>data.setMemberView(false)}>Return to Leader view</Button></section>:null}
