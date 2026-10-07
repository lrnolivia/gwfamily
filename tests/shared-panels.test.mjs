import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {defaultPanelLayout,createSharedPanel,addSharedPanel,changeSharedPanel,removeSharedPanel,restoreSharedPanel,moveSharedPanel,stepSharedPanel,validatePanelTransition,sharedPageMedia,PANEL_PAGES,NATIVE_PANEL_DEFINITIONS} from '../src/shared-panels.js';
import {sharedPageDefaults,validateSharedPageContent,sharedMarkdownSource} from '../src/shared-content-schema.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const panel=(layout,id)=>layout.panels.find(item=>item.id===id);
function sample(){let layout=defaultPanelLayout('home');layout=changeSharedPanel(layout,'hero',{locked:false});layout=addSharedPanel(layout,createSharedPanel('panel-one','main','text'));layout=addSharedPanel(layout,createSharedPanel('panel-two','side','photo'));return layout;}
test('all shared pages start with a locked primary hero and footer never accepts panels',()=>{for(const page of PANEL_PAGES){const layout=sharedPageDefaults(page).panelLayout;const expected=['hero',...(NATIVE_PANEL_DEFINITIONS[page]||[]).map(([id])=>'native-'+id)];assert.deepEqual(layout.desktopOrder,expected);assert.deepEqual(layout.mobileOrder,expected);assert.equal(panel(layout,'hero').locked,true)}assert.deepEqual(defaultPanelLayout('global').panels,[]);assert.throws(()=>validateSharedPageContent('global',{panelLayout:sample()}));});
test('schema accepts only typed premade content with complete independent permutations',()=>{const content=sharedPageDefaults('home');content.panelLayout=sample();assert.deepEqual(validateSharedPageContent('home',content),content);for(const mutation of [l=>panel(l,'panel-one').kind='member',l=>panel(l,'panel-one').layout='html',l=>panel(l,'panel-one').html='<script>',l=>panel(l,'panel-one').zone='private',l=>l.panels.push({...panel(l,'panel-one')}),l=>l.desktopOrder.pop(),l=>l.mobileOrder.push('unknown'),l=>l.panels.splice(0,1),l=>panel(l,'panel-one').memberId='alice']){const bad=clone(content);mutation(bad.panelLayout);assert.throws(()=>validateSharedPageContent('home',bad));}});
test('desktop drag designation does not change separately stored mobile order',()=>{const layout=sample(),moved=moveSharedPanel(layout,'panel-one',{zone:'side',beforeId:'panel-two'});assert.equal(panel(moved,'panel-one').zone,'side');assert.deepEqual(moved.mobileOrder,layout.mobileOrder);assert.deepEqual(moved.desktopOrder,layout.desktopOrder);const mobile=moveSharedPanel(moved,'panel-two',{mobile:true,beforeId:'hero'});assert.deepEqual(mobile.mobileOrder,['panel-two',...layout.mobileOrder.filter(id=>id!=='panel-two')]);assert.deepEqual(mobile.desktopOrder,moved.desktopOrder);assert.equal(panel(mobile,'panel-two').zone,'side');});
test('removal remains recoverable with both old positions and content intact',()=>{const layout=sample();panel(layout,'panel-one').body='Keep **all** of this';const removed=removeSharedPanel(layout,'panel-one');assert.equal(panel(removed,'panel-one').body,'Keep **all** of this');assert.equal(panel(removed,'panel-one').removed,true);assert.deepEqual(removed.mobileOrder,layout.mobileOrder.filter(id=>id!=='panel-one'));assert.deepEqual(restoreSharedPanel(removed,'panel-one',{desktop:layout.desktopOrder.indexOf('panel-one'),mobile:layout.mobileOrder.indexOf('panel-one')}),layout);});
test('locks block changes, removing, moving and crossing their position; Leaders can unlock explicitly',()=>{let layout=changeSharedPanel(sample(),'hero',{locked:true});assert.equal(moveSharedPanel(layout,'hero',{zone:'side'}),layout);assert.equal(removeSharedPanel(layout,'hero'),layout);assert.equal(changeSharedPanel(layout,'hero',{zone:'side'}),layout);assert.equal(stepSharedPanel(layout,'native-feed',-1),layout);assert.equal(moveSharedPanel(layout,'panel-two',{mobile:true,beforeId:'hero'}),layout);const before={...sharedPageDefaults('home'),panelLayout:layout},after=clone(before);after.hero={mode:'image',media:[{id:'x',alt:''}]};assert.throws(()=>validatePanelTransition('home',before,after),/Unlock/);panel(after.panelLayout,'hero').locked=false;assert.doesNotThrow(()=>validatePanelTransition('home',before,after));});
test('a locked panel may be locked after editing, but cannot disappear from a save',()=>{const before={...sharedPageDefaults('home'),panelLayout:sample()},after=clone(before);panel(after.panelLayout,'panel-one').body='Edited';panel(after.panelLayout,'panel-one').locked=true;assert.doesNotThrow(()=>validatePanelTransition('home',before,after));after.panelLayout.panels=after.panelLayout.panels.filter(item=>item.id!=='panel-one');assert.throws(()=>validatePanelTransition('home',before,after),/recoverable/);});
test('untrusted media URL/type transport is never accepted in content',()=>{const content={...sharedPageDefaults('home'),panelLayout:sample()};panel(content.panelLayout,'panel-two').media=[{id:'upload',alt:'Family photo',url:'https://outside.test/photo'}];assert.throws(()=>validateSharedPageContent('home',content),/Unsupported/);panel(content.panelLayout,'panel-two').media=[{id:'../private',alt:''}];assert.throws(()=>validateSharedPageContent('home',content));});
test('removed media is retained for recovery but grants no active shared visibility',()=>{const content={...sharedPageDefaults('home'),panelLayout:sample()};panel(content.panelLayout,'panel-two').media=[{id:'archive',alt:''}];content.panelLayout=removeSharedPanel(content.panelLayout,'panel-two');assert.equal(sharedPageMedia(content).some(m=>m.id==='archive'),false);assert.equal(sharedPageMedia(content,{includeRemoved:true}).some(m=>m.id==='archive'),true);});
test('Markdown source preserves exact unsupported syntax and whitespace and refuses control characters',()=>{const source='  **hello**\r\n\n<table>literal HTML</table>\n:unsupported:  ';assert.equal(sharedMarkdownSource(source),source);const content=sharedPageDefaults('reunion');content.text.intro=source;content.bodyFormats={intro:'markdown'};assert.equal(validateSharedPageContent('reunion',content).text.intro,source);assert.throws(()=>sharedMarkdownSource('bad\u0000'));content.bodyFormats={heading:'markdown'};assert.throws(()=>validateSharedPageContent('reunion',content));});
test('only Add Panel and Reorder for mobile use modal sheets in the page editor',()=>{const panels=fs.readFileSync(new URL('../src/page-panels.jsx',import.meta.url),'utf8'),editor=fs.readFileSync(new URL('../src/page-content.jsx',import.meta.url),'utf8');assert.deepEqual([...panels.matchAll(/<Sheet title="([^"]+)"/g)].map(x=>x[1]),['Add Panel','Reorder for mobile']);assert.doesNotMatch(editor,/<Sheet/);assert.match(editor,/aria-label="Page history"/);assert.match(editor,/aria-label="Page media"/);assert.match(panels,/onPointerMove/);assert.match(panels,/onPointerCancel/);assert.match(panels,/Move .* earlier on mobile/);assert.match(panels,/aria-label=\{'Location for '/);});
test('shared panels do not register member, private, menu or system components',()=>{const source=fs.readFileSync(new URL('../src/shared-panels.js',import.meta.url),'utf8');assert.doesNotMatch(source,/eval\(|new Function\(|dangerouslySetInnerHTML|component:/);for(const page of ['profile','post','chat','leader-tools','planner','notification-settings'])assert.equal(PANEL_PAGES.includes(page),false);});
test('recovery draft model keeps desktop/mobile, locked state, Markdown and media descriptions in fingerprints',async()=>{const {pageContentFingerprint,mergePageDraft,reconcilePageRecord}=await import('../src/page-content-model.js');const base=sharedPageDefaults('home'),mine=clone(base),latest=clone(base);mine.panelLayout=sample();latest.text.heading='New heading';let merged=mergePageDraft(base,mine,latest);assert.equal(merged.content.text.heading,'New heading');assert.deepEqual(merged.content.panelLayout,mine.panelLayout);assert.equal(merged.conflicts.length,0);latest.panelLayout=addSharedPanel(latest.panelLayout,createSharedPanel('panel-remote','main','text'));merged=mergePageDraft(base,mine,latest);assert.equal(merged.conflicts[0].field,'panelLayout');const old={...base};delete old.panelLayout;delete old.bodyFormats;const next=reconcilePageRecord('home',{content:base,revision:1,canEdit:true},null,{draft:old,base:old,revision:1});assert.deepEqual(next.draft.panelLayout,base.panelLayout);assert.equal(pageContentFingerprint(next.draft),pageContentFingerprint(base));});

test('Reunion arrangement targets all three independent tab layouts',async()=>{
 const {activePanelPage,REUNION_PANEL_PAGES}=await import('../src/shared-panels.js');
 assert.deepEqual(['details','plans','weekend'].map(tab=>activePanelPage('reunion',tab)),REUNION_PANEL_PAGES);
 const layouts=REUNION_PANEL_PAGES.map(defaultPanelLayout),original=clone(layouts);
 const moved=stepSharedPanel(layouts[1],'native-merchandise',-1,true);
 assert.notDeepEqual(moved.mobileOrder,original[1].mobileOrder);
 assert.deepEqual(moved.desktopOrder,original[1].desktopOrder);
 assert.deepEqual(layouts[0],original[0]);assert.deepEqual(layouts[2],original[2]);
 assert.equal(activePanelPage('reunion-plans','weekend'),'reunion-plans');
});
test('arrangement section names follow current edited headings with safe fallbacks',async()=>{
 const {sharedPanelTitle}=await import('../src/shared-panels.js');
 const content=sharedPageDefaults('reunion-plans'),panel=content.panelLayout.panels.find(p=>p.id==='native-fees');
 content.text.feesTitle='Family contributions';assert.equal(sharedPanelTitle('reunion-plans',panel,content),'Family contributions');
 content.text.feesTitle='Updated contributions';assert.equal(sharedPanelTitle('reunion-plans',panel,content),'Updated contributions');
 content.text.feesTitle='';assert.equal(sharedPanelTitle('reunion-plans',panel,content),'Reunion fees');
 assert.equal(sharedPanelTitle('reunion-plans',{kind:'content',title:'Custom heading'},content),'Custom heading');
});

test('all native sections use edited heading fields rather than body copy and heroes use their heading',async()=>{
 const {sharedPanelTitle}=await import('../src/shared-panels.js');
 for(const [page,definitions] of Object.entries(NATIVE_PANEL_DEFINITIONS)){
  const content=sharedPageDefaults(page);
  for(const [id,fallback,,fields] of definitions){
   const panel=content.panelLayout.panels.find(p=>p.id==='native-'+id),field=fields.find(key=>/Title$|^heading$|^monthTitle$/.test(key));
   if(field&&Object.hasOwn(content.text,field)){content.text[field]='Edited '+page+' '+id;assert.equal(sharedPanelTitle(page,panel,content),content.text[field]);}
   else assert.equal(sharedPanelTitle(page,panel,content),fallback);
  }
  if(Object.hasOwn(content.text,'heroTitle')){content.text.heroTitle='Edited hero heading';assert.equal(sharedPanelTitle(page,content.panelLayout.panels.find(p=>p.kind==='hero'),content),'Edited hero heading');}
 }
 const records={birthdays:{draft:{text:{monthTitle:'Celebrating in'}}}};
 assert.equal(sharedPanelTitle('reunion-calendar',{id:'native-birthdays',kind:'native'},sharedPageDefaults('reunion-calendar'),records),'Celebrating in');
});

test('full width is a saved hero-only setting, retains mobile order and respects locks',()=>{
 const before={...sharedPageDefaults('home'),panelLayout:sample()},next=clone(before);
 next.panelLayout=changeSharedPanel(next.panelLayout,'hero',{fullWidth:true});
 const saved=validateSharedPageContent('home',next);
 assert.equal(panel(saved.panelLayout,'hero').fullWidth,true);
 assert.deepEqual(saved.panelLayout.mobileOrder,before.panelLayout.mobileOrder);
 assert.doesNotThrow(()=>validatePanelTransition('home',before,saved));
 const locked=changeSharedPanel(saved.panelLayout,'hero',{locked:true});
 assert.equal(changeSharedPanel(locked,'hero',{fullWidth:false}),locked);
 const invalid=clone(saved);panel(invalid.panelLayout,'native-feed').fullWidth=true;
 assert.throws(()=>validateSharedPageContent('home',invalid),/Unsupported/);
 panel(next.panelLayout,'hero').fullWidth='yes';assert.throws(()=>validateSharedPageContent('home',next),/hero width/);
});
