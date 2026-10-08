// Static contract checks only. This does not bundle, render, launch a browser,
// start a server, install dependencies, or claim hosted/device validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contextualTourSteps,tourTargetSelectors} from '../src/contextual-tour-model.js';
import {installGuideAssets} from '../src/install-guide-assets.js';
const source=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');
const match=/const fixture=String\.raw`([\s\S]*?)`;/m.exec(source);
assert.ok(match,'The reconstructed hosted fixture source is directly inspectable');
const fixture=match[1];

test('help fixture keeps automatic JSX and the real recovered component contract',async()=>{
 assert.match(source,/bundle:true,jsx:'automatic'/);
 for(const name of ['GlassSystem','Control','Sheet','InstallGuide','Tutorial','TutorialProvider','ViewSwitcher'])assert.ok(fixture.includes(name),name);
 assert.match(fixture,/import \{Tutorial,TutorialProvider\} from '\.\/src\/tutorial\.jsx'/);
 assert.match(fixture,/<TutorialProvider>[\s\S]*<main[\s\S]*<\/TutorialProvider>/);
 assert.match(fixture,/platform==='ios'&&<GlassSystem\/>/);
 assert.doesNotMatch(source,/renderToString|LiquidGlassFilter.*stub|createImageData|new Function|alias:\s*\{|jsx:'transform'/);
 const core=await readFile(new URL('../src/ui-core.jsx',import.meta.url),'utf8');
 assert.match(core,/from '@sohumsuthar\/liquid-glass'/);assert.match(core,/export function GlassSystem/);
});

test('all seven recovered targets are native public controls, with readonly route replacement',()=>{
 assert.equal(contextualTourSteps.length,7);
 for(const step of contextualTourSteps){
  assert.ok(tourTargetSelectors(step.target).length,step.target);
  const marker=step.target==='family-people'?"tourTargets={{people:'family-people'}}":step.target==='you-guide'?'tourTarget="you-guide"':'data-gw-tour="'+step.target+'"';
  assert.ok(fixture.includes(marker),'Real fixture anchor: '+step.target);
 }
 assert.match(fixture,/replaceRoute=next=>[\s\S]*audit\.current\.routeReplacements\.push/);
 assert.match(fixture,/publicRoutes=new Set\(\['home','reunion','family','you','tutorial','install','messages','notifications'\]\)/);
 assert.match(fixture,/next\.id\|\|next\.section/);
 assert.match(source,/Traversal never activates highlighted native controls/);
 assert.match(source,/Highlight is a real native button/);
 assert.match(source,/Coach does not cover highlighted native control/);
});

test('install and tutorial are fullpage views using glyph-led native tabs and Back',()=>{
 assert.match(fixture,/route\.type==='install'&&<>[\s\S]*<InstallGuide\/>/);
 assert.match(fixture,/route\.type==='tutorial'&&<>[\s\S]*<Tutorial\/>/);
 assert.doesNotMatch(fixture,/sheet\.type==='install'|sheet\.type==='tutorial'|<Sheet title=.*Install/);
 assert.match(source,/getByRole\('tablist',\{name:'Instructions for'/);
 assert.match(source,/getByRole\('tablist',\{name:'Safari example',exact:true\}\)\)\.toHaveCount\(0\)/);
 assert.match(source,/getByRole\('tablist',\{name:'Explore a topic'/);
 assert.match(source,/osTabs\.locator\('\.glyph'\)/);
 assert.doesNotMatch(source,/getByRole\('radio'|chooseRadio|Next topic|I’ll explore on my own|Explore Home/);
 assert.match(source,/getByRole\('button',\{name:'Back',exact:true\}\)\.click\(\)/);
});

test('route handler has an exact sixteen-SVG allowlist and verifies actual loads',()=>{
 const assets=/const ASSET_ALLOWLIST=Object\.freeze\(\[([\s\S]*?)\]\)/.exec(source)[1];
 const files=[...assets.matchAll(/'([^']+\.svg)'/g)].map(value=>value[1]);
 assert.equal(files.length,16);assert.equal(new Set(files).size,16);
 assert.deepEqual(files.slice().sort(),Object.values(installGuideAssets).map(asset=>asset.file).sort());
 assert.match(source,/url\.pathname==='\/__review\/help\/install-guide\/'\+file/);
 assert.match(source,/img\.complete&&img\.naturalWidth>0/);
 assert.match(source,/Every allowlisted SVG was actually requested/);
 assert.match(source,/No requests outside the exact synthetic asset allowlist/);
 assert.doesNotMatch(source,/\[a-z0-9-\]\+.*svg|route\.continue\(|force:\s*true/);
});

test('fixture owns fictional account progress and preserves separate unsent local drafts',()=>{
 for(const text of ['fixture-a','fixture-b','An unsent synthetic update','A separate unsent synthetic draft','Preserved synthetic draft','Mock composer draft'])assert.ok(fixture.includes(text),text);
 assert.match(fixture,/drafts\[account\]/);assert.match(fixture,/\[account\]:event\.target\.value/);
 assert.match(source,/Account progress|account progress and draft isolation/);
 assert.match(source,/window\.fixture\.account\('fixture-b'\)/);
 assert.match(source,/window\.fixture\.account\('fixture-a'\)/);
 assert.match(source,/\['version','step','status'\]/);
 assert.match(source,/Progress never stores draft or content/);
 assert.doesNotMatch(fixture,/fetch\(|api\(|sendMessage|requestPermission|pushManager|Notification\(|navigator\.share|serviceWorker\.register|window\.open|submit\(/);
});

test('mock install outcomes are explicitly limited to dismissed or failure, with no installation truth signal',()=>{
 assert.match(fixture,/Mock install prompt only; no device installation or notification delivery is performed/);
 assert.match(fixture,/if\(!\['dismissed','failure'\]\.includes\(mode\)\)/);
 assert.match(fixture,/event\.fixtureMockOnly=true/);
 assert.match(fixture,/outcome:'dismissed'/);
 assert.doesNotMatch(source,/new Event\('appinstalled'|outcome:'accepted'|physicalDeviceValidation:true|actualInstallation:true|notificationDelivery:true/);
 assert.match(source,/actualInstallation:false/);assert.match(source,/notificationDelivery:false/);
});

test('hosted script plans cover responsive, keyboard, interruption, replay, and pending states',()=>{
 for(const marker of ["[320,1280]","['ios','android']","['light','dark']","textZoom(200)","textZoom(100)","'ArrowRight'","'ArrowLeft'","'Tab'","'Escape'","'Enter'","'Home'","'End'",'Start over','Resume guide','Replay guide','Finish guide','Skip guide','window.fixture.pending(true)','window.fixture.interrupt()','interruptionClosed','window.fixture.navigate({type:\'reunion\'})'])assert.ok(source.includes(marker),marker);
 assert.match(source,/Guide must not close a native modal/);
 assert.match(source,/await expect\(page\.locator\('\.contextual-tour'\)\)\.toHaveCount\(0\)/);
 assert.doesNotMatch(source,/\.click\(\{[^}]*force|localhost|127\.0\.0\.1|createServer|listen\(/);
});

test('failure capture precedes locator waits and never hides failed runs',()=>{
 assert.ok(source.indexOf("page.on('pageerror'")<source.indexOf('await page.goto('));
 assert.ok(source.indexOf("page.on('console'")<source.indexOf('await page.goto('));
 for(const marker of ['GW help ','-failure.png','-failure.json','rootChildren','failedRequests','consoleErrors','deniedRequests','serviceWorkers:\'block\'','permissions:[]'])assert.ok(source.includes(marker),marker);
 assert.match(source,/assert\.deepEqual\(errors,\[\]/);assert.match(source,/assert\.deepEqual\(writes,\[\]/);
 assert.match(source,/if\(failure\)throw failure/);
 assert.match(source,/newly reconstructed/);assert.match(source,/physicalDeviceValidation:false/);
});
