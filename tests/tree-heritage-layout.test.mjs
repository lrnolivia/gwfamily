import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {changeSharedPanel} from '../src/shared-panels.js';
import {applyCardImageSettings,cardLayoutOf,defaultCardLayout,updateCardLayout} from '../src/card-content-layout-model.js';
import {pageContentPayload} from '../src/page-content-model.js';
import {pageStorageSnapshots,storedPageSnapshot} from '../backend/src/page-content-storage.mjs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const unlocked=()=>{const content=sharedPageDefaults('tree');content.panelLayout=changeSharedPanel(content.panelLayout,'hero',{locked:false});return content};
const roundTrip=value=>{const valid=validateSharedPageContent('tree',pageContentPayload(value)),saved=pageStorageSnapshots('tree',valid);return validateSharedPageContent('tree',storedPageSnapshot(JSON.stringify(saved.content),JSON.stringify(saved.extension),JSON.stringify(saved.presentation)))};
const item=content=>['left','right'].flatMap(key=>cardLayoutOf(content,'tree',{id:'hero',kind:'hero'})[key]).find(item=>item.id==='media');

test('tree artwork width and all four shapes survive both column placements and storage reload',()=>{
 for(const width of [25,65,100])for(const aspect of ['original','square','portrait','landscape'])for(const column of ['left','right']){
  const base=unlocked(),before=structuredClone(base),draft=updateCardLayout(base,'tree','hero',layout=>applyCardImageSettings(layout,'media',{column,align:'center',width,aspect})),saved=roundTrip(draft);
  assert.deepEqual(saved.cardLayouts.hero[column].find(item=>item.id==='media'),{id:'media',align:'center',width,aspect});assert.deepEqual(base,before);assert.deepEqual(saved.hero,base.hero);
 }
});
test('untouched and reset tree retain the compact default; width-only choices stay independent of shape',()=>{
 const base=unlocked();assert.equal(item(base).width,undefined);assert.equal(item(base).aspect,undefined);
 const sized=updateCardLayout(base,'tree','hero',layout=>applyCardImageSettings(layout,'media',{column:'right',align:'stretch',width:25}));assert.equal(item(roundTrip(sized)).width,25);assert.equal(item(roundTrip(sized)).aspect,undefined);
 const reset=updateCardLayout(sized,'tree','hero',defaultCardLayout('tree',{id:'hero',kind:'hero'}));assert.deepEqual(item(roundTrip(reset)),item(base));
 const removed=updateCardLayout(sized,'tree','hero',undefined);assert.deepEqual(item(roundTrip(removed)),item(base));
});
test('tree uploaded media and its crop remain unchanged when choosing layout or resetting it',()=>{
 const base=unlocked();base.hero={mode:'image',media:[{id:'fixture-tree-image',alt:'Fictional tree portrait',frame:{x:35,y:65,zoom:1.2,mobile:{x:20,y:50,zoom:1.5}}}]};
 const next=updateCardLayout(base,'tree','hero',layout=>applyCardImageSettings(layout,'media',{column:'left',align:'end',width:65,aspect:'portrait'}));assert.deepEqual(roundTrip(next).hero,base.hero);
 const reset=updateCardLayout(next,'tree','hero',undefined);assert.deepEqual(roundTrip(reset).hero,base.hero);
});
test('tree default image receives explicit width without changing untouched artwork or uploaded media',()=>{
 const jsx=read('card-content-layout.jsx'),css=read('shared-page-integration.css');
 assert.match(jsx,/data-card-image-width=\{definition.role==='image'\?item.width:undefined\}/);
 assert.match(css,/\.tree-later \.page-media-content>img\{width:175px;max-width:100%;height:140px;object-fit:contain\}/);
 assert.match(css,/\.tree-later \.card-content-slot\[data-card-image-width\] \.tree-hero-media \.page-media-content>img\{width:100%;height:auto\}/);
 assert.doesNotMatch(css,/(?:^|\})\s*img\s*\{[^}]*width:100%/);
});
test('explicit tree shapes use the same ratio and height reset as uploaded and custom-panel media',()=>{
 const css=read('card-content-layout.css');
 assert.match(css,/\.card-content-slot\[data-card-image-aspect\] \.card-slot-content :is\(\.photo,\.page-hero-asset,\.page-panel-photo-crop\),\s*\.card-content-slot\[data-card-image-aspect\] \.card-slot-content \.tree-hero-media \.page-media-content>img\{aspect-ratio:var\(--card-image-ratio\)!important;height:auto!important;max-height:none!important;min-height:0!important;width:100%;object-fit:cover\}/);
 for(const [shape,ratio] of [['original','auto'],['landscape','16/9'],['portrait','3/4'],['square','1']])assert.ok(css.includes(`[data-card-image-aspect=${shape}]{--card-image-ratio:${ratio}}`));
 assert.match(read('family.jsx'),/className="tree-hero-media"><img src="tree-artwork.png"/);
});
test('heritage options occupy a trailing non-absolute flex cell with a shrinkable wrapping identity',()=>{
 const css=read('memorials.css');
 assert.match(css,/\.household-heritage-row\.stack\{display:flex;align-items:center;gap:8px;min-inline-size:0\}/);
 assert.match(css,/\.household-heritage-row>\.list-row\{flex:1 1 0;min-inline-size:0;width:auto;padding-inline-end:16px\}/);
 assert.match(css,/\.household-heritage-row>\.list-row>span:not\(\.avatar\)\{min-inline-size:0;overflow-wrap:anywhere\}/);
 assert.match(css,/\.household-heritage-row\.stack>\.heritage-options\.icon-button\{position:relative;inset:auto;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;margin-inline-start:auto\}/);
 assert.doesNotMatch(css,/\.heritage-options\{[^}]*position:absolute|\.household-heritage-row>\.list-row\{[^}]*padding-inline-end:52px/);
});
test('heritage name/avatar and overflow remain separate semantic controls with existing actions',()=>{
 const jsx=read('households.jsx');
 assert.match(jsx,/<Control type="button" className="list-row" disabled=\{!person\} onClick=\{\(\)=>entry.personKind==='ancestor'\?openSheet\(\{type:'memorial',id:entry.personId\}\):go\(\{type:'profile',id:entry.personId\}\)\}><Avatar member=\{person\}\/>/);
 assert.match(jsx,/<\/Control>\{canEdit&&<Control type="button" className="icon-button heritage-options"/);
 assert.match(jsx,/aria-haspopup="menu" aria-expanded=\{options\?\.entry.id===entry.id\}/);
 assert.match(jsx,/onClick=\{event=>setOptions\(\{entry,anchor:event.currentTarget\}\)\}/);
});

test('household profile hides request and private-record cards while management and onboarding retain access',()=>{
 const jsx=read('households.jsx'),profile=jsx.slice(jsx.indexOf('export function HouseholdProfile'),jsx.indexOf('function HouseholdChildrenLink')),display=profile.slice(profile.indexOf('const members=')),manager=jsx.slice(jsx.indexOf('export function HouseholdManager'),jsx.indexOf('export function HouseholdHeritage'));
 assert.doesNotMatch(display,/<HouseholdRequests|<HouseholdChildrenLink/);
 assert.match(display,/<HouseholdHeritage key=\{h.id\} household=\{h\}\/>/);
 assert.match(display,/Manage household/);
 assert.match(manager,/<HouseholdRequests householdId=\{h.id\} embedded\/>/);
 assert.match(manager,/<HouseholdChildrenLink householdId=\{h.id\}\/>/);
 assert.match(profile.slice(0,profile.indexOf('const members=')),/<HouseholdRequests\/>/);
 assert.match(profile.slice(0,profile.indexOf('const members=')),/<HouseholdChildrenLink\/>/);
});
