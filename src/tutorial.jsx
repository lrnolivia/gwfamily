import React,{useEffect,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {ChoiceControl} from './choice-control.jsx';
import {contextualTopic,readTutorial,saveTutorial,tutorialTopics} from './tutorial-model.js';
import './help.css';
const guideStorage=()=>{try{return globalThis.localStorage}catch{return null}};
export function Tutorial(){
 const {state,route,go,openSheet,data}=useApp(),account=state.mode==='live'?state.selfId:'preview',saved=readTutorial(guideStorage(),account),[topic,setTopic]=useState(()=>saved.status==='started'?saved.topic:contextualTopic(route)),[storageError,setStorageError]=useState(false);
 const selected=tutorialTopics.find(t=>t.id===topic)||tutorialTopics[0],index=tutorialTopics.indexOf(selected);
 useEffect(()=>{const saved=readTutorial(guideStorage(),account);setTopic(saved.status==='started'?saved.topic:contextualTopic(route))},[account]);
 const remember=(next,status='started')=>{setStorageError(!saveTutorial(guideStorage(),account,{topic:next,status}));setTopic(next)};
 const close=status=>{remember(topic,status);openSheet(null)};
 return <div className="stack guided-help tutorial"><p className="tutorial-welcome">A quick, optional guide. Explore at your own pace.</p><ChoiceControl label="Explore a topic" variant="chips" value={topic} onChange={value=>remember(value)} options={tutorialTopics.map(t=>({value:t.id,label:t.id==='messages'?'Messages':t.id==='notifications'?'Notifications':t.id==='you'?'You':'Home'}))}/><section className="tutorial-topic" aria-live="polite" aria-atomic="true"><Glyph name={selected.icon}/><h3>{selected.title}</h3><p>{selected.body}</p><p className="tutorial-tip">{selected.tip}</p></section>{storageError&&<p role="status">This browser can’t save your guide progress. You can still explore every topic.</p>}<div className="tutorial-actions"><Button disabled={data?.pending} onClick={()=>{remember(topic);selected.route?go(selected.route):openSheet(selected.sheet)}}>{selected.action}<Glyph name="arrow"/></Button>{index<tutorialTopics.length-1?<Button secondary onClick={()=>remember(tutorialTopics[index+1].id)}>Next topic</Button>:<Button secondary onClick={()=>close('completed')}>Finish guide</Button>}</div><div className="row spread"><Control className="text-button" onClick={()=>close('skipped')}>I’ll explore on my own</Control><Control className="text-button" onClick={()=>remember('home')}>Start over</Control></div><p className="small muted">Your posts, messages, and other drafts stay as they are.</p></div>
}
