import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageCommand,canApplyPageCommand,applyPageCommand,recordPageCommand,stepPageCommand,forgetPageCommands} from '../src/page-command-history.js';
import {sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {createSharedPanel,addSharedPanel,validatePanelTransition} from '../src/shared-panels.js';
const base=()=>({text:{heading:'Original',body:'Original body'},hero:{mode:'default',media:[]},cardLayouts:{},panelLayout:{panels:[{id:'hero',locked:false},{id:'other',locked:false,title:'Other'}],desktopOrder:['hero','other'],mobileOrder:['hero','other']}});
test('one image command groups framing and shared layout and compensates after autosave without erasing unrelated text',()=>{
 const before=base(),after=structuredClone(before);after.hero.frame={x:50,y:50,zoom:1,mobile:{x:48,y:52,zoom:1.5}};after.cardLayouts.hero={left:[{id:'title',align:'start'}],right:[{id:'media',align:'center',width:65,aspect:'square'}]};
 const command=createPageCommand('home','Edit image',before,after),current={...structuredClone(after),text:{...after.text,heading:'Another leader changed this'}};
 assert.ok(canApplyPageCommand(current,command));const undo=applyPageCommand(current,command);assert.deepEqual(undo.hero,before.hero);assert.deepEqual(undo.cardLayouts,before.cardLayouts);assert.equal(undo.text.heading,'Another leader changed this');const redo=applyPageCommand(undo,command,'redo');assert.deepEqual(redo.hero,after.hero);assert.deepEqual(redo.cardLayouts,after.cardLayouts);assert.equal(redo.text.heading,undo.text.heading);assert.deepEqual(before,base());
});
test('overlapping image or order edits refuse undo instead of overwriting another leader',()=>{
 const before=base(),after=structuredClone(before);after.hero.frame={x:30,y:50,zoom:1};const command=createPageCommand('home','Edit image',before,after),latest=structuredClone(after);latest.hero.frame.x=75;assert.equal(canApplyPageCommand(latest,command),false);assert.throws(()=>applyPageCommand(latest,command),/changed after/);
 const moved=structuredClone(before);moved.panelLayout.mobileOrder.reverse();const move=createPageCommand('home','Move panel',before,moved);const sameHeading={...moved,text:{heading:'new'}};assert.deepEqual(applyPageCommand(sameHeading,move).panelLayout.mobileOrder,before.panelLayout.mobileOrder);
});
test('panel field commands preserve unrelated panel content, and removal restores both orders together',()=>{
 const before=base(),after=structuredClone(before);after.panelLayout.panels[0].locked=true;const command=createPageCommand('home','Protect panel',before,after);after.panelLayout.panels[1].title='New content';const undone=applyPageCommand(after,command);assert.equal(undone.panelLayout.panels[0].locked,false);assert.equal(undone.panelLayout.panels[1].title,'New content');
 const removed=structuredClone(before);removed.panelLayout.panels[1].removed=true;removed.panelLayout.mobileOrder=['hero'];removed.panelLayout.desktopOrder=['hero'];const removal=createPageCommand('home','Remove panel',before,removed);assert.deepEqual(applyPageCommand(removed,removal),before);
});
test('journal skips no-ops, bounds session history, clears redo on a new command and forgets restored pages',()=>{
 let history={past:[],future:[]};assert.equal(createPageCommand('home','Nothing',base(),base()),null);for(let i=0;i<60;i++)history=recordPageCommand(history,createPageCommand('home','Heading '+i,{value:i},{value:i+1}));assert.equal(history.past.length,50);history=stepPageCommand(history);assert.equal(history.future.length,1);history=stepPageCommand(history,'redo');assert.equal(history.future.length,0);history=stepPageCommand(history);history=recordPageCommand(history,createPageCommand('reunion','Move',{}, {value:1}));assert.equal(history.future.length,0);assert.equal(forgetPageCommands(history,'home').past.length,1);
});
test('autosaved Add panel undo archives the panel and redo restores it within the server transition contract',()=>{
 const before=sharedPageDefaults('home'),panel=createSharedPanel('panel-command','main','text');
 const after=validateSharedPageContent('home',{...before,panelLayout:addSharedPanel(before.panelLayout,panel)});
 const command=createPageCommand('home','Add panel',before,after);
 const undone=validateSharedPageContent('home',applyPageCommand(after,command));
 assert.equal(undone.panelLayout.panels.find(row=>row.id===panel.id).removed,true);
 assert.ok(!undone.panelLayout.mobileOrder.includes(panel.id));
 assert.doesNotThrow(()=>validatePanelTransition('home',after,undone));
 const redone=validateSharedPageContent('home',applyPageCommand(undone,command,'redo'));
 assert.deepEqual(redone,after);assert.doesNotThrow(()=>validatePanelTransition('home',undone,redone));
});
test('a command cannot recreate a parent removed by a newer edit',()=>{
 const before={text:{},cardLayouts:{hero:{left:[],right:[],vertical:{}}}},after=structuredClone(before);
 after.cardLayouts.hero.vertical.left='top';
 const command=createPageCommand('home','Align column',before,after);
 assert.equal(canApplyPageCommand({text:{},cardLayouts:{}},command,'redo'),false);
 assert.throws(()=>applyPageCommand({text:{},cardLayouts:{}},command,'redo'),/changed after/);
});
