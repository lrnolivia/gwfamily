import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPanelLayout,migratePanelLayout,panelPayload,validatePanelLayout,createSharedPanel,addSharedPanel,changeSharedPanel,moveSharedPanel,stepSharedPanel,keyboardSharedPanel,removeSharedPanel,restoreSharedPanel,validatePanelTransition,sharedPageMedia,NATIVE_PANEL_DEFINITIONS} from '../src/shared-panels.js';
import {sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {pageContentPayload,pageContentFingerprint,withOutputMedia,validRestoredDraft,mergePageDraft,reconcilePageRecord,initialRecord,pageDraftKey} from '../src/page-content-model.js';
import {DEFAULT_PHOTO_FRAME,validatePhotoFrame,normalizePhotoFrame,photoFrameStyle,movePhotoFrame,keyboardPhotoFrame} from '../src/photo-framing-model.js';
const clone=value=>structuredClone(value),clean=value=>value;
const unlocked=page=>{const layout=defaultPanelLayout(page);return {...layout,panels:layout.panels.map(panel=>({...panel,locked:false}))}};
test('native slots store presentation identities only; defaults are independent movable cards',()=>{
 const layout=defaultPanelLayout('reunion');assert.equal(layout.version,2);assert.deepEqual(layout.desktopOrder,['hero','native-plans','native-schedule','native-clarity']);
 for(const panel of layout.panels.filter(p=>p.kind==='native'))assert.deepEqual(Object.keys(panel).sort(),['id','kind','locked','removed','zone']);
 for(const page of Object.keys(NATIVE_PANEL_DEFINITIONS))assert.doesNotThrow(()=>validateSharedPageContent(page,pageContentPayload(sharedPageDefaults(page))));
});
test('legacy layout migration is nondestructive and idempotent with custom order and hero state retained',()=>{
 const old={version:1,panels:[{id:'hero',kind:'hero',zone:'side',locked:false,removed:false},createSharedPanel('panel-one','main','text'),createSharedPanel('panel-two','side','photo')],desktopOrder:['panel-two','hero','panel-one'],mobileOrder:['panel-one','hero','panel-two']},copy=clone(old);
 const migrated=migratePanelLayout('home',old);assert.deepEqual(old,copy);assert.equal(migrated.version,2);assert.deepEqual(migrated.panels.slice(0,3),old.panels);assert.deepEqual(migrated.desktopOrder.slice(0,3),old.desktopOrder);assert.deepEqual(migrated.mobileOrder.slice(0,3),old.mobileOrder);assert.deepEqual(migratePanelLayout('home',migrated),migrated);assert.doesNotThrow(()=>validatePanelLayout('home',migrated,clean));
});
test('legacy removed hero remains recoverable without being resurrected',()=>{
 const old={version:1,panels:[{id:'hero',kind:'hero',zone:'main',locked:false,removed:true}],desktopOrder:[],mobileOrder:[]},next=migratePanelLayout('reunion',old);assert.ok(next.panels[0].removed);assert.ok(!next.desktopOrder.includes('hero'));assert.doesNotThrow(()=>validatePanelLayout('reunion',next,clean));
});
test('pre-invitations version 2 Family, You and People layouts gain only the new native panel',()=>{
 for(const page of ['family','you','people']){
  const content=sharedPageDefaults(page);
  delete content.text.inviteTitle;delete content.text.inviteBody;
  let old=content.panelLayout;
  old.panels=old.panels.filter(panel=>panel.id!=='native-invitations');
  for(const key of ['desktopOrder','mobileOrder'])old[key]=old[key].filter(id=>id!=='native-invitations');
  old=addSharedPanel(old,createSharedPanel('panel-kept','side','text'));
  old.panels.find(panel=>panel.id==='panel-kept').body='Keep my saved family copy';
  old=removeSharedPanel(old,'panel-kept');
  old.mobileOrder=[...old.mobileOrder].reverse();
  const before=clone(old),next=migratePanelLayout(page,old);
  assert.deepEqual(old,before,'Migration does not mutate saved input');
  assert.deepEqual(next.panels.slice(0,-1),before.panels);
  for(const key of ['desktopOrder','mobileOrder'])assert.deepEqual(next[key],[...before[key],'native-invitations']);
  assert.deepEqual(next.panels.at(-1),{id:'native-invitations',kind:'native',zone:'side',locked:false,removed:false});
  assert.equal(migratePanelLayout(page,next),next,'Migration is idempotent');
  assert.deepEqual(validateSharedPageContent(page,{...content,panelLayout:old}).panelLayout,next);
 }
});
test('saved invitation removal and ordering are never reset by additive normalization',()=>{
 for(const page of ['family','you','people']){
  const old=removeSharedPanel(defaultPanelLayout(page),'native-invitations');
  assert.equal(migratePanelLayout(page,old),old);
  assert.ok(validateSharedPageContent(page,{...sharedPageDefaults(page),panelLayout:old}).panelLayout.panels.find(panel=>panel.id==='native-invitations').removed);
 }
 const incomplete=defaultPanelLayout('you');
 incomplete.panels=incomplete.panels.filter(panel=>panel.id!=='native-profile');
 for(const key of ['desktopOrder','mobileOrder'])incomplete[key]=incomplete[key].filter(id=>id!=='native-profile');
 assert.throws(()=>validateSharedPageContent('you',{...sharedPageDefaults('you'),panelLayout:incomplete}),/recoverable/,'Existing native slots cannot be silently dropped');
});
test('pointer, ordinary buttons and keyboard reorder the same individual card',()=>{
 const layout=unlocked('reunion'),pointer=moveSharedPanel(layout,'native-plans',{zone:'main',beforeId:'hero'}),button=stepSharedPanel(layout,'native-plans',-1),keyboard=keyboardSharedPanel(layout,'native-plans','ArrowUp');assert.deepEqual(pointer,button);assert.deepEqual(pointer,keyboard);assert.deepEqual(layout.desktopOrder,['hero','native-plans','native-schedule','native-clarity']);
});
test('cross-column moves preserve independent mobile order and reject mismatched targets',()=>{
 const layout=unlocked('reunion'),next=moveSharedPanel(layout,'hero',{zone:'side',beforeId:'native-schedule'});assert.equal(next.panels.find(p=>p.id==='hero').zone,'side');assert.deepEqual(next.mobileOrder,layout.mobileOrder);assert.equal(moveSharedPanel(layout,'hero',{zone:'main',beforeId:'native-schedule'}),layout);assert.equal(keyboardSharedPanel(layout,'hero','ArrowRight').panels[0].zone,'side');
});
test('mobile touch-drop target and keyboard produce parity without changing desktop placement',()=>{
 const layout=unlocked('reunion'),pointer=moveSharedPanel(layout,'native-plans',{beforeId:'hero',mobile:true}),keyboard=keyboardSharedPanel(layout,'native-plans','ArrowUp',true);assert.deepEqual(pointer,keyboard);assert.deepEqual(pointer.desktopOrder,layout.desktopOrder);assert.deepEqual(pointer.panels,layout.panels);assert.equal(keyboardSharedPanel(layout,'native-plans','ArrowRight',true),layout);
});
test('locked panel protection remains enforced by the shared model and server transition',()=>{
 const layout=defaultPanelLayout('home');assert.equal(moveSharedPanel(layout,'hero',{zone:'side'}),layout);assert.equal(moveSharedPanel(layout,'native-feed',{zone:'main',beforeId:'hero'}),layout);const before=sharedPageDefaults('home'),after=clone(before);after.hero.frame={x:20,y:30,zoom:1};assert.throws(()=>validatePanelTransition('home',before,after),/Unlock/);
});
test('each built-in and custom panel can be removed and restored with exact order',()=>{
 const layout=addSharedPanel(unlocked('tree'),createSharedPanel('panel-custom','side','text'));for(const id of ['native-connections','panel-custom']){const place={desktop:layout.desktopOrder.indexOf(id),mobile:layout.mobileOrder.indexOf(id)},removed=removeSharedPanel(layout,id),restored=restoreSharedPanel(removed,id,place);assert.deepEqual(restored,layout)}
});
test('a single-section page accepts a side panel without losing its main native slot',()=>{
 let layout=unlocked('birthdays');layout=addSharedPanel(layout,createSharedPanel('panel-side','side','photo'));assert.equal(layout.panels.find(p=>p.id==='panel-side').zone,'side');assert.ok(layout.desktopOrder.includes('native-calendar'));assert.doesNotThrow(()=>validatePanelLayout('birthdays',panelPayload(layout),clean));
});
test('native registry rejects arbitrary component identity, cross-page injection and dropped slots',()=>{
 const layout=unlocked('home');for(const id of ['native-preferences','native-arbitrary']){const next=clone(layout);next.panels[1].id=id;next.desktopOrder[1]=id;next.mobileOrder[1]=id;assert.throws(()=>validatePanelLayout('home',next,clean),/built-in/)}const next=clone(layout);next.panels=next.panels.filter(p=>p.id!=='native-feed');next.desktopOrder=next.desktopOrder.filter(id=>id!=='native-feed');next.mobileOrder=next.mobileOrder.filter(id=>id!=='native-feed');assert.throws(()=>validatePanelLayout('home',next,clean),/recoverable/);
});
test('photo framing strictly validates finite bounds and strips unsupported authority',()=>{
 for(const frame of [{x:-1,y:50},{x:50,y:101},{x:Infinity,y:50},{x:50,y:50,zoom:4},{x:50,y:50,url:'/api/media/stolen'},'center'])assert.throws(()=>validatePhotoFrame(frame));assert.deepEqual(validatePhotoFrame({x:0,y:100,zoom:3}),{x:0,y:100,zoom:3});assert.deepEqual(normalizePhotoFrame({x:NaN,y:1}),DEFAULT_PHOTO_FRAME);
});
test('responsive focal styles preserve position and zoom without rewriting images',()=>{
 assert.deepEqual(photoFrameStyle({x:25,y:75,zoom:1.5}),{objectFit:'cover',objectPosition:'25% 75%',transform:'scale(1.5)',transformOrigin:'25% 75%'});assert.equal(photoFrameStyle().transform,undefined);
});
test('photo drag follows overflow geometry, supports touch deltas and clamps edges',()=>{
 const box={width:300,height:200,imageWidth:600,imageHeight:200};assert.deepEqual(movePhotoFrame(DEFAULT_PHOTO_FRAME,30,80,box),{x:40,y:50,zoom:1});assert.equal(movePhotoFrame(DEFAULT_PHOTO_FRAME,10000,0,box).x,0);assert.equal(movePhotoFrame(DEFAULT_PHOTO_FRAME,-10000,0,box).x,100);assert.deepEqual(movePhotoFrame(DEFAULT_PHOTO_FRAME,3,4,{width:0,height:0}),DEFAULT_PHOTO_FRAME);assert.equal(keyboardPhotoFrame(DEFAULT_PHOTO_FRAME,'ArrowRight').x,52);assert.deepEqual(keyboardPhotoFrame({x:3,y:7,zoom:2},'Home'),DEFAULT_PHOTO_FRAME);
});
test('save/reload preserves hero, original-photo and custom-panel crop while excluding transport fields',()=>{
 const content=sharedPageDefaults('home');content.hero={mode:'gallery',frame:{x:22,y:44,zoom:1},media:[{id:'photo-1',url:'/api/media/photo-1',type:'image/jpeg',name:'Original.jpg',alt:'Family',frame:{x:10,y:90,zoom:1.2}}]};content.panelLayout=addSharedPanel(unlocked('home'),{...createSharedPanel('panel-photo','side','photo'),media:[{id:'photo-2',url:'/api/media/photo-2',alt:'Other',frame:{x:0,y:70,zoom:2}}]});
 const payload=pageContentPayload(content);assert.equal(payload.hero.media[0].url,undefined);const clean=validateSharedPageContent('home',payload),output=withOutputMedia(clean,content),restored=validRestoredDraft('home',output);assert.deepEqual(restored.hero,output.hero);assert.equal(restored.panelLayout.panels.at(-1).media[0].frame.zoom,2);assert.equal(sharedPageMedia(clean).length,2);assert.equal(pageContentFingerprint(restored),pageContentFingerprint(clean));
 const original=sharedPageDefaults('tree');original.hero.frame={x:20,y:30,zoom:1.4};assert.deepEqual(validateSharedPageContent('tree',pageContentPayload(original)).hero.frame,original.hero.frame);
});
test('cancel and draft reconciliation retain the saved image and saved frame until an explicit save',()=>{
 const saved=sharedPageDefaults('home');saved.hero={mode:'image',media:[{id:'photo',alt:'',frame:{x:50,y:50,zoom:1}}]};const draft=clone(saved);draft.hero.media[0].frame={x:22,y:68,zoom:1.5};const record={...initialRecord('home'),content:saved,draft,base:saved,revision:7,status:'ready',canEdit:true};const result=reconcilePageRecord('home',{content:saved,revision:7,canEdit:true},record);assert.deepEqual(result.draft.hero.media[0].frame,draft.hero.media[0].frame);assert.deepEqual(result.content.hero.media[0].frame,saved.hero.media[0].frame);assert.notEqual(pageDraftKey('account-a'),pageDraftKey('account-b'));assert.deepEqual(saved.hero.media[0].frame,DEFAULT_PHOTO_FRAME);
});
test('concurrent framing edits participate in the existing explicit conflict review',()=>{
 const base=sharedPageDefaults('home'),draft=clone(base),latest=clone(base);draft.hero.frame={x:20,y:50,zoom:1};latest.hero.frame={x:80,y:50,zoom:1};const merged=mergePageDraft(base,draft,latest);assert.ok(merged.conflicts.some(conflict=>conflict.field==='hero'));assert.deepEqual(merged.content.hero.frame,draft.hero.frame);
});

test('phone and wider photo positions save independently with legacy fallback',async()=>{
 const {photoFrameAt,updatePhotoFrame}=await import('../src/photo-framing-model.js');
 const legacy={x:45,y:55,zoom:1.2},mobile={x:20,y:70,zoom:1.5},desktop={x:80,y:30,zoom:2};
 const phone=updatePhotoFrame(legacy,'mobile',mobile);
 assert.deepEqual(photoFrameAt(phone,'mobile'),mobile);assert.deepEqual(photoFrameAt(phone,'desktop'),legacy);assert.deepEqual(legacy,{x:45,y:55,zoom:1.2});
 const both=updatePhotoFrame(phone,'desktop',desktop);assert.deepEqual(photoFrameAt(both,'mobile'),mobile);assert.deepEqual(photoFrameAt(both,'desktop'),desktop);
 const content=sharedPageDefaults('home');content.hero.frame=both;assert.deepEqual(validateSharedPageContent('home',pageContentPayload(content)).hero.frame,both);
 const style=photoFrameStyle(both);assert.equal(style['--gw-frame-mobile-x'],'20%');assert.equal(style['--gw-frame-desktop-x'],'80%');
 for(const variant of [{x:101,y:0,zoom:1},{x:10,y:50,zoom:NaN},{x:10,y:50,desktop:legacy}])assert.throws(()=>validatePhotoFrame({...legacy,mobile:variant}));
});
