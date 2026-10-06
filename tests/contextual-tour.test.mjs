import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableTourSteps,contextualTourSteps,positionTour,readTourProgress,resumeTourIndex,saveTourProgress,tourAccount,tourProgressKey,tourShadeRegions,tourTargetSelectors} from '../src/contextual-tour-model.js';
import {cycleTourFocus,describeTourTarget,findTourTarget,isolateTourBranches} from '../src/contextual-tour-dom.js';
const storage=()=>{const map=new Map();return {map,getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)}};
const rect=(left,top,width=44,height=44)=>({left,top,width,height,right:left+width,bottom:top+height});
const overlaps=(a,b)=>a.left<b.right&&a.left+a.width>b.left&&a.top<b.bottom&&a.top+a.maxHeight>b.top;
test('seven public workflow steps never visit private or Leader resources',()=>{
 assert.equal(contextualTourSteps.length,7);assert.deepEqual([...new Set(contextualTourSteps.map(step=>step.route.type))],['home','reunion','family','you']);
 assert.ok(contextualTourSteps.every(step=>!step.route.id&&tourTargetSelectors(step.target).length));assert.deepEqual(tourTargetSelectors('arbitrary-private-control'),[]);
 assert.equal(availableTourSteps({messages:false,notifications:false}).length,5);assert.ok(!availableTourSteps({messages:false}).some(step=>step.id==='messages'));
});
test('progress is separated by authenticated identity and contains no content or route data',()=>{
 const s=storage(),a=tourAccount({mode:'live',selfId:'member-a'}),b=tourAccount({mode:'live',selfId:'member-b'}),preview=tourAccount({mode:'preview',selfId:'member-a'});
 assert.notEqual(tourProgressKey(a),tourProgressKey(b));assert.notEqual(tourProgressKey(a),tourProgressKey(preview));assert.equal(tourAccount({mode:'live'}),null);assert.equal(tourProgressKey(null),null);
 for(const status of ['started','paused','skipped','completed']){assert.equal(saveTourProgress(s,a,{step:'messages',status,privateBody:'never save me',route:{type:'chat',id:'secret'}}),true);assert.equal(readTourProgress(s,a).status,status);assert.equal(readTourProgress(s,b).status,'new');assert.equal(readTourProgress(s,preview).status,'new');assert.deepEqual(Object.keys(JSON.parse(s.getItem(tourProgressKey(a)))),['version','step','status'])}
 assert.equal(saveTourProgress(s,null,{step:'home'}),false);assert.equal(readTourProgress(s,null).status,'new');
});
test('resume, replay, removed feature, corrupt storage, and denied storage fail safely',()=>{
 const steps=availableTourSteps();assert.equal(resumeTourIndex(steps,{step:'messages',status:'paused'}),2);assert.equal(resumeTourIndex(steps,{step:'messages',status:'completed'}),0);assert.equal(resumeTourIndex(steps,{step:'messages',status:'paused'},true),0);assert.equal(resumeTourIndex(availableTourSteps({messages:false}),{step:'messages',status:'started'}),0);
 assert.equal(readTourProgress({getItem:()=>'{bad'},'live:a').status,'new');assert.equal(readTourProgress({getItem:()=>JSON.stringify({version:99,step:'messages',status:'paused'})},'live:a').status,'new');assert.equal(saveTourProgress({setItem(){throw Error('denied')}},'live:a',{}),false);assert.equal(saveTourProgress(null,'live:a',{}),false);
});
test('coach stays in visible viewport and clear of real targets across phone, tablet, desktop, zoom, and keyboard sizes',()=>{
 for(const view of [{width:320,height:640},{width:390,height:844},{width:768,height:1024},{width:1280,height:800},{width:844,height:390},{width:390,height:340,offsetTop:120,offsetLeft:20}]){
  for(const target of [rect((view.offsetLeft||0)+24,(view.offsetTop||0)+20),rect((view.offsetLeft||0)+view.width-72,(view.offsetTop||0)+view.height-88),rect((view.offsetLeft||0)+view.width/2-22,(view.offsetTop||0)+view.height/2-22)]){
   const p=positionTour(target,{width:356,height:300},view),c=p.coach;
   assert.ok(Number.isFinite(c.left)&&Number.isFinite(c.top)&&c.width>0&&c.maxHeight>0);assert.ok(c.left>=p.viewport.left&&c.top>=p.viewport.top);assert.ok(c.left+c.width<=p.viewport.left+p.viewport.width);assert.ok(c.top+c.maxHeight<=p.viewport.top+p.viewport.height);
   if(p.hole){assert.equal(overlaps(c,p.hole),false);assert.ok(p.arrow)}else assert.equal(p.reason,'viewport-too-small');
   const shade=tourShadeRegions(p);assert.ok(shade.every(region=>region.width>=0&&region.height>=0));const shadedArea=shade.reduce((sum,region)=>sum+region.width*region.height,0);assert.equal(shadedArea,p.viewport.width*p.viewport.height-(p.hole?p.hole.width*p.hole.height:0));
  }
 }
});
test('missing or oversized target has an honest centered fallback without invented spotlight',()=>{
 const missing=positionTour(null,{width:356,height:300},{width:320,height:200});assert.equal(missing.hole,null);assert.equal(missing.arrow,null);assert.equal(tourShadeRegions(missing).length,1);
 const huge=positionTour(rect(0,0,320,200),{width:356,height:300},{width:320,height:200});assert.equal(huge.reason,'viewport-too-small');assert.equal(huge.hole,null);
});
function element(name,children=[]){const attributes=new Map();const node={tagName:name,children,hidden:false,disabled:false,isConnected:true,setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.has(key)?attributes.get(key):null,hasAttribute:key=>attributes.has(key),removeAttribute:key=>attributes.delete(key),contains:item=>item===node||children.some(child=>child.contains(item)),getClientRects:()=>[rect(0,0)],getBoundingClientRect:()=>rect(0,0),focus(){node.focused=true}};return node}
test('target lookup uses only known anchors and ignores hidden, disabled, and detached controls',()=>{
 const hidden=element('BUTTON'),disabled=element('BUTTON'),detached=element('BUTTON'),visible=element('BUTTON');hidden.hidden=true;disabled.disabled=true;detached.isConnected=false;
 const looked=[];const root={querySelectorAll(selector){looked.push(selector);return [hidden,disabled,detached,visible]}};
 assert.equal(findTourTarget(root,'compose'),visible);assert.deepEqual(looked,['[data-gw-tour="compose"]']);assert.equal(findTourTarget(root,'private'),null);
});
test('temporary inert and description attributes restore their exact prior values',()=>{
 const target=element('BUTTON'),unrelated=element('SECTION'),alreadyInert=element('ASIDE'),parent=element('MAIN',[target,unrelated,alreadyInert]),coach=element('DIV'),root=element('BODY',[parent,coach]);alreadyInert.setAttribute('inert','original');target.setAttribute('aria-describedby','existing-hint');
 const restore=isolateTourBranches(root,coach,target),describe=describeTourTarget(target,'tour-hint');assert.equal(target.hasAttribute('inert'),false);assert.equal(parent.hasAttribute('inert'),false);assert.equal(coach.hasAttribute('inert'),false);assert.equal(unrelated.hasAttribute('inert'),true);assert.equal(target.getAttribute('aria-describedby'),'existing-hint tour-hint');
 restore();describe();assert.equal(unrelated.hasAttribute('inert'),false);assert.equal(alreadyInert.getAttribute('inert'),'original');assert.equal(target.getAttribute('aria-describedby'),'existing-hint');
 target.removeAttribute('aria-describedby');describeTourTarget(target,'tour-hint')();assert.equal(target.hasAttribute('aria-describedby'),false);
});
test('Tab and Shift-Tab include the real target and wrap without activating it',()=>{
 const skip=element('BUTTON'),next=element('BUTTON'),target=element('BUTTON'),controls=[skip,next,target];let prevented=0;
 assert.equal(cycleTourFocus({key:'Tab',preventDefault(){prevented++}},controls,target),true);assert.equal(skip.focused,true);
 assert.equal(cycleTourFocus({key:'Tab',shiftKey:true,preventDefault(){prevented++}},controls,skip),true);assert.equal(target.focused,true);assert.equal(prevented,2);assert.equal(cycleTourFocus({key:'Enter'},controls,target),false);
});
test('source guards retain opt-in, real control anchoring, no automatic actions, and responsive accessibility paths',async()=>{
 const source=await readFile(new URL('../src/tutorial.jsx',import.meta.url),'utf8'),css=await readFile(new URL('../src/tutorial.css',import.meta.url),'utf8');
 assert.doesNotMatch(source,/dispatch\(|ONBOARD|requestPermission|fetch\(|api\(|sendMessage|pushManager|\.click\(|innerHTML|textContent|innerText/);
 for(const marker of ['TutorialProvider','createPortal','tour-spotlight','tour-dim','tour-pointer','Skip guide','Replay guide','Start over','Resume guide','ArrowRight','ArrowLeft','Escape','visualViewport','ResizeObserver','MutationObserver','scrollIntoView','prefers-reduced-motion','data-gw-tour-launch','origin.focus','isolateTourBranches'])assert.ok(source.includes(marker),marker);
 assert.match(css,/forced-colors:active/);assert.match(css,/prefers-contrast:more/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(source,/platform==='ios'\?<LiquidGlass/);assert.match(source,/aria-modal="false"/);
});
