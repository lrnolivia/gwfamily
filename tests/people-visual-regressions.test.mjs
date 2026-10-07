import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicDirectoryMembers,filterDirectoryMembers,groupDirectoryHouseholds,managementDirectoryMembers} from '../src/people-directory-model.js';
import {pollResults,nextPollSelection} from '../src/poll-model.js';
import {contrast} from '../src/profile-model.js';
import {initialState,reducer,saveLocalState,loadLocalState} from '../src/data-adapter.js';
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const members=[{id:'a',name:'José White',registered:true,circle:'family',leader:true},{id:'b',name:'Mira Hall',registered:true,circle:'loved'},{id:'c',name:'Child',registered:true,managedBy:'a'},{id:'d',name:'Private dependent',registered:true,origin:'dependent'},{id:'e',name:'Unapproved name',registered:false}];
const state={mode:'live',members,households:[{id:'h',name:'White household',memberIds:['a','c','d']}],memorials:[]};
test('public directory excludes private dependents and nonregistered live profiles',()=>assert.deepEqual(publicDirectoryMembers(state).map(m=>m.id),['a','b']));
test('preview directory retains fictional adults without claiming registration',()=>assert.deepEqual(publicDirectoryMembers({...state,mode:'preview'}).map(m=>m.id),['a','b','e']));
test('shared search ignores accents and matches household names and all words',()=>{
 assert.deepEqual(filterDirectoryMembers(state,publicDirectoryMembers(state),{query:'jose white'}).map(m=>m.id),['a']);
 assert.deepEqual(filterDirectoryMembers(state,publicDirectoryMembers(state),{query:'household'}).map(m=>m.id),['a']);
 assert.equal(filterDirectoryMembers(state,publicDirectoryMembers(state),{query:'jose hall'}).length,0);
});
test('connection, household, unassigned and leader filters combine consistently',()=>{
 const list=publicDirectoryMembers(state);
 assert.deepEqual(filterDirectoryMembers(state,list,{household:'h',role:'leaders',circle:'family'}).map(m=>m.id),['a']);
 assert.deepEqual(filterDirectoryMembers(state,list,{household:'none',circle:'loved'}).map(m=>m.id),['b']);
 assert.equal(filterDirectoryMembers(state,list,{household:'h',circle:'loved'}).length,0);
});
test('household-first groups use the same authorized list and keep unassigned people visible',()=>{
 const grouped=groupDirectoryHouseholds(state,publicDirectoryMembers(state));assert.equal(grouped.groups.length,1);assert.deepEqual(grouped.groups[0].members.map(m=>m.id),['a']);assert.deepEqual(grouped.unassigned.map(m=>m.id),['b']);
});
test('management filters retain pending review records while using authorized identity metadata',()=>{
 const records=managementDirectoryMembers(state,[{id:'a',name:'José White',status:'active'},{id:'pending',name:'New member',status:'pending',email:'already-authorized@example.test'}]);
 assert.equal(records[0].leader,true);assert.equal(records[1].registered,undefined);assert.deepEqual(filterDirectoryMembers(state,records,{status:'pending'}).map(m=>m.id),['pending']);
});
const poll={mode:'single',options:['The classics','A little bit of everything','Let the cousins DJ'],votes:{0:2,1:3,2:1}};
test('poll saved choice produces proportional 29/57/14 results',()=>{
 const result=pollResults(poll,[1]);assert.deepEqual(result.counts,[2,4,1]);assert.equal(result.total,7);assert.deepEqual(result.percentages.map(Math.round),[29,57,14]);assert.ok(Math.abs(result.percentages.reduce((a,b)=>a+b)-100)<1e-9);
});
test('changing and reloading a poll vote counts the current account exactly once',()=>{
 const changed=nextPollSelection([1],0);const saved=JSON.parse(JSON.stringify(changed));assert.deepEqual(pollResults(poll,saved).counts,[3,3,1]);assert.deepEqual(pollResults(poll,saved),pollResults(poll,changed));assert.deepEqual(nextPollSelection([0],0),[0]);
});
test('multi choice can be added, removed, and sanitized without invalid counts',()=>{
 assert.deepEqual(nextPollSelection([0],1,true),[0,1]);assert.deepEqual(nextPollSelection([0,1],0,true),[1]);
 assert.deepEqual(pollResults({...poll,mode:'multiple'},[1,1,99,-1,'2']).selected,[1]);assert.deepEqual(pollResults({...poll,votes:{0:-4,1:'bad'}},[]).counts,[0,0,0]);
});
test('empty polls stay finite and selection-free',()=>assert.deepEqual(pollResults({options:[]},[0]),{selected:[],counts:[],total:0,percentages:[]}));
test('poll fill root cause is removed and labels have independent explicit columns',()=>{
 assert.doesNotMatch(source('dist/style.css'),/\.poll button span:not\(\.bar\)/);
 const css=source('src/poll.css');assert.match(css,/\.poll \.poll-choice>\.poll-fill\{position:absolute;z-index:0/);assert.match(css,/\.poll-label\{[^}]*grid-column:1[^}]*overflow-wrap:anywhere/);assert.match(css,/\.poll-result\{[^}]*grid-column:2/);assert.match(css,/\.poll-indicator\{[^}]*grid-column:3/);
});
test('interactive badges separate compact visual face from accessible target size',()=>{
 assert.match(source('src/ui-core.jsx'),/className="membership-chip-control"[\s\S]*?<span className="membership-chip membership-group">/);
 const css=source('src/member-badges.css');assert.match(css,/membership-chip-control\{[^}]*min-height:44px/);assert.match(css,/membership-chip\.membership-chip\{[^}]*min-height:25px/);assert.match(css,/membership-label\{[^}]*overflow:visible[^}]*overflow-wrap:anywhere/);
});
test('status semantic palettes exceed WCAG AA text contrast in light and dark',()=>{
 for(const [fg,bg]of [['#ffdc91','#382d19'],['#b0e7c4','#173928'],['#d3e4ff','#1f3048'],['#704900','#fff1cf'],['#185336','#e5f1e9'],['#274f87','#eef3fc']])assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg}`);
});
test('checklist status combines visible labels with consistent SVG icons',()=>{
 const jsx=source('src/planning-checklist.jsx');assert.match(jsx,/<Glyph name=\{statusIcons\[task.status\]/);assert.match(jsx,/<span>\{task.statusLabel\}<\/span>/);assert.match(source('src/planning-checklist.css'),/\.planning-status.is-todo\{[^}]*background:var\(--plan-todo-bg\)/);
});
test('full shared reunion component defaults full and Plan explicitly opts into compact',()=>{
 const jsx=source('src/reunion-plans.jsx');assert.match(jsx,/YourReunionPanel\(\{compact=false\}\)/);assert.match(jsx,/<YourReunionPanel compact\/>/);assert.match(source('src/planning-checklist.jsx'),/!compact&&next&&/);
});
test('single-line controls share metrics while multiline fields remain resizable',()=>{
 const css=source('src/visual-system.css');assert.match(css,/height:var\(--field-height\);min-height:var\(--field-height\)/);assert.match(css,/textarea\{[^}]*resize:vertical/);assert.match(css,/textarea\{min-height:6.5em;height:auto/);assert.doesNotMatch(css,/overflow-x:hidden|overflow:clip/);
});
test('shared People filter component is used in normal and leader directories without removing review gates',()=>{
 assert.match(source('src/features.jsx'),/<PeopleFilters state=\{state\}/);assert.match(source('src/manage-family.jsx'),/<PeopleFilters state=\{state\}/);assert.match(source('src/manage-family.jsx'),/state.capabilities\?\.manageMembers/);assert.match(source('src/manage-family.jsx'),/member.id===state.selfId\?/);
});

test('approved filter interaction uses the shared shell and distinct Done control',()=>{
 const jsx=source('src/people-filters.jsx'),adapter=source('src/browse-controls.jsx'),shell=source('src/shared-controls/work-controls-react.jsx'),css=source('src/browse-controls.css');
 assert.match(jsx,/<BrowseControls label="Family directory"/);assert.match(adapter,/<SharedBrowseControls/);
 assert.match(shell,/filterTitle='Filter & sort'/);assert.match(shell,/Your list updates as you choose/);assert.match(shell,/doneLabel='Done'/);assert.match(shell,/className="work-controls-done"[\s\S]*?>\{doneLabel\}/);
 assert.match(shell,/aria-expanded=\{open.has\(name\)\}/);assert.match(shell,/hidden=\{!open.has\(name\)\}/);
 assert.match(css,/--work-control-done:#f5f3e8;--work-control-on-done:#172b20/);assert.match(adapter,/shared-controls\/work-controls.css/);assert.match(shell,/workControlGlyph/);assert.match(source('src/shared-controls/work-controls-shell.css'),/browse-control-panel\[hidden\]\{display:none\}/);
});
test('directory sorting is shared and reversible',()=>{assert.deepEqual(filterDirectoryMembers(state,publicDirectoryMembers(state),{sort:'name-desc'}).map(m=>m.id),['b','a']);assert.deepEqual(filterDirectoryMembers(state,publicDirectoryMembers(state),{}).map(m=>m.id),['a','b'])});

test('preview vote and changed vote survive actual save/reload through the app adapter',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 let preview=initialState();preview=reducer(preview,{type:'POLL_VOTE',postId:'post-poll',options:[1]});assert.equal(saveLocalState(preview,storage).ok,true);
 let restored=loadLocalState(storage),post=restored.posts.find(post=>post.id==='post-poll');assert.deepEqual(pollResults(post.poll,restored.pollSelections[post.id]).percentages.map(Math.round),[29,57,14]);
 restored=reducer(restored,{type:'POLL_VOTE',postId:post.id,options:[0]});assert.equal(saveLocalState(restored,storage).ok,true);restored=loadLocalState(storage);assert.deepEqual(pollResults(post.poll,restored.pollSelections[post.id]).counts,[3,3,1]);
});
test('nonfinite vote data cannot produce NaN or infinite fill geometry',()=>{const result=pollResults({...poll,votes:{0:Infinity,1:'Infinity',2:-Infinity}},[]);assert.deepEqual(result.counts,[0,0,0]);assert.ok(result.percentages.every(Number.isFinite))});
test('Home does not override shared checklist spacing',()=>{assert.doesNotMatch(source('dist/style.css'),/\.home-context \.card\{padding:19px\}/);assert.match(source('dist/style.css'),/\.home-context \.card:not\(\.planning-checklist\)/)});
test('neutral Done and palest possible selected filter colors retain AA contrast',()=>{assert.ok(contrast('#172b20','#f5f3e8')>=4.5);assert.ok(contrast('#ffffff','#646f6d')>=4.5)});

test('You profile keeps its intrinsic height beside a longer stack and stacks on mobile',()=>{const legacy=source('dist/react-ui.css'),css=source('src/visual-system.css');assert.doesNotMatch(legacy,/\.you-columns>\.card\{height:100%\}/);assert.match(css,/\.profile\.profile-overview\{[^}]*height:auto;min-height:0;align-self:start/);assert.match(css,/@media\(max-width:700px\)\{\.you-columns\.you-columns\{grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/\.page-panel-zone>\.page-shared-panel\{align-self:start;min-height:0/)});
