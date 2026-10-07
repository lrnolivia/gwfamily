import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {positionTour} from '../src/contextual-tour-model.js';
import {createTourGeometryTracker} from '../src/contextual-tour-dom.js';
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const applied=position=>rect(position.coach.left,position.coach.top,position.coach.width,position.coach.maxHeight);
const view={width:1280,height:900},size={width:356,height:300};
const sample=(tracker,position,target,coach=applied(position),s=size,v=view)=>tracker.sample(position,target,coach,s,v);
test('Home to Compose refuses the prior visible coach even after repeated identical frames',()=>{
 const home=rect(180,140,180,72),compose=rect(180,350,52,52),oldPosition=positionTour(home,size,view),position=positionTour(compose,size,view),tracker=createTourGeometryTracker();
 const oldCoach=applied(oldPosition);
 assert.ok(oldCoach.top<compose.bottom&&oldCoach.bottom>compose.top,'The prior coach covers the new native control in this regression');
 for(let i=0;i<5;i++)assert.equal(sample(tracker,position,compose,oldCoach).ready,false,'Stable old geometry cannot authorize Next');
 assert.equal(sample(tracker,position,compose).ready,false);
 assert.equal(sample(tracker,position,compose).ready,false);
 assert.equal(sample(tracker,position,compose).ready,true);
});
test('each step owns a fresh readiness tracker, including repeated Next and Back',()=>{
 for(const target of [rect(180,140,180,72),rect(180,350,52,52),rect(180,140,180,72),rect(245,350,110,48)]){
  const tracker=createTourGeometryTracker(),position=positionTour(target,size,view);
  assert.deepEqual(sample(tracker,position,target),{ready:false,stableFrames:0});
  assert.deepEqual(sample(tracker,position,target),{ready:false,stableFrames:1});
  assert.deepEqual(sample(tracker,position,target),{ready:true,stableFrames:2});
 }
});
test('content reflow waits for its new applied placement and subsequent stable frames',()=>{
 const target=rect(580,670,44,44),tracker=createTourGeometryTracker(),initial=positionTour(target,size,view);
 for(let i=0;i<3;i++)sample(tracker,initial,target);
 const reflow={width:356,height:420},position=positionTour(target,reflow,view);
 assert.equal(sample(tracker,position,target,applied(initial),reflow).ready,false);
 assert.equal(sample(tracker,position,target,applied(position),reflow).ready,false);
 assert.equal(sample(tracker,position,target,applied(position),reflow).ready,false);
 assert.equal(sample(tracker,position,target,applied(position),reflow).ready,true);
});
test('moving target and scrolling viewport reset readiness until actual geometry settles',()=>{
 const tracker=createTourGeometryTracker();
 for(const top of [420,390,360,330]){
  const target=rect(220,top,52,52),position=positionTour(target,size,view);
  assert.equal(sample(tracker,position,target).ready,false);
 }
 const target=rect(220,330,52,52),position=positionTour(target,size,view);
 assert.equal(sample(tracker,position,target).ready,false);assert.equal(sample(tracker,position,target).ready,true);
 const zoomed={width:700,height:500,offsetLeft:20,offsetTop:110},next=positionTour(target,size,zoomed);
 assert.equal(sample(tracker,next,target,applied(next),size,zoomed).ready,false);
 assert.equal(sample(tracker,next,target,applied(next),size,zoomed).ready,false);
 assert.equal(sample(tracker,next,target,applied(next),size,zoomed).ready,true);
});
test('coach overlap, unapplied position, invalid values and oversized applied dimensions cannot become ready',()=>{
 const target=rect(220,330,52,52),position=positionTour(target,size,view);
 for(const coach of [rect(220,330,356,300),rect(position.coach.left+5,position.coach.top,356,300),rect(position.coach.left,position.coach.top,356,400),rect(NaN,position.coach.top,356,300)]){
  const tracker=createTourGeometryTracker();for(let i=0;i<5;i++)assert.equal(sample(tracker,position,target,coach).ready,false);
 }
});
test('missing and viewport-too-small centered fallbacks still settle without inventing a spotlight',()=>{
 for(const [target,v] of [[null,view],[rect(0,0,320,200),{width:320,height:200}]]){
  const position=positionTour(target,size,v),tracker=createTourGeometryTracker();assert.equal(position.hole,null);
  assert.equal(sample(tracker,position,target,applied(position),size,v).ready,false);
  assert.equal(sample(tracker,position,target,applied(position),size,v).ready,false);
  assert.equal(sample(tracker,position,target,applied(position),size,v).ready,true);
 }
});
test('source makes geometry step-owned and gates both Next and keyboard traversal on measured readiness',async()=>{
 const source=await readFile(new URL('../src/tutorial.jsx',import.meta.url),'utf8');
 assert.ok(source.includes("key={account+':'+session.steps[session.index].id}"));
 assert.ok(source.includes('geometry.sample(nextPosition,visible?rect:null,panel.current.getBoundingClientRect(),size,v)'));
 assert.ok(source.includes('finding:finding||!geometryReady'));
 assert.ok(source.includes('disabled={busy||finding||!geometryReady}'));
 assert.ok(source.includes('setGeometryReady(ready);if(!ready)schedule()'));
 assert.ok(source.includes("data-tour-geometry={geometryReady?'ready':'measuring'}"));
 assert.ok(source.includes('alive=false;cancelAnimationFrame(frame);clearTimeout(timeout)'));
});
test('hosted fixture retains exact no-overlap and fit assertions with body-free numeric diagnostics',async()=>{
 const source=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("'Coach does not cover highlighted native control'"));
 assert.ok(source.includes('geometry.panel.right<=geometry.target.left||geometry.panel.left>=geometry.target.right||geometry.panel.bottom<=geometry.target.top||geometry.panel.top>=geometry.target.bottom'));
 assert.ok(source.includes("'Coach fits visible viewport'"));
 assert.ok(source.includes('diagnostics.tourGeometry='));
 assert.ok(source.includes('stableFrames:'));
});
