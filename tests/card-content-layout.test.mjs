import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CARD_COLUMNS,cardSlots,defaultCardLayout,cardLayoutOf,validateCardLayouts,moveCardSlot,stepCardSlot,alignCardSlot,sizeCardImage,cardColumnVertical,alignCardColumn,keyboardCardSlot,updateCardLayout} from '../src/card-content-layout-model.js';
import {sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {createSharedPanel,addSharedPanel,changeSharedPanel,validatePanelTransition} from '../src/shared-panels.js';
import {pageContentPayload,pageContentFingerprint,mergePageDraft,validRestoredDraft,collectPageDrafts,reconcilePageRecord,initialRecord} from '../src/page-content-model.js';
import {pageStorageSnapshots,storedPageSnapshot} from '../backend/src/page-content-storage.mjs';
const hero={id:'hero',kind:'hero'},clone=value=>structuredClone(value);
const unlocked=()=>{const content=sharedPageDefaults('home');content.panelLayout=changeSharedPanel(content.panelLayout,'hero',{locked:false});return content};
const all=layout=>CARD_COLUMNS.flatMap(column=>layout[column].map(item=>item.id));
test('reference hero uses equal-column content identities, not page panel identities',()=>{
 const layout=defaultCardLayout('home',hero);assert.deepEqual(layout.left.map(item=>item.id),['eyebrow','title','body','action']);assert.deepEqual(layout.right,[{id:'media',align:'stretch'}]);assert.equal(layout.left.at(-1).align,'stretch');
 for(const page of ['home','reunion','memories','tree','family','people','birthdays','shop','inbox','you'])assert.ok(cardSlots(page,hero).length);
 assert.deepEqual(cardSlots('leader-calendar',hero),[]);assert.deepEqual(cardSlots('home',{id:'native-feed',kind:'native'}),[]);
});
test('custom preset defaults retain photo-above, photo-beside and two-text semantics',()=>{
 for(const preset of ['text','columns','photo','feature']){const panel=createSharedPanel('panel-one','main',preset),content=unlocked();content.panelLayout=addSharedPanel(content.panelLayout,panel);const layout=defaultCardLayout('home',panel);assert.doesNotThrow(()=>validateCardLayouts('home',content.panelLayout,{[panel.id]:layout}));if(preset==='photo'){assert.equal(layout.left[0].id,'media');assert.deepEqual(layout.right,[])}if(preset==='feature')assert.equal(layout.right[0].id,'media');if(preset==='columns')assert.equal(layout.right[0].id,'secondary');}
});
test('pointer, button and keyboard reorder individual content without mutating inputs',()=>{
 const layout=defaultCardLayout('home',hero),original=clone(layout),pointer=moveCardSlot(layout,'title',{column:'left',beforeId:'eyebrow'});
 assert.deepEqual(pointer,stepCardSlot(layout,'title',-1));assert.deepEqual(pointer,keyboardCardSlot(layout,'title','ArrowUp'));assert.deepEqual(layout,original);
 const crossed=moveCardSlot(layout,'title',{column:'right',beforeId:'media'});assert.deepEqual(crossed.right.map(item=>item.id),['title','media']);assert.equal(all(crossed).length,new Set(all(crossed)).size);assert.equal(keyboardCardSlot(layout,'title','ArrowRight').right.at(-1).id,'title');assert.equal(keyboardCardSlot(layout,'title','Escape'),layout);
});
test('invalid drops and out-of-range moves are no-ops',()=>{
 const layout=defaultCardLayout('home',hero);for(const target of [{column:'side'},{column:'left',beforeId:'missing'},{column:'right',beforeId:'title'},{column:'left',beforeId:'title'}])assert.equal(moveCardSlot(layout,'title',target),layout);
 assert.equal(moveCardSlot(layout,'missing',{column:'left'}),layout);assert.equal(stepCardSlot(layout,'eyebrow',-1),layout);assert.equal(stepCardSlot(layout,'media',1),layout);assert.equal(alignCardSlot(layout,'title','url'),layout);
});
test('column alignment changes affect only presentation and preserve source slots',()=>{
 const content=unlocked(),before=clone(content),layout=defaultCardLayout('home',hero),next=updateCardLayout(content,'home','hero',value=>alignCardSlot(value,'action','center'));
 assert.equal(next.cardLayouts.hero.left.at(-1).align,'center');assert.deepEqual(content,before);assert.deepEqual(next.text,content.text);assert.deepEqual(next.hero,content.hero);assert.deepEqual(next.panelLayout,content.panelLayout);assert.deepEqual(all(next.cardLayouts.hero),all(layout));
});
test('strict allowlist rejects arbitrary components, private records, URLs and unknown card IDs',()=>{
 const content=unlocked(),layout=defaultCardLayout('home',hero);
 for(const value of [{unknown:layout},{'native-feed':layout},{hero:{...layout,component:'PrivateProfile'}},{hero:{...layout,url:'/api/media/private'}},JSON.parse('{"__proto__":{}}'),[]])assert.throws(()=>validateCardLayouts('home',content.panelLayout,value));
 for(const invalid of [{id:'memberId',align:'start'},{id:'title',align:'absolute'},{id:'title',align:'center',url:'/api/media/private'},{id:'title',align:'center',role:'admin'},'title']){const value=clone(layout);value.left[1]=invalid;assert.throws(()=>validateCardLayouts('home',content.panelLayout,{hero:value}));}
 for(const transform of [value=>value.left.pop(),value=>value.right.push(clone(value.left[0])),value=>value.version=2,value=>value.right=null]){const value=clone(layout);transform(value);assert.throws(()=>validateCardLayouts('home',content.panelLayout,{hero:value}));}
 assert.throws(()=>validateCardLayouts('tree',sharedPageDefaults('tree').panelLayout,{hero:layout}));
});
test('locked and removed cards cannot be arranged and server transition enforces the same boundary',()=>{
 const before=sharedPageDefaults('home'),after=clone(before);after.cardLayouts={hero:moveCardSlot(defaultCardLayout('home',hero),'title',{column:'right'})};assert.equal(updateCardLayout(before,'home','hero',after.cardLayouts.hero),before);assert.throws(()=>validatePanelTransition('home',before,after),/Unlock/);
 after.panelLayout=changeSharedPanel(after.panelLayout,'hero',{locked:false});assert.doesNotThrow(()=>validatePanelTransition('home',before,after));const relocked=clone(after);relocked.panelLayout.panels[0].locked=true;assert.throws(()=>validatePanelTransition('home',before,relocked),/Unlock/);
 const removed=unlocked();removed.panelLayout.panels[0].removed=true;assert.equal(updateCardLayout(removed,'home','hero',after.cardLayouts.hero),removed);
});
test('draft dirty, account recovery, save payload and reload all retain the exact card layout',()=>{
 const base=unlocked(),draft=updateCardLayout(base,'home','hero',layout=>alignCardSlot(moveCardSlot(layout,'body',{column:'right'}),'body','end'));
 assert.notEqual(pageContentFingerprint(draft),pageContentFingerprint(base));const validated=validateSharedPageContent('home',pageContentPayload(draft));assert.deepEqual(validated.cardLayouts,draft.cardLayouts);assert.deepEqual(validRestoredDraft('home',validated).cardLayouts,draft.cardLayouts);
 const record={...initialRecord('home'),content:base,draft,base,canEdit:true,status:'ready',revision:3},saved=collectPageDrafts({home:record});assert.deepEqual(saved.home.draft.cardLayouts,draft.cardLayouts);
 const restored=reconcilePageRecord('home',{content:base,canEdit:true,revision:3},null,saved.home);assert.deepEqual(restored.draft.cardLayouts,draft.cardLayouts);assert.deepEqual(restored.content.cardLayouts,{});
});
test('cancel arrangement restores only its card metadata and keeps unrelated text edits',()=>{
 const base=unlocked(),draft=updateCardLayout(base,'home','hero',layout=>moveCardSlot(layout,'title',{column:'right'}));draft.text.heading='Keep my heading';const cancelled=updateCardLayout(draft,'home','hero',undefined);assert.deepEqual(cancelled.cardLayouts,{});assert.equal(cancelled.text.heading,'Keep my heading');assert.deepEqual(cardLayoutOf(cancelled,'home',hero),defaultCardLayout('home',hero));
});
test('simultaneous card edits create explicit conflicts; copy edits and separate cards merge',()=>{
 const base=unlocked();base.panelLayout=addSharedPanel(base.panelLayout,createSharedPanel('panel-one','main','text'));
 const mine=updateCardLayout(base,'home','hero',layout=>moveCardSlot(layout,'title',{column:'right'})),latest=updateCardLayout(base,'home','hero',layout=>alignCardSlot(layout,'title','end'));
 assert.ok(mergePageDraft(base,mine,latest).conflicts.some(item=>item.field==='cardLayout:hero'));
 const separate=updateCardLayout(base,'home','panel-one',layout=>moveCardSlot(layout,'body',{column:'right'}));separate.text.heading='Latest heading';const merged=mergePageDraft(base,mine,separate);assert.deepEqual(merged.conflicts,[]);assert.equal(merged.content.text.heading,'Latest heading');assert.deepEqual(merged.content.cardLayouts.hero,mine.cardLayouts.hero);assert.deepEqual(merged.content.cardLayouts['panel-one'],separate.cardLayouts['panel-one']);
});
test('additive presentation storage keeps rollback-readable old content and extension snapshots',()=>{
 const value=updateCardLayout(unlocked(),'home','hero',layout=>moveCardSlot(layout,'title',{column:'right'})),snapshot=pageStorageSnapshots('home',value);
 assert.equal(snapshot.content.cardLayouts,undefined);assert.equal(snapshot.extension.cardLayouts,undefined);assert.equal(snapshot.extension.panelLayout.version,1);assert.deepEqual(snapshot.presentation.cardLayouts,value.cardLayouts);
 const result=storedPageSnapshot(JSON.stringify(snapshot.content),JSON.stringify(snapshot.extension),JSON.stringify(snapshot.presentation));assert.deepEqual(validateSharedPageContent('home',result).cardLayouts,value.cardLayouts);assert.deepEqual(validateSharedPageContent('home',storedPageSnapshot(JSON.stringify(snapshot.content),JSON.stringify(snapshot.extension))).cardLayouts,{});
});
test('UI source supplies labelled keyboard/touch alternatives and no arbitrary rendering or publishing',()=>{
 const jsx=readFileSync(new URL('../src/card-content-layout.jsx',import.meta.url),'utf8'),css=readFileSync(new URL('../src/card-content-layout.css',import.meta.url),'utf8');
 for(const marker of ['onPointerCancel','onLostPointerCapture',"event.key==='Escape'",'Cancel arrangement','Finish arranging','aria-live="polite"','aria-describedby={helpId}',"inert={arranging&&definition.role!=='image'?true:undefined}"])assert.ok(jsx.includes(marker),marker);
 assert.doesNotMatch(jsx,/dangerouslySetInnerHTML|fetch\(|editor\.save\(/);assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/@container\(max-width:520px\)/);assert.match(css,/touch-action:none/);assert.match(css,/min-height:44px/);
});

test('image size and vertical alignment survive validated storage while text rejects image fields',()=>{
 const base=unlocked(),draft=updateCardLayout(base,'home','hero',layout=>sizeCardImage(layout,'media',{width:65,vertical:'bottom',aspect:'portrait'}));
 const saved=validateSharedPageContent('home',pageContentPayload(draft));assert.equal(saved.cardLayouts.hero.right[0].width,65);assert.equal(saved.cardLayouts.hero.right[0].vertical,'bottom');assert.equal(saved.cardLayouts.hero.right[0].aspect,'portrait');
 assert.throws(()=>updateCardLayout(base,'home','hero',layout=>sizeCardImage(layout,'title',{width:65})),/Only images/);
 assert.throws(()=>updateCardLayout(base,'home','hero',layout=>sizeCardImage(layout,'media',{width:101})),/image width/);
 assert.throws(()=>updateCardLayout(base,'home','hero',layout=>sizeCardImage(layout,'media',{vertical:'outside'})),/vertical alignment/);
});


test('text and image columns align independently and preserve vertical placement through storage',()=>{
 const base=unlocked(),draft=updateCardLayout(base,'home','hero',layout=>alignCardColumn(alignCardColumn(layout,'left','top'),'right','bottom'));
 const saved=validateSharedPageContent('home',pageContentPayload(draft));
 assert.equal(cardColumnVertical(saved.cardLayouts.hero,'left'),'top');assert.equal(cardColumnVertical(saved.cardLayouts.hero,'right'),'bottom');
 assert.deepEqual(saved.cardLayouts.hero.left,defaultCardLayout('home',hero).left);
 const snapshots=pageStorageSnapshots('home',saved),restored=storedPageSnapshot(JSON.stringify(snapshots.content),JSON.stringify(snapshots.extension),JSON.stringify(snapshots.presentation));
 assert.deepEqual(validateSharedPageContent('home',restored).cardLayouts,saved.cardLayouts);
 const moved=moveCardSlot(saved.cardLayouts.hero,'title',{column:'right'});assert.equal(cardColumnVertical(moved,'left'),'top');assert.equal(cardColumnVertical(moved,'right'),'bottom');
 assert.equal(alignCardColumn(moved,'other','top'),moved);assert.equal(alignCardColumn(moved,'left','outside'),moved);
 const invalid=clone(saved);invalid.cardLayouts.hero.vertical.left='outside';assert.throws(()=>validateSharedPageContent('home',pageContentPayload(invalid)),/vertical alignment/);
 assert.equal(cardColumnVertical(sizeCardImage(defaultCardLayout('home',hero),'media',{vertical:'bottom'}),'right'),'bottom');
});
test('compact editor uses named pressed glyph buttons and image-only size controls',()=>{
 const jsx=readFileSync(new URL('../src/card-content-layout.jsx',import.meta.url),'utf8');
 assert.match(jsx,/aria-pressed=\{value===id\}/);assert.match(jsx,/column vertical alignment/);assert.match(jsx,/Align all content vertically/);assert.match(jsx,/Decrease .*definition.label/);assert.doesNotMatch(jsx,/<select|type="range"/);
});
test('Messages empty invitations do not create a phantom sidebar row and birthday has one card',()=>{
 const jsx=readFileSync(new URL('../src/messaging.jsx',import.meta.url),'utf8'),app=readFileSync(new URL('../src/react-app.jsx',import.meta.url),'utf8');
 assert.match(jsx,/'native-invitations':Boolean\(view.invitations.length>0\|\|paging.invitationCursor\)&&/);
 assert.match(app,/'native-birthdays':<Birthdays\/>/);assert.doesNotMatch(app,/'native-birthdays':<section[^>]*><Birthdays/);
});
