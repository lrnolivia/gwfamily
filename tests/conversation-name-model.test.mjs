import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {synchronizeConversationName} from '../src/conversation-name-model.js';
const base={scope:'live:synthetic-a',id:'synthetic-conversation',name:'Saved group'};
test('initial authorized name seeds before paint and clean fields follow server updates',()=>{
 assert.equal(synchronizeConversationName('',null,base),'Saved group');assert.equal(synchronizeConversationName('Saved group',base,{...base,name:'New server name'}),'New server name');
});
test('remote rename and failed-save refresh preserve an exact typed local draft',()=>{
 const draft=' My unsaved group ';assert.equal(synchronizeConversationName(draft,base,{...base,name:'Other member name'}),draft);assert.equal(synchronizeConversationName(draft,{...base,name:'Other member name'},{...base,name:'Another remote change'}),draft);assert.equal(synchronizeConversationName(draft,base,null),draft);
});
test('conversation and account/mode transitions never carry a previous draft into another scope',()=>{
 for(const change of [{id:'different-conversation'},{scope:'live:synthetic-b'},{scope:'preview:synthetic-a'}])assert.equal(synchronizeConversationName('Previous private draft',base,{...base,...change,name:'This scope name'}),'This scope name');
});
test('acknowledged exact name becomes clean and follows later refreshes without inventing values',()=>{
 assert.equal(synchronizeConversationName('My confirmed name',base,{...base,name:'My confirmed name'}),'My confirmed name');assert.equal(synchronizeConversationName('My confirmed name',{...base,name:'My confirmed name'},{...base,name:'Later saved name'}),'Later saved name');assert.equal(synchronizeConversationName('Saved group',base,{...base,name:null}),'');
});
test('settings use layout hydration and retain explicit PATCH/save/error semantics',()=>{
 const source=readFileSync(new URL('../src/messaging.jsx',import.meta.url),'utf8');assert.match(source,/useLayoutEffect\(\(\)=>\{\s*if\(!c\)return;const next=\{scope:nameScope,id:c.id,name:c.name\|\|''\},previous=nameSnapshot.current/);assert.match(source,/setName\(value=>synchronizeConversationName\(value,previous,next\)\);nameSnapshot.current=next/);assert.match(source,/\[nameScope,c\?\.id,c\?\.name\]/);assert.doesNotMatch(source,/useEffect\(\(\)=>\{if\(c\)setName\(c.name\|\|''\)\}/);
 assert.match(source,/mutate\('','PATCH',\{name:name.trim\(\)\}\)/);assert.match(source,/disabled=\{busy\|\|!name.trim\(\)\|\|name.trim\(\)===c.name\}/);assert.match(source,/catch\(e\)\{setError\(e.message\)\}finally\{setBusy\(false\)\}/);
});
