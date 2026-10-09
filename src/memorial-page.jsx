import React,{useRef,useState} from 'react';
import {Button,Control,Glyph,Popover,useApp} from './ui-core.jsx';
import {ViewSwitcher} from './view-switcher.jsx';
import {PhotoViewer} from './photo-viewer.jsx';
import {profilePalette} from './profile-model.js';
import {memorialClaims,memorialMemories,memorialYears,mayEditMemorial} from './memorial-page-model.mjs';
import './memorial-page.css';
export function MemorialPage({id}){
 const {state,route,replaceRoute,go,openSheet,theme,personalThemes}=useApp();
 const person=(state.memorials||[]).find(p=>p.id===id),[menu,setMenu]=useState(false),menuRef=useRef(null);
 if(!person)return <section className="stack"><h1>Memorial unavailable</h1><p>This memorial may no longer be shared with you.</p><Button secondary onClick={()=>go({type:'family',tab:'tree'})}>Return to Family</Button></section>;
 const memories=memorialMemories(state,person),claims=memorialClaims(state,id),years=memorialYears(person),tab=route.tab==='tributes'?'tributes':'memories',editable=mayEditMemorial(state,person);
 const quote=typeof person.quote==='string'?person.quote.trim():'';
 return <article className="profile-page memorial-page" style={personalThemes&&person.profileColor?profilePalette(person.profileColor,theme):undefined}>
  <header className="memorial-hero">
   <div className="memorial-cloudscape" style={{'--memorial-cloud-image':"url('/memorial-clouds.png')"}} aria-hidden="true"/>
   {editable&&<Control ref={menuRef} className="memorial-menu-trigger" aria-label="Memorial options" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Glyph name="more"/></Control>}
   <div className="memorial-hero-content">
    {person.photo?<Control className="memorial-portrait" aria-label={'View '+person.name+'’s photo'} onClick={()=>go({type:'photo',section:'memorial-photo',id})}><img src={person.photo} alt=""/></Control>:<div className="memorial-portrait memorial-portrait-empty" aria-label="No portrait added"><Glyph name="user"/></div>}
    <h1>{person.name}</h1>
    {person.maidenName&&<p className="memorial-maiden">née {person.maidenName}</p>}
    {years&&<p className="memorial-lifespan">{years}</p>}
    {quote&&<blockquote className="memorial-quote"><p>{quote}</p></blockquote>}
    <p className="memorial-remembered">Remembered by {claims.length?[...new Set(claims.map(h=>h.name))].join(', '):'the Green & White family'}.</p>
   </div>
  </header>
  <Popover open={menu} onClose={()=>setMenu(false)} anchor={menuRef.current}><div className="memorial-options" role="menu"><button role="menuitem" type="button" onClick={()=>{setMenu(false);openSheet({type:'memorial-edit',id,returnFocus:menuRef.current})}}><Glyph name="edit"/>Edit memorial</button></div></Popover>
  {person.story&&<section className="memorial-life-story"><h2>A life remembered</h2><p>{person.story}</p></section>}
  <ViewSwitcher label="Memorial sections" value={tab} onChange={next=>replaceRoute({...route,tab:next})} options={[['memories','Memories','image'],['tributes','Tributes','heart']]}/>
  {tab==='memories'?<section className="memorial-memories" aria-label="Tagged memories">{memories.length?<div className="memorial-memory-grid">{memories.map(memory=><Control key={memory.id} className="memorial-memory-tile" onClick={()=>go({type:'memory',id:memory.id})} aria-label={memory.title||'Open family memory'}>{memory.image&&<img loading="lazy" src={memory.image} alt=""/>}<span>{memory.title||'A family memory'}</span></Control>)}</div>:<div className="memorial-empty"><Glyph name="image"/><h2>Memories live here</h2><p>Photos and memories tagged with {person.name.split(' ')[0]} will appear here.</p></div>}</section>:<section className="memorial-tributes" aria-label="Family tributes"><h2>Leave a little love</h2><PhotoViewer kind="memorial" id={id} discussionOnly/></section>}
 </article>;
}
