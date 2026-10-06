import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {SHARED_PAGE_SCHEMA,sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
const source=await readFile(new URL('../src/page-content.jsx',import.meta.url),'utf8');
const css=await readFile(new URL('../src/page-content.css',import.meta.url),'utf8');
const compiled=await build({stdin:{contents:"export {pageContentPayload,pageContentFingerprint,pageContentDirty,pageDraftKey,safePageMediaUrl,mergePageDraft,pageContentRequest,resetPageContentPreview,pageBrowserStorage,reconcilePageRecord,collectPageDrafts} from './src/page-content.jsx'",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},logLevel:'silent'});
const {pageContentPayload,pageContentFingerprint,pageContentDirty,pageDraftKey,safePageMediaUrl,mergePageDraft,pageContentRequest,resetPageContentPreview,pageBrowserStorage,reconcilePageRecord,collectPageDrafts}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const clone=value=>JSON.parse(JSON.stringify(value));

test('page payload strips all media output metadata before publication',()=>{
 const content=sharedPageDefaults('home');content.hero={mode:'image',media:[{id:'upload_123',alt:'A gathering',url:'https://invalid.example/remote.jpg',type:'image/jpeg',name:'not-authority.jpg',privateValue:'secret'}]};
 assert.deepEqual(pageContentPayload(content).hero,{mode:'image',media:[{id:'upload_123',alt:'A gathering'}]});
 assert.deepEqual(validateSharedPageContent('home',pageContentPayload(content)).hero,pageContentPayload(content).hero);
});
test('fingerprints ignore mutable URLs but detect copy, media identity, order and description',()=>{
 const base=sharedPageDefaults('home');base.hero={mode:'gallery',media:[{id:'one',alt:'One',url:'/api/media/one'},{id:'two',alt:'Two',url:'/api/media/two'}]};
 const changed=clone(base);changed.hero.media[0].url='https://no-authority.example';assert.equal(pageContentFingerprint(changed),pageContentFingerprint(base));
 changed.hero.media.reverse();assert.notEqual(pageContentFingerprint(changed),pageContentFingerprint(base));
 const alt=clone(base);alt.hero.media[0].alt='Changed';assert.notEqual(pageContentFingerprint(alt),pageContentFingerprint(base));
 const copy=clone(base);copy.text.heading='New heading';assert.notEqual(pageContentFingerprint(copy),pageContentFingerprint(base));
});
test('dirty status considers content rather than revision metadata',()=>{
 const content=sharedPageDefaults('home');assert.equal(pageContentDirty({content,draft:null}),false);assert.equal(pageContentDirty({content,draft:clone(content),revision:100}),false);
 const draft=clone(content);draft.text.heading='A new hello';assert.equal(pageContentDirty({content,draft}),true);assert.equal(pageContentDirty(undefined),false);
});
test('page draft recovery storage is account scoped and distinct from preview',()=>{
 assert.notEqual(pageDraftKey('live:one'),pageDraftKey('live:two'));assert.notEqual(pageDraftKey('live:one'),pageDraftKey('preview:one'));assert.match(pageDraftKey('live:one/two'),/live%3Aone%2Ftwo$/);
});
test('live page media accepts only authenticated media paths',()=>{
 assert.equal(safePageMediaUrl('/api/media/abc-123_DEF'),'/api/media/abc-123_DEF');
 for(const invalid of ['https://example.com/photo.jpg','//example.com/photo.jpg','/api/media/a?token=secret','/api/media/../a','/api/media/a/b','javascript:alert(1)','data:image/png;base64,YQ==','blob:https://example.com/id'])assert.equal(safePageMediaUrl(invalid),'',invalid);
});
test('only isolated preview can render supported local file data',()=>{
 assert.equal(safePageMediaUrl('data:image/png;base64,YQ==',true),'data:image/png;base64,YQ==');assert.equal(safePageMediaUrl('data:video/webm;base64,YQ==',true),'data:video/webm;base64,YQ==');
 for(const invalid of ['data:image/svg+xml;base64,YQ==','data:text/html;base64,YQ==','data:image/png,<svg>','https://example.com/a.jpg'])assert.equal(safePageMediaUrl(invalid,true),'');
});
test('independent concurrent edits combine without silently discarding either leader',()=>{
 const base=sharedPageDefaults('home'),mine=clone(base),latest=clone(base);mine.text.heading='My greeting';latest.text.feedTitle='Latest family feed';
 const merged=mergePageDraft(base,mine,latest);assert.equal(merged.content.text.heading,'My greeting');assert.equal(merged.content.text.feedTitle,'Latest family feed');assert.deepEqual(merged.conflicts,[]);assert.equal(base.text.heading,'Hey, family!');
});
test('same-field concurrent edits require explicit review with both values retained',()=>{
 const base=sharedPageDefaults('home'),mine=clone(base),latest=clone(base);mine.text.heading='My hello';latest.text.heading='Their hello';
 const merged=mergePageDraft(base,mine,latest);assert.deepEqual(merged.conflicts,[{field:'heading',mine:'My hello',theirs:'Their hello'}]);assert.equal(merged.content.text.heading,'My hello');
});
test('identical concurrent edits do not cause a false conflict',()=>{
 const base=sharedPageDefaults('home'),mine=clone(base),latest=clone(base);mine.text.heading=latest.text.heading='Same hello';assert.equal(mergePageDraft(base,mine,latest).conflicts.length,0);
});
test('concurrent media changes are conflict reviewed while enriched URLs are ignored',()=>{
 const base=sharedPageDefaults('home'),mine=clone(base),latest=clone(base);mine.hero={mode:'image',media:[{id:'mine',alt:'My image',url:'/api/media/mine'}]};latest.hero={mode:'video',media:[{id:'theirs',alt:'Their video',url:'/api/media/theirs'}]};
 const merged=mergePageDraft(base,mine,latest);assert.deepEqual(merged.conflicts,[{field:'hero',mine:'image',theirs:'video'}]);assert.equal(merged.content.hero.media[0].id,'mine');
 const sameMedia=clone(mine);sameMedia.hero.media[0].url=null;assert.equal(mergePageDraft(base,mine,sameMedia).conflicts.length,0);
});
test('read/write requests always use same-origin authentication and no-store',async()=>{
 let requested;const result=await pageContentRequest('/api/page-content/home',{method:'PATCH',body:'{}',fetchImpl:async(path,options)=>{requested={path,options};return {ok:true,status:200,json:async()=>({revision:2})}}});
 assert.deepEqual(result,{revision:2});assert.equal(requested.path,'/api/page-content/home');assert.equal(requested.options.credentials,'same-origin');assert.equal(requested.options.cache,'no-store');assert.equal(requested.options.headers['Content-Type'],'application/json');
});
test('conflict response retains the fresh record for review instead of auto-overwrite',async()=>{
 const current={page:'home',revision:4,content:sharedPageDefaults('home')};await assert.rejects(pageContentRequest('/api/page-content/home',{fetchImpl:async()=>({ok:false,status:409,json:async()=>({error:{message:'A newer version exists'},current})})}),error=>error.status===409&&error.current===current&&/newer/.test(error.message));
});
test('ambiguous malformed responses tell the editor to retain its draft',async()=>{
 await assert.rejects(pageContentRequest('/api/page-content/home',{fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('invalid')}})}),error=>error.ambiguous===true&&/draft is still here/.test(error.message));
});
test('preview reset removes only the isolated shared-page preview namespace',()=>{const removed=[];resetPageContentPreview({removeItem:key=>removed.push(key)});assert.deepEqual(removed,['gw-shared-pages-preview:v1']);});
test('declared edit scope excludes public entry, profiles, personal posts and private records',()=>{
 for(const page of ['welcome','signin','sign-in','profile','post','chat','contact','household'])assert.equal(Object.hasOwn(SHARED_PAGE_SCHEMA,page),false);
 assert.equal(SHARED_PAGE_SCHEMA.global.hero,false);assert.match(source,/state\.onboarding==='done'/);assert.match(source,/session\?\.status==='active'/);assert.match(source,/relatedPages=\[\]/);assert.match(source,/context\.editingPages\.includes\(page\)/);
});
test('text stays plain, preserves source defaults, and keeps Done inside its rectangular input',()=>{
 assert.doesNotMatch(source,/dangerouslySetInnerHTML|contentEditable|execCommand/);assert.match(source,/originalValue\?children/);assert.match(source,/page-copy-input-wrap.*<Input[\s\S]*page-field-done[\s\S]*Done editing/);assert.match(source,/e\.key==='Escape'/);assert.match(source,/e\.metaKey\|\|e\.ctrlKey/);assert.match(source,/getBoundingClientRect\(\)/);assert.match(css,/page-copy-input-wrap\{position:absolute/);assert.match(css,/page-copy-input[^}]+border-radius:3px/);
});
test('edit mode uses neutral theme tokens with graceful fade and never filters photos',()=>{
 assert.match(css,/html\[data-page-edit-mode=true\]/);assert.match(css,/--bg:var\(--page-edit-bg\)!important/);assert.match(css,/background-color 360ms/);assert.doesNotMatch(css,/grayscale\s*\(|saturate\s*\(|filter\s*:/);assert.match(source,/delete root\.dataset\.pageEditMode/);
});
test('only the active surface pulses, with no wiggle and a steady reduced-motion fallback',()=>{
 assert.doesNotMatch(source+css,/wiggle|rumble/i);assert.match(source,/classList\.remove\('page-active-edit-card'\)/);assert.match(source,/classList\.add\('page-active-edit-card'\)/);assert.match(css,/\.page-active-edit-card[^}]*animation:page-active-glow/);assert.match(css,/@keyframes page-active-glow\{[^\n]+box-shadow/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none!important/);
 const animation=css.match(/@keyframes page-active-glow\{[^\n]+/)[0];assert.doesNotMatch(animation,/transform|translate|rotate/);
});
test('media has bounded typed uploads, manual gallery controls and paused reduced-motion video',()=>{
 assert.match(source,/SHARED_CONTENT_LIMITS\.maxGalleryItems/);assert.match(source,/SHARED_VIDEO_TYPES:SHARED_IMAGE_TYPES/);assert.match(source,/file\.size>limit/);assert.match(source,/Previous page photo/);assert.match(source,/Next page photo/);assert.match(source,/Pause page photos/);assert.match(source,/muted autoPlay=\{!reduced&&!editing\} loop playsInline controls/);assert.match(source,/poster=\{poster\|\|imageInChildren\(children\)\|\|'tree-artwork.png'\}/);assert.match(source,/video\.current\?\.pause\(\)/);
});
test('save retries retain request identity and revision guards; recovery preserves the old revision',()=>{
 assert.match(source,/before\.request\?\.fingerprint===fingerprint\?before\.request/);assert.match(source,/expectedRevision:before\.revision/);assert.match(source,/next\.revision=prior\?\.revision\?\?stored\?\.revision/);assert.match(source,/requestId:request\.id/);assert.match(source,/pageDraftKey\(account\)/);assert.match(source,/beforeunload/);
});
test('build reload integration exports draft, write and storage readiness',()=>{
 for(const field of ['hasUnsavedDrafts','pending','storageSafe'])assert.match(source,new RegExp(field));assert.match(source,/app\?\.data\?\.beginPending\?\.\(\)/);assert.match(source,/finally\{finishWork\(\)\}/);assert.match(source,/workRef\.current/);
});
test('explicit app update reload arms one bypass only after draft storage is rechecked',()=>{assert.match(source,/const prepareReload=useCallback/);assert.match(source,/if\(!persistDrafts\(\)\)return false;reloadAllowed\.current=true/);assert.match(source,/if\(reloadAllowed\.current\)\{reloadAllowed\.current=false;return\}/)});
test('verified live signout or account replacement clears that account’s draft slot',()=>{assert.match(source,/previousAccount\?\.startsWith\('live:'\)&&previousAccount!==account/);assert.match(source,/sessionStorage\.removeItem\(pageDraftKey\(previousAccount\)\)/)});
test('network failures keep retryable drafts and do not erase their idempotency record',async()=>{await assert.rejects(pageContentRequest('/api/page-content/home',{fetchImpl:async()=>{throw new TypeError('fetch failed')}}),error=>error.ambiguous===true&&/draft is still here/.test(error.message));});

test('denied browser storage getters are contained and never reported as writable',()=>{const denied={get sessionStorage(){throw new DOMException('Blocked','SecurityError')},get localStorage(){throw new DOMException('Blocked','SecurityError')}};assert.equal(pageBrowserStorage('sessionStorage',denied),null);assert.equal(pageBrowserStorage('localStorage',denied),null);assert.equal(resetPageContentPreview(null),false);assert.match(source,/if\(!storage\)return false/);assert.doesNotMatch(source,/readStored\(globalThis\.(?:sessionStorage|localStorage)|writeStored\(globalThis\.(?:sessionStorage|localStorage)|storage=globalThis\.localStorage/)});

test('account activation exposes readiness only after identity reset and forces a consumer dependency change',()=>{assert.match(source,/useLayoutEffect\(\(\)=>\{[\s\S]*identity\.current=account/);assert.match(source,/const accountReady=allowed&&identity\.current===account/);assert.match(source,/records:current,allowed:accountReady/);assert.match(source,/context\?\.allowed,context\?\.load/)});

test('a background page refresh preserves the newest draft, original base and expected revision',()=>{
 const original=sharedPageDefaults('home'),draft=clone(original);draft.text.heading='Newest keystrokes';const incoming=clone(original);incoming.text.feedTitle='Another leader changed this';
 const current={page:'home',revision:2,content:original,draft,base:clone(original),status:'loading',request:{id:'same-retry',fingerprint:'draft'}};
 const result={page:'home',revision:3,content:incoming,canEdit:true,updatedAt:'now'};
 const next=reconcilePageRecord('home',result,current,null);assert.equal(next.draft.text.heading,'Newest keystrokes');assert.equal(next.base.text.feedTitle,original.text.feedTitle);assert.equal(next.revision,2);assert.equal(next.latest.revision,3);assert.equal(next.request.id,'same-retry');
});
test('poll responses never roll back an in-flight or newer completed save',()=>{const content=sharedPageDefaults('home'),old={page:'home',revision:1,content,canEdit:true};const saving={revision:1,content,status:'saving'},newer={revision:2,content,status:'ready'};assert.equal(reconcilePageRecord('home',old,saving,null),saving);assert.equal(reconcilePageRecord('home',old,newer,null),newer);});
test('active authenticated pages refresh every fifteen seconds only while visible and idle',()=>{assert.match(source,/if\(!allowed\|\|preview\)return/);assert.match(source,/document\.visibilityState!=='visible'/);assert.match(source,/setInterval\(refresh,15000\)/);assert.match(source,/window\.addEventListener\('online',refresh\)/);assert.match(source,/document\.addEventListener\('visibilitychange',refresh\)/);assert.match(source,/count>0&&record&&!\['saving','loading'\]\.includes/);assert.match(source,/const freshest=ref\.current\[page\]\|\|before/)});

test('saving one visited page preserves recovered drafts on pages not yet revisited',()=>{const home=sharedPageDefaults('home'),family=sharedPageDefaults('family'),familyDraft=clone(family);familyDraft.text.heading='Unfinished family title';const saved={family:{draft:familyDraft,base:family,revision:2,request:null}};const collected=collectPageDrafts({home:{content:home,draft:null,revision:4}},saved);assert.equal(collected.family.draft.text.heading,'Unfinished family title');assert.equal(collected.home,undefined);const cleared=collectPageDrafts({family:{content:family,draft:null,revision:3}},saved);assert.deepEqual(cleared,{})});

test('active-card glow is cleared when a family tab detaches it, without observing attributes',()=>{assert.match(source,/const main=document\.getElementById\('main'\)/);assert.match(source,/new MutationObserver\(\(\)=>\{if\(activeSurface\.current\?\.isConnected===false\)activateSurface\(null\)\}/);assert.match(source,/observer\.observe\(main,\{childList:true,subtree:true\}\)/);assert.match(source,/return\(\)=>observer\.disconnect\(\)/);assert.doesNotMatch(source,/observer\.observe\(main,[^\n]*attributes:/)});
test('background loading keeps dirty focused fields enabled while preserving current keystrokes',()=>{assert.match(source,/busy=editor\.record\?\.status==='saving'/);assert.match(source,/disabled=\{busy\} onChange=\{e=>change\(e\.target\.value\)\}/);assert.match(source,/const freshest=ref\.current\[page\]\|\|before/);assert.match(source,/reconcilePageRecord\(page,result,keepDraft\?freshest:null,stored\)/)});


test('media upload owns a named progress status without suppressing pending-work protection',()=>{
 const panel=source.slice(source.indexOf('function PageMediaPanel('),source.indexOf('function PageHistory('));
 assert.match(panel,/<Sheet title="Page media" busy=\{uploading\} suppressGlobalPending=\{uploading\} kind="filter"/);
 assert.match(panel,/role="status" aria-label="Page media upload">\{progress\}/);
 assert.match(panel,/const finishWork=editor\.beginWork\(\);setUploading\(true\)/);
 assert.match(panel,/setProgress\('Uploading '/);
 assert.match(panel,/finishWork\(\);if\(alive\.current\)\{setUploading\(false\);setProgress/);
 assert.match(panel,/Uploaded privately\./);
 assert.match(panel,/Save the page to use /);
 assert.match(panel,/onClose=\{\(\)=>\{if\(!uploading\)onClose\(\)\}\}/);
 assert.match(panel,/<Button icon="check" disabled=\{uploading\} onClick=\{onClose\}>Done<\/Button>/);
});


test('media and history panels use visual-viewport widths and explicit busy close locks',()=>{
 assert.match(source,/<Sheet title="Page history"[^>]*busy=\{restoring\}/);
 for(const width of [420,460])assert.ok(source.includes("width:'min("+width+"px, calc(var(--vv-width) - 24px))'"));
});
