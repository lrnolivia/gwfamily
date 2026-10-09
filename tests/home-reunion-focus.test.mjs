import test from 'node:test';
import assert from 'node:assert/strict';
import {focusHomeReunionPlan,preserveHomeReunionFocus} from '../src/home-reunion-focus.js';
test('Home focus selects the current mobile entry or canonical inline action, not a detached trigger',()=>{
 let focused=0;const root={querySelector:selector=>{assert.equal(selector,'.react-home [data-panel-id="native-reunion"]');return {querySelector:selector=>{assert.equal(selector,'.home-reunion-plan, .planning-checklist button');return {focus(){focused++}}}}}};
 focusHomeReunionPlan(root);assert.equal(focused,1);
 assert.doesNotThrow(()=>focusHomeReunionPlan({querySelector:()=>null}));
});
test('resize focus recovery is limited to a replaced Home plan control',()=>{
 const oldDocument=globalThis.document,oldFrame=globalThis.requestAnimationFrame;let queued=[],focused=0;
 try{
  globalThis.requestAnimationFrame=fn=>queued.push(fn);
  const active={isConnected:true,getClientRects:()=>[{}],closest:selector=>selector==='dialog'?null:{}};
  globalThis.document={activeElement:active,querySelector:()=>({querySelector:()=>({focus:()=>focused++})})};
  preserveHomeReunionFocus();queued.shift()();assert.equal(focused,0);
  active.isConnected=false;preserveHomeReunionFocus();queued.shift()();assert.equal(focused,1);
  document.activeElement={closest:()=>null};preserveHomeReunionFocus();assert.equal(queued.length,0);
  document.activeElement={closest:()=>({})};preserveHomeReunionFocus();assert.equal(queued.length,0);
 }finally{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldFrame}
});
