// Explicit offline source/SSR checks. No browser, OS emulator, listener,
// network, native installation, permission grant or account operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {installGuideAssets} from '../src/install-guide-assets.js';
import {installSteps,installGuideSources} from '../src/install-capabilities.js';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const supported=['apple','android','mac','windows','chromeos'];
const source=async name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');
const provenance=JSON.parse(await readFile(new URL('../docs/install-guide/provenance.json',import.meta.url),'utf8'));

async function offlineRenderer(){
 const contents=`import React from 'react';import{renderToString}from'react-dom/server';import{AppContext}from'./src/ui-core.jsx';import{InstallGuide}from'./src/install.jsx';import{InstallGuideVisual,installVisualSequences,safariVisualLayouts}from'./src/install-guide-visuals.jsx';export{installVisualSequences,safariVisualLayouts};export function renderVisual(platform,step){return renderToString(<InstallGuideVisual platform={platform} step={step}/>)}export function renderGuide(routeType){return renderToString(<AppContext.Provider value={{route:{type:routeType},openSheet(){},goBack(){}}}><InstallGuide/></AppContext.Provider>)}`;
 const compiled=await build({stdin:{contents,loader:'jsx',resolveDir:root},bundle:true,jsx:'automatic',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
 const saved=Object.fromEntries(['window','document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window:{addEventListener(){},dispatchEvent(){},matchMedia(){return {matches:false}}},location:{protocol:'http:',pathname:'/'},document:{createElement(){return {width:0,height:0,getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}},toDataURL(){return 'data:image/png;base64,'}}}}});
 try{const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports}
 finally{for(const[key,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}
const renderer=await offlineRenderer();

test('all five OS guides show three native-control stages with official source links',()=>{
 for(const platform of supported){assert.equal(installSteps[platform].length,3,platform);assert.equal(renderer.installVisualSequences[platform].length,3,platform);assert.ok(installGuideSources[platform].length,platform);for(const id of renderer.installVisualSequences[platform])assert.ok(installGuideAssets[id],id)}
 assert.equal(renderer.renderVisual('other',0),'','Unknown OS has no fake screenshot');
});
test('each recreation has verified content identity, honest version uncertainty and dimensions',async()=>{
 assert.equal(provenance.nativeCapture,false);assert.equal(provenance.assets.length,16);assert.equal(Object.keys(installGuideAssets).length,16);
 for(const entry of provenance.assets){
  const svg=await readFile(new URL('../dist/install-guide/'+entry.file,import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(svg).digest('hex'),entry.sha256,entry.file);
  assert.equal(entry.kind,'recreation');assert.match(entry.version,/unobserved|not observed/);assert.equal(entry.checkedAt,'2026-10-06');assert.ok(entry.sourceUrls.length);
  for(const url of entry.sourceUrls)assert.ok(['support.apple.com','support.google.com','support.microsoft.com'].includes(new URL(url).hostname),url);
  assert.match(svg,/Recreation/);assert.match(svg,/<metadata>/);assert.ok(svg.includes(`viewBox="0 0 ${entry.dimensions.width} ${entry.dimensions.height}"`));
  assert.doesNotMatch(svg,/<script|<foreignObject|\bonclick=|\bonload=|href="https?:\/\//i);assert.ok(entry.alt&&entry.layout&&entry.platform&&entry.browser);
 }
});
test('iOS has compact, direct Share and iPad examples plus a complete Add screen',async()=>{
 assert.deepEqual(Object.keys(renderer.safariVisualLayouts),['compact','direct','ipad']);
 const html=renderer.renderVisual('apple',0);assert.match(html,/Safari example/);for(const label of ['iPhone: Compact','iPhone: Top \/ Bottom','iPad'])assert.ok(html.includes(label),label);assert.match(html,/role="tablist"/);assert.equal((html.match(/role="tab"/g)||[]).length,3);assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);assert.equal((html.match(/tabindex="0"/g)||[]).length,1);assert.equal((html.match(/tabindex="-1"/g)||[]).length,2);assert.doesNotMatch(html,/type="radio"/);assert.match(html,/only changes the example/);
 assert.match(html,/<\/button><\/div><p class="choice-help">Choose the toolbar you see\. This only changes the example\.<\/p>/,'Example-only explanation is rendered after the tablist, never inside its navigation controls');
 assert.deepEqual(renderer.safariVisualLayouts,{compact:'ios-safari-compact',direct:'ios-safari-direct-share',ipad:'ipados-safari-share'});
 const visual=await source('install-guide-visuals.jsx');assert.match(visual,/value=\{safariLayout\} onChange=\{setSafariLayout\}/);assert.doesNotMatch(visual,/<ViewSwitcher[^>]*\bhelp=/,'ViewSwitcher has no help prop contract');
 const add=await readFile(new URL('../dist/install-guide/ios-safari-add-screen.svg',import.meta.url),'utf8');
 for(const label of ['Add to Home Screen','Open as Web App','greenwhitefamily.com','Green &amp; White','Cancel','>Add<'])assert.ok(add.includes(label),label);assert.match(add,/#34c759/);assert.match(add,/data:image\/png;base64,/);
});
test('native images have full alternatives and captions outside chrome; failure keeps written help',async()=>{
 for(const platform of supported)for(let step=0;step<3;step++){
  const html=renderer.renderVisual(platform,step);assert.match(html,/data-recreation="true"/);assert.match(html,/<img[^>]+alt="Recreated/);assert.match(html,/<figcaption>/);assert.match(html,/Control recreation/);assert.match(html,/width="(?:360|420)"/);
 }
 const visual=await source('install-guide-visuals.jsx');assert.match(visual,/onError=\{\(\)=>setUnavailable\(true\)\}/);assert.match(visual,/Follow the written steps above/);assert.match(visual,/key=\{id\}/);assert.doesNotMatch(visual,/fetch\(|requestPermission|pushManager|navigator\.share|\.prompt\(|localStorage|<details|<summary|role="button"/);
 const css=await source('install-guide-visuals.css');assert.match(css,/height:auto/);assert.match(css,/min-width:0/);assert.match(css,/@media\(max-width:500px\)/);assert.match(css,/forced-colors/);
});
test('guide preserves full-page Back, optional sheet dismissal and explicit install consent',async()=>{
 const install=await source('install.jsx');assert.match(install,/if\(route\?\.type==='install'\)goBack\(\);else openSheet\(null\)/);assert.match(install,/route\?\.type==='install'\?'Back':installed\?'Done':'Not now'/);assert.match(install,/onClick=\{install\}/);assert.match(install,/lock\.current\|\|!availablePrompt/);assert.doesNotMatch(install,/requestPermission|pushManager|navigator\.share/);assert.match(install,/not device screenshots/);assert.match(install,/does not turn on device notifications/);assert.doesNotMatch(install,/InstallDiagram/);
 assert.match(renderer.renderGuide('install'),/>Back</);assert.match(renderer.renderGuide('home'),/>Not now</);assert.doesNotMatch(renderer.renderGuide('install'),/>Install Green &amp; White</,'No capability prompt is fabricated by a visual');
});
test('current menu wording and older-version fallbacks are bounded honestly',()=>{
 assert.match(installSteps.android[1].text,/Install and create shortcut, then Install/);assert.match(installSteps.android[1].text,/Older versions or other browsers/);assert.match(installSteps.windows[0].text,/Cast, save, and share, then Install page as app/);assert.match(installSteps.chromeos[0].text,/Cast, save, and share, then Install page as app/);assert.match(installSteps.mac[0].text,/Sonoma 14/);for(const platform of ['mac','windows','chromeos'])assert.match(installSteps[platform].map(step=>step.text).join(' '),/Installation is optional/);
});
test('hosted fixture serves only exact cropped self-hosted guide assets and denies network writes',async()=>{
 const fixture=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');
 assert.match(fixture,/src\/install-guide-visuals\.css/);assert.match(fixture,/asset.endsWith\('\.png'\)\?'image\/png':'image\/svg\+xml'/);
 const fixtureUrl=/const FIXTURE_URL='([^']+)'/.exec(fixture);assert.ok(fixtureUrl);assert.equal(fixtureUrl[1],'https://gw-help-fixture.invalid/__review/help/');
 assert.match(fixture,/request\.url\(\)===FIXTURE_URL/);assert.match(fixture,/url\.origin===new URL\(FIXTURE_URL\)\.origin&&url\.pathname==='\/__review\/help\/install-guide\/'\+file/);
 const allowlist=/const ASSET_ALLOWLIST=Object\.freeze\(\[([\s\S]*?)\]\)/.exec(fixture);assert.ok(allowlist);
 const files=[...allowlist[1].matchAll(/'([^']+\.svg)'/g)].map(match=>match[1]);assert.equal(files.length,16);assert.equal(new Set(files).size,16);assert.deepEqual(files.slice().sort(),Object.values(installGuideAssets).map(asset=>asset.file).sort());
 assert.match(fixture,/request\.method\(\)!=='GET'[\s\S]*?writes\.push[\s\S]*?return route\.abort\(\)/);
 assert.match(fixture,/deniedRequests\.push\(\{phase,url:request\.url\(\)\}\);return route\.abort\(\)/);
 assert.match(fixture,/assert\.deepEqual\(writes,\[\]/);assert.match(fixture,/assert\.deepEqual\(deniedRequests,\[\]/);assert.match(fixture,/Every allowlisted SVG was actually requested/);assert.match(fixture,/img\.complete&&img\.naturalWidth>0/);
 assert.doesNotMatch(fixture,/route\.continue\(|localhost|127\.0\.0\.1|createServer|listen\(/);
 assert.ok(fixture.indexOf('GW_HOSTED_BROWSER_QA')<fixture.indexOf("await import('esbuild')"));assert.ok(fixture.indexOf('GW_HOSTED_BROWSER_QA')<fixture.indexOf('.launch('));
 for(const marker of ["serviceWorkers:'block'","permissions:[]",'physicalDeviceValidation:false','actualInstallation:false','notificationDelivery:false'])assert.ok(fixture.includes(marker),marker);
});
test('hosted fixture covers iOS, Android and every Safari tab with synthetic privacy-preserving Back and consent flows',async()=>{
 const fixture=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');
 const osLoop=/for\(const \[name,assetCount\] of (\[\[[^\n]+?\]\])\)/.exec(fixture);assert.ok(osLoop,'Exact named OS/assets matrix must remain inspectable');
 assert.deepEqual(JSON.parse(osLoop[1].replaceAll("'",'"')),[['iPhone / iPad',3],['Android',3]]);
 for(const [label,id] of [['iPhone: Compact','ios-safari-compact'],['iPhone: Top / Bottom','ios-safari-direct-share'],['iPad','ipados-safari-share']])assert.ok(fixture.includes("['"+label+"','"+id+"']"),label);
 assert.match(fixture,/getByRole\('tablist',\{name:'Instructions for'/);assert.match(fixture,/getByRole\('tablist',\{name:'Safari example'/);assert.doesNotMatch(fixture,/getByRole\('radio'/);
 for(const marker of ['An unsent synthetic update','A separate unsent synthetic draft',"window.fixture.account('fixture-b')","window.fixture.account('fixture-a')",'Progress never stores draft or content',"getByRole('button',{name:'Back',exact:true}).click()",'Preserved synthetic draft',"mockInstallPrompt('dismissed')","mockInstallPrompt('failure')",'Mock install prompt only; no device installation or notification delivery is performed.'])assert.ok(fixture.includes(marker),marker);
 assert.match(fixture,/if\(!\['dismissed','failure'\]\.includes\(mode\)\)/);assert.doesNotMatch(fixture,/new Event\('appinstalled'|outcome:'accepted'|requestPermission|pushManager|navigator\.share|serviceWorker\.register|physicalDeviceValidation:true|actualInstallation:true|notificationDelivery:true/);
});

test('approved mobile artwork retains verified bytes and intrinsic phone proportions',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../docs/install-guide/approved-mobile.json',import.meta.url),'utf8'));
 assert.equal(manifest.mobileOnly,true);assert.equal(manifest.assets.length,12);
 for(const asset of manifest.assets){const bytes=await readFile(new URL('../dist/install-guide/'+asset.name+'.png',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.readUInt32BE(16),asset.width);assert.equal(bytes.readUInt32BE(20),asset.height)}
 const visual=await source('install-guide-visuals.jsx');assert.match(visual,/max-width: 700px/);assert.match(visual,/navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1/);assert.match(visual,/app\?\.theme==='light'/);
});
