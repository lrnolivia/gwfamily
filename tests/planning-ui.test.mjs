import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import {routeFromHash,routeHash,mainPages} from '../src/navigation.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>fs.readFileSync(root+path,'utf8');
const source=read('src/react-app.jsx'),checklistSource=read('src/planning-checklist.jsx'),reunionSource=read('src/reunion-plans.jsx'),plannerSource=read('src/planner.jsx');
const css=read('src/planning-checklist.css'),badges=read('dist/ui-pass.css');

// Render the production components with real React. Bundling belongs to the
// canonical CI dependency environment, not the dependency-free recovery runner.
const result=buildSync({stdin:{contents:`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {AppContext} from './src/ui-core.jsx';
 import {PlanningChecklist,PlanningLinks,FamilyPlanningPage,PlanningHistoryPage} from './src/planning-checklist.jsx';
 import {YourReunionPanel,ReunionPlans} from './src/reunion-plans.jsx';
 import {Planner,Rsvp} from './src/planner.jsx';
 import {Claim} from './src/features.jsx';
 export function render(state,component='checklist',props={},context={}){
  const Component={checklist:PlanningChecklist,links:PlanningLinks,planner:Planner,rsvp:Rsvp,claim:Claim,'reunion-panel':YourReunionPanel,'reunion-plans':ReunionPlans,'family-planning':FamilyPlanningPage,'planning-history':PlanningHistoryPage}[component];
  return renderToStaticMarkup(React.createElement(AppContext.Provider,{value:{state,platform:'android',data:{},route:{type:'home'},go(){},openSheet(){},setToast(){},dispatch(){},...context}},React.createElement(Component,props)));
 }`,resolveDir:root},bundle:true,format:'cjs',platform:'node',write:false,loader:{'.css':'empty'}});
const module={exports:{}};
new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {render}=module.exports;
const state={mode:'live',selfId:'self',rsvp:{status:'Planning to come',count:1},members:[{id:'self',name:'Person Test',photo:'/api/media/own-avatar',circle:'family'},{id:'child',name:'Child Test',managedBy:'self',circle:'family'}],households:[],groups:[],bag:[],capabilities:{},fees:'unpaid'};

// A tag stack checks actual SSR ancestry, rather than treating adjacent controls
// as nested. It also lets privacy assertions inspect one person row at a time.
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function elements(html){
 const stack=[],found=[];
 for(const match of html.matchAll(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi)){
  const tag=match[1].toLowerCase(),token=match[0];
  if(token.startsWith('</')){
   const node=stack.pop();
   assert.equal(node?.tag,tag,'SSR tags must remain balanced');
   node.inner=html.slice(node.contentStart,match.index);
   node.outer=html.slice(node.start,match.index+token.length);
  }else{
   const node={tag,token,parent:stack.at(-1)||null,start:match.index,contentStart:match.index+token.length,inner:'',outer:token};
   found.push(node);
   if(!voidTags.has(tag)&&!token.endsWith('/>'))stack.push(node);
  }
 }
 assert.equal(stack.length,0,'SSR tags must remain balanced');
 return found;
}
const hasClass=(node,name)=>(node.token.match(/\bclass="([^"]*)"/)?.[1]||'').split(/\s+/).includes(name);
const isControl=node=>['button','input','select','textarea','summary'].includes(node.tag)||(node.tag==='a'&&/\bhref=/.test(node.token));
function assertNoNestedControls(html){
 for(const node of elements(html).filter(isControl))for(let parent=node.parent;parent;parent=parent.parent)assert.equal(isControl(parent),false,`${node.tag} must not be nested inside ${parent.tag}`);
}
const count=(text,pattern)=>(text.match(pattern)||[]).length;

test('Home, Reunion and dedicated pages share the same planning model and route boundaries',()=>{
 const home=source.slice(source.indexOf('function Home('),source.indexOf('function Reunion('));
 const reunion=source.slice(source.indexOf('function Reunion('),source.indexOf('function Family('));
 assert.equal(count(home,/<YourReunionPanel\s*\/>/g),1);
 assert.equal(count(reunion,/<YourReunionPanel\s*\/>/g),1);
 assert.equal(count(source,/<YourReunionPanel\s*\/>/g),2);
 assert.doesNotMatch(source,/<PlanningChecklist\b/);
 assert.equal(count(source,/<PlanningLinks\s*\/>/g),1);
 assert.match(reunionSource,/export function YourReunionPanel\(\)\{return <PlanningChecklist compact title="Your reunion" heading=/);
 assert.match(reunionSource,/<PlanningChecklist\s*\/>/);
 assert.match(checklistSource,/export function FamilyPlanningPage\(\)\{return <section className="stack"><h1>Family member checklist<\/h1><PlanningChecklist showMembers\/>/);
 assert.match(checklistSource,/export function PlanningHistoryPage\(\)\{return <section className="stack"><h1>Saved planning records<\/h1><SavedPlanningHistory expanded\/>/);
 assert.match(source,/route\.type==='family-checklist'\?<FamilyPlanningPage\/>/);
 assert.match(source,/route\.type==='planning-history'\?<PlanningHistoryPage\/>/);
 for(const type of ['family-checklist','planning-history']){
  assert.deepEqual(routeFromHash(routeHash({type})),{type});
  assert.equal(mainPages.has(type),false);
 }
 for(const src of [checklistSource,reunionSource,plannerSource])assert.match(src,/derivePlanning\(state\)/);
 assert.doesNotMatch(source,/const next=!state\.rsvp|state\.fees==='confirmed'/);
});

test('screen readers get explicit completed, pending and not-needed status text',()=>{
 for(const [overrides,phrase] of [[{fees:'confirmed'},'Complete'],[{fees:'reported'},'Awaiting confirmation'],[{rsvp:{status:'Can’t make it',count:1}},'Not needed']]){
  const html=render({...state,...overrides},'links');
  assert.ok(html.includes(phrase));
  assert.match(html,/aria-hidden="true"/);
  assert.match(html,/aria-label="My RSVP/);
  assertNoNestedControls(html);
 }
 assert.match(css,/text-decoration:line-through/);
});

test('compact shared panel navigates to the fullpage per-person checklist',()=>{
 const compact=render(state,'reunion-panel'),fullpage=render(state,'family-planning');
 assert.match(compact,/class="card planning-checklist planning-checklist-compact" aria-label="Your reunion"/);
 assert.ok(elements(compact).some(node=>node.tag==='button'&&node.inner.includes('Family member checklist')));
 assert.doesNotMatch(compact,/class="planning-member-list"|<details\b/);
 assert.match(checklistSource,/onClick=\{\(\)=>go\(\{type:'family-checklist'\}\)\}>Family member checklist<\/Button>/);
 assert.match(fullpage,/<h1>Family member checklist<\/h1>/);
 assert.match(fullpage,/<div class="planning-people"><h3>Family member checklist<\/h3><ul class="planning-member-list">/);
 assert.match(fullpage,/Person Test/);
 assert.match(fullpage,/Child Test/);
 assert.match(fullpage,/Check coverage/);
 assertNoNestedControls(compact);
 assertNoNestedControls(fullpage);
});

test('fullpage person rows retain authorized avatars and passive badges without nested controls',()=>{
 const html=render(state,'family-planning'),rows=elements(html).filter(node=>hasClass(node,'planning-member'));
 assert.equal(rows.length,2);
 assert.match(rows[0].outer,/src="\/api\/media\/own-avatar"/);
 assert.match(rows[0].outer,/membership-chip/);
 assert.match(rows[1].outer,/Managed by you/);
 assert.match(rows[1].outer,/membership-chip/);
 for(const row of rows)assert.equal(elements(row.outer).filter(isControl).length,0,'Member identities and task status rows remain read-only');
 assert.doesNotMatch(html,/Ancestral|Administrator|Treasurer/);
 assertNoNestedControls(html);
});

test('fullpage coverage stays truthful for guardian children and private for other adults',()=>{
 const s={...state,householdId:'h',households:[{id:'h',name:'Test household',memberIds:['self','child','adult'],headIds:['self']}],members:[...state.members,{id:'adult',name:'Adult Test',photo:'/api/media/authorized-adult',circle:'family'},{id:'other-child',name:'Hidden Child',managedBy:'adult',photo:'/api/media/private-child',circle:'loved'},{id:'outsider',name:'Outside Test',photo:'/api/media/outsider',leader:true}],order:{id:'o',status:'claimed',items:[{name:'Shirt',quantity:2}]},fees:'confirmed',capabilities:{manageMembers:true,treasurer:true}};
 const html=render(s,'family-planning'),rows=elements(html).filter(node=>hasClass(node,'planning-member'));
 assert.equal(rows.length,3);
 const child=rows.find(node=>node.inner.includes('<h3>Child Test</h3>'));
 const adult=rows.find(node=>node.inner.includes('<h3>Adult Test</h3>'));
 assert.ok(child);
 assert.ok(adult);
 assert.equal(count(child.inner,/class="planning-member-task is-review"/g),3);
 assert.match(child.inner,/Sizes are not assigned to named family members/);
 assert.match(child.inner,/Individual coverage is not recorded/);
 assert.doesNotMatch(child.inner,/class="planning-member-task is-complete"/);
 assert.match(adult.inner,/src="\/api\/media\/authorized-adult"/);
 assert.match(adult.inner,/Manages their own private plans/);
 assert.equal(count(adult.inner,/class="planning-member-task is-private"/g),3);
 assert.doesNotMatch(adult.inner,/is-complete|Receipt confirmed|items in saved orders/);
 assert.doesNotMatch(html,/Hidden Child|Outside Test|\/api\/media\/private-child|\/api\/media\/outsider|Family leader/);
 assertNoNestedControls(html);
});

test('not attending retains fullpage history and stops fee-report calls to action',()=>{
 const s={...state,rsvp:{status:'Can’t make it',count:1},order:{id:'o',status:'claimed',items:[{name:'Shirt',quantity:1}]},planningRecords:{accountId:'self',orders:[{id:'o',status:'claimed',items:[{name:'Shirt',quantity:1}]}],feeReports:[{id:'f',status:'confirmed'}]}};
 const before=JSON.stringify(s),planner=render(s,'planner'),history=render(s,'planning-history'),plans=render(s,'reunion-plans');
 assert.match(planner,/Not needed/);
 assert.ok(elements(planner).some(node=>node.tag==='button'&&node.inner.includes('Saved orders and contribution records')));
 assert.doesNotMatch(planner,/class="card planning-history"/);
 assert.match(checklistSource,/if\(!expanded\)return <Button secondary icon="history" onClick=\{\(\)=>go\(\{type:'planning-history'\}\)\}>Saved orders and contribution records<\/Button>/);
 assert.match(history,/<h1>Saved planning records<\/h1>/);
 assert.match(history,/Saved orders and contribution records/);
 assert.match(history,/Selection saved/);
 assert.match(history,/Shirt/);
 assert.match(history,/Confirmed by the treasurer/);
 assert.match(history,/does not cancel orders, delete reports, or request refunds/);
 for(const html of [planner,history,plans]){
  assert.doesNotMatch(html,/I sent my contribution/);
  assertNoNestedControls(html);
 }
 assert.match(plans,/Saved orders remain available below/);
 assert.doesNotMatch(render(s,'claim'),/still needs attention/);
 assert.equal(JSON.stringify(s),before,'Rendering an opt-out never mutates saved records');
});

test('fullpage history ignores records belonging to another account',()=>{
 const html=render({...state,planningRecords:{accountId:'someone-else',orders:[{id:'private',status:'claimed',items:[{name:'Private other-account order',quantity:1}]}],feeReports:[{id:'private-fee',status:'confirmed'}]}},'planning-history');
 assert.match(html,/No orders or contribution reports are saved for this account yet/);
 assert.doesNotMatch(html,/Private other-account order|Confirmed by the treasurer/);
 assertNoNestedControls(html);
});

test('a reported payment has no repeat send-payment action',()=>{
 const html=render({...state,fees:'reported'},'planner');
 assert.doesNotMatch(html,/I sent my contribution/);
 assert.match(html,/Awaiting confirmation/);
 assertNoNestedControls(html);
});

test('RSVP success feedback is gated by persistence and keeps fullpage routes open',()=>{
 const rsvpSource=plannerSource.slice(plannerSource.indexOf('export function Rsvp('));
 // Both the fullpage toast and sheet dismissal must be inside the same awaited
 // truthy dispatch branch. A failed save cannot announce success or close it.
 assert.match(rsvpSource,/onSubmit=\{async e=>\{e\.preventDefault\(\);if\(saving\)return;setSaving\(true\);try\{if\(await dispatch\(\{type:'RSVP',value:\{count,status\}\}\)\)\{if\(route\?\.type==='rsvp'\|\|route\?\.type==='reunion'\)setToast\('RSVP saved'\);else openSheet\(null\)\}\}finally\{setSaving\(false\)\}\}\}/);
 assert.equal(count(rsvpSource,/openSheet\(null\)/g),1);
 assert.equal(count(rsvpSource,/setToast\('RSVP saved'\)/g),1);
 assert.match(rsvpSource,/aria-busy=\{saving\}/);
 assert.match(rsvpSource,/type="submit" disabled=\{saving\}/);
 const html=render({...state,rsvp:{status:'Can’t make it',count:1}},'rsvp',{}, {route:{type:'rsvp'}});
 assert.match(html,/Existing orders and payment records stay/);
 assert.match(html,/Save RSVP/);
 assertNoNestedControls(html);
});

test('global household badges remove every underline state and retain focus/tap affordance',()=>{
 assert.doesNotMatch(badges,/button\.membership-chip\{[^}]*text-decoration:underline/);
 assert.match(badges,/membership-group:focus-visible[^}]*text-decoration:none/);
 assert.match(badges,/membership-group:focus-visible\{outline:3px/);
 assert.match(badges,/membership-group:active\{box-shadow:inset 0 0 0 2px/);
 assert.match(badges,/button\.membership-chip\{min-height:34px;text-decoration:none;cursor:pointer\}/);
});

test('status text uses theme foreground, not low-contrast accent alone',()=>{
 assert.match(css,/\.planning-status.is-complete\{color:var\(--text\)\}/);
 assert.match(css,/@media\(forced-colors:active\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
});
