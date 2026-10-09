import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {initialState} from '../src/data-adapter.js';
import {sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {migratePanelLayout,removeSharedPanel,moveSharedPanel,changeSharedPanel,setSharedPanelHero,isHeroPanel,panelLayoutBands,validatePanelTransition} from '../src/shared-panels.js';
const root=fileURLToPath(new URL('../',import.meta.url)),source=readFileSync(root+'src/react-app.jsx','utf8'),features=readFileSync(root+'src/features.jsx','utf8');
const built=buildSync({stdin:{contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {AppContext} from './src/ui-core.jsx';import {People,AllFamily} from './src/features.jsx';import {HouseholdChildrenPage} from './src/households.jsx';
 export function render(state,all=false,children=false){return renderToStaticMarkup(<AppContext.Provider value={{state,data:{config:{}},route:{type:'family',tab:'people'},platform:'android',go(){},openSheet(){}}}>{children?<HouseholdChildrenPage showBack={false}/>:all?<AllFamily/>:<People/>}</AppContext.Provider>)}
 `,resolveDir:root,loader:'jsx'},bundle:true,format:'cjs',platform:'node',write:false,loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);

test('the new invitation belongs only to People and You, never the outer Family shell',()=>{
 const family=source.slice(source.indexOf('function Family('),source.indexOf('function You('));
 assert.doesNotMatch(family,/InvitationCard|native-invitations/);
 assert.match(features,/'native-invitations':invitationsAvailable\(state,data\)&&<InvitationCard page="people"\/>/);
 assert.match(source,/'native-invitations':invitationsAvailable\(state,data\)&&<InvitationCard page="you"\/>/);
 const html=module.exports.render(initialState());
 assert.match(html,/data-panel-page="people"/);
 assert.match(html,/class="page-shared-panel page-native-panel" data-panel-id="native-invitations"[^>]*data-panel-zone="side"/);
 assert.equal((html.match(/class="card stack invitation-sidebar-card"/g)||[]).length,1);
});

test('Address Book omits household rosters and their invitation action, retaining contacts and directory navigation',()=>{
 const html=module.exports.render(initialState());
 assert.doesNotMatch(html,/family-household-group|family-household-unassigned|family-people-directory|Invite someone|Add a person in preview|View household/);
 assert.match(html,/family-directory-summary/);assert.match(html,/family-people-contact/);assert.match(html,/All family/);assert.match(html,/Your profile/);
 assert.match(features,/'native-shared-contacts':state.mode==='live'\?<ContactDirectory\/>:null/);
 const all=module.exports.render(initialState(),true);assert.match(all,/family-people-directory/);assert.match(all,/Add a person in preview/);
});

test('People invitation migration never resurrects the retired Family panel or overwrites People content',()=>{
 const family=sharedPageDefaults('family');family.panelLayout=removeSharedPanel(family.panelLayout,'native-invitations');
 const before=JSON.stringify(family),people=sharedPageDefaults('people');
 people.text.heading='Saved address title';people.panelLayout.panels=people.panelLayout.panels.filter(p=>p.id!=='native-invitations');
 for(const key of ['desktopOrder','mobileOrder'])people.panelLayout[key]=people.panelLayout[key].filter(id=>id!=='native-invitations').reverse();
 const old=structuredClone(people),next=validateSharedPageContent('people',people);
 assert.equal(next.text.heading,old.text.heading);
 for(const key of ['desktopOrder','mobileOrder'])assert.deepEqual(next.panelLayout[key],[...old.panelLayout[key],'native-invitations']);
 assert.equal(JSON.stringify(family),before);assert.equal(migratePanelLayout('family',family.panelLayout),family.panelLayout);
 const removed=removeSharedPanel(next.panelLayout,'native-invitations');assert.equal(migratePanelLayout('people',removed),removed);
 assert.equal(validateSharedPageContent('people',{...next,panelLayout:removed}).panelLayout.panels.find(p=>p.id==='native-invitations').removed,true);
});

test('People invitation moves in the ordinary Main/Side bands with Hero off and retains protected validation',()=>{
 let content=sharedPageDefaults('people');const mobile=[...content.panelLayout.mobileOrder];
 for(const zone of ['main','full','side','main']){
  const before=content;const layout=moveSharedPanel(before.panelLayout,'native-invitations',{zone});
  content=validateSharedPageContent('people',{...content,panelLayout:layout});
  assert.doesNotThrow(()=>validatePanelTransition('people',before,content));
  const invitation=content.panelLayout.panels.find(p=>p.id==='native-invitations');assert.equal(isHeroPanel(invitation),false);
  assert.equal(!!invitation.fullWidth,zone==='full');assert.deepEqual(content.panelLayout.mobileOrder,mobile);
  const bands=panelLayoutBands(content.panelLayout.desktopOrder.map(id=>content.panelLayout.panels.find(p=>p.id===id)));
  assert.equal(bands.some(b=>b.full?.id==='native-invitations'),zone==='full');
 }
 const locked=changeSharedPanel(content.panelLayout,'native-invitations',{locked:true});
 assert.equal(moveSharedPanel(locked,'native-invitations',{zone:'side'}),locked);assert.equal(removeSharedPanel(locked,'native-invitations'),locked);
 const forged=structuredClone(content);forged.panelLayout=locked;const changed=structuredClone(forged);changed.panelLayout.panels.find(p=>p.id==='native-invitations').zone='side';
 assert.throws(()=>validatePanelTransition('people',forged,changed),/Unlock/);
 const invalid=structuredClone(content);invalid.panelLayout.panels.find(p=>p.id==='native-invitations').hero='false';assert.throws(()=>validateSharedPageContent('people',invalid),/hero/);
 assert.equal(setSharedPanelHero(locked,'native-invitations',true),locked);
});


test('You keeps a private-record entry for guardians who are not household heads',()=>{
 const you=source.slice(source.indexOf('function You('),source.indexOf('function AppearancePage('));
 const family=you.slice(you.indexOf("'native-family':"),you.indexOf("'native-plans':"));
 assert.match(family,/<ActionRow icon="people" title="Children’s private records" detail="Records only you can manage" onClick=\{\(\)=>go\(\{type:'household-children',id:state.householdId\}\)\}\/>/);
 assert.doesNotMatch(family,/canManage|headIds|managedBy/,'The navigation entry is not limited to household heads and exposes no child details');
 assert.match(source,/route.type==='household-children'\?<HouseholdChildrenPage id=\{route.id\} showBack=\{false\}\/>/);
});

test('the existing private manager still reveals only the current guardian records',()=>{
 const state={...initialState(),selfId:'guardian',householdId:'fixture-household',households:[{id:'fixture-household',name:'Fictional household',canManage:false,headIds:['other'],memberIds:['guardian','other']}],members:[{id:'guardian',name:'Fictional guardian'},{id:'own-child',name:'Fictional own dependent',managedBy:'guardian'},{id:'other-child',name:'Fictional hidden dependent',managedBy:'other'}]};
 const html=module.exports.render(state,false,true);
 assert.match(html,/Children’s private records/);assert.match(html,/Fictional own dependent/);assert.doesNotMatch(html,/Fictional hidden dependent/);
 assert.match(html,/Add a child/);
});
