import React,{useEffect,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {api} from './live-adapter.js';
import {PostCard} from './conversation.jsx';
import {memoryMatches} from './content-history-model.js';
import './content-history.css';
// Saved: private to this person and rechecked by the server on every visit.
export function SavedPage(){
 const {state,data,go,openSheet}=useApp(),preview=state.mode==='preview',[query,setQuery]=useState(''),[result,setResult]=useState(null),[error,setError]=useState('');
 const text=query.trim();
 useEffect(()=>{if(preview)return;let alive=true;setError('');const timer=setTimeout(async()=>{try{const path='/api/saved'+(text?'?q='+encodeURIComponent(text):'');const page=await data.loadContent(path,{keep:!text});if(alive)setResult(page||{items:[]})}catch(e){if(alive)setError(e.message)}},text?300:0);return()=>{alive=false;clearTimeout(timer)}},[preview,text,state.selfId,(state.favorites||[]).join()]);
 const items=preview?(state.favorites||[]).flatMap(id=>{const post=state.posts.find(p=>p.id===id),memory=state.memories.find(m=>m.id===id);return memory?(!text||memoryMatches(memory,text)?[{kind:'memory',id}]:[]):post?(!text||post.text?.toLocaleLowerCase().includes(text.toLocaleLowerCase())?[{kind:'post',id}]:[]):[]}):result?.items||null;
 return <section className="stack saved-page"><h1>Saved</h1><p className="muted">Only you can see what you saved. Items you can no longer open leave this list.</p>
  <label className="saved-search"><span className="sr-only">Search saved items</span><input type="search" value={query} placeholder="Search saved" onChange={e=>setQuery(e.target.value)}/></label>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {items===null?<p role="status">Loading…</p>:items.length?items.map(item=>{
   if(item.kind==='post'){const post=state.posts.find(p=>p.id===item.id);return post?<PostCard key={item.id} post={post}/>:null}
   if(item.kind==='memory'){const memory=state.memories.find(m=>m.id===item.id);return memory?<Control key={item.id} className="saved-row" onClick={()=>openSheet({type:'memory',id:memory.id})}>{(memory.mediaType||'image/').startsWith('image/')?<img src={memory.image} alt=""/>:<Glyph name="image"/>}<span><strong>{memory.title||'Family memory'}</strong><small>Memory</small></span><Glyph name="arrow"/></Control>:null}
   return <Control key={item.id} className="saved-row" onClick={()=>go({type:'post',id:item.postId,section:'comment:'+item.id})}><Glyph name="chat"/><span><strong>{item.text||'Comment'}</strong><small>Comment on “{item.postExcerpt}”</small></span><Glyph name="arrow"/></Control>;
  }):<p className="muted">{text?'Nothing saved matches that search.':'Tap Save on a post or memory to keep it here.'}</p>}
 </section>;
}
