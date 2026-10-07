// Hosted-only Live API checks. All accounts, messages and uploads are synthetic.
// Node contracts and syntax checks are not evidence of a hosted browser pass.
import {createTestPng} from './png-fixtures.mjs';
import {chromium, webkit, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {installLiveLifecycle, observeLivePage} from './live-browser-diagnostics.mjs';
import {reportReloadInspectorErrors} from './reload-inspector-diagnostics.mjs';

if (!process.env.CI && process.env.GW_HOSTED_BROWSER_QA !== '1') {
  throw new Error('Live API browser QA runs only in the authorized hosted CI environment.');
}
const engineName = process.env.GW_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless: true, executablePath: process.env.PW_CHROME || undefined});
const errors = [], sessions = [], passed = [], browserReads = new WeakMap();
const url = 'http://127.0.0.1:4174', output = 'docs/live-qa', started = Date.now();
let currentCheck = 'fixture setup', failure;
await mkdir(output, {recursive: true});
const errorReport = () => reportReloadInspectorErrors({engine: engineName, base: url, traces: sessions.map(({trace}) => trace)});
function assertBrowserErrors(message) {
  const report = errorReport();
  assert.deepEqual(report.domErrors, [], 'No DOM errors or unhandled promise rejections.');
  assert.deepEqual(report.fatalErrors, [], message);
}

async function settleBrowserReads(page, {since, required = []} = {}) {
  const trace = browserReads.get(page), options = {since: since ?? trace.lastDrained, required};
  let drainedThrough = options.since;
  const assertRequiredReads = (allowPendingReplacement = false) => assert.deepEqual(trace.requiredReadFailures({...options, allowPendingReplacement}), [], 'Required authenticated Live API reads succeed.');
  try {
    await expect.poll(() => {
      assertRequiredReads(true);
      const readiness = trace.readiness(options);
      if (!readiness.missing.length && !readiness.pending.length) drainedThrough = trace.sequence;
      return readiness;
    }, {message: 'Current-document Live API requests finish before deliberate navigation or closure.', timeout: 15000})
      .toEqual({missing: [], pending: []});
    assertRequiredReads();
  } catch (error) {
    trace.reportRequiredReadFailures(options);
    throw error;
  }
  trace.recordReadCancellations(options, drainedThrough);
  trace.lastDrained = drainedThrough;
  trace.log('route-reads-settled', {since: options.since, through: drainedThrough, required, pending: trace.snapshot().pending});
}
async function authenticatedRouteReady(page, {since = 0} = {}) {
  await expect(page.locator('.app:not(.is-onboarding) > header')).toBeVisible();
  await expect(page.locator('.onboard')).toHaveCount(0);
  await expect(page.getByRole('navigation', {name: 'Main navigation', exact: true})).toBeVisible();
  const type = new URL(page.url()).hash.replace(/^#\//, '').split(/[/?]/)[0] || 'home';
  const required = ['/api/state', '/api/conversations', '/api/conversations/recipients', '/api/notifications', '/api/page-content/global'];
  if (['home', 'family', 'you', 'reunion'].includes(type)) required.push('/api/page-content/' + type);
  await settleBrowserReads(page, {since, required});
}
async function person(id, width = 390, {height = 844, active = true} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const trace = observeLivePage({page, context, label: id, base: url, errors, getCheck: () => currentCheck, started});
  browserReads.set(page, trace); sessions.push({id, context, page, trace});
  await page.addInitScript(installLiveLifecycle);
  trace.beginTransition('signin', url + '/__test/signin?user=' + id);
  await page.goto(url + '/__test/signin?user=' + id);
  if (active) await authenticatedRouteReady(page);
  else {
    await expect(page.getByRole('heading', {name: 'A little about you.', exact: true})).toBeVisible();
    await settleBrowserReads(page, {since: 0, required: ['/api/config', '/api/session']});
  }
  trace.log('signin-ready');
  return page;
}
async function reloadRoute(page) {
  const trace = browserReads.get(page);
  await settleBrowserReads(page);
  const since = trace.lastDrained, target = page.url();
  trace.beginTransition('reload', target);
  await page.reload({waitUntil: 'domcontentloaded', timeout: 30000});
  await expect(page).toHaveURL(target);
  await authenticatedRouteReady(page, {since});
  trace.log('reload-ready', {pending: trace.snapshot().pending});
}
async function closePerson(page) {
  await settleBrowserReads(page);
  const session = sessions.find(value => value.page === page);
  session.trace.beginTransition('context-close');
  await session.context.close();
}
async function approvePendingMembership(page, email) {
  const pending = page.getByRole('article').filter({hasText: email});
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText(email + ' · pending');
  await pending.getByRole('button', {name: 'Review membership', exact: true}).click();
  const review = page.getByRole('dialog', {name: 'Review membership', exact: true});
  await expect(review).toBeVisible();
  await expect(review).toContainText(email + ' · pending');
  await review.getByRole('button', {name: 'Approve membership', exact: true}).click();
  await expect(review).toHaveCount(0);
  await expect(pending).toContainText(email + ' · active');
}
try{
 const noClip=async page=>{const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getClientRects().length&&!e.classList.contains('sr-only')&&!e.closest('[inert]')).map(e=>({type:e.type,label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()})).filter(e=>e.rect.left< -1||e.rect.right>innerWidth+1)}));assert.ok(geometry.scroll<=geometry.width+1&&!geometry.bad.length,'mobile form controls stay within viewport '+JSON.stringify(geometry))};
 currentCheck='320px two-step onboarding';const fresh=await person('fresh',320,{height:720,active:false});await fresh.getByRole('heading',{name:'A little about you.'}).waitFor();await noClip(fresh);await fresh.getByLabel('Your name',{exact:true}).fill('Fresh Relative');await fresh.getByLabel('Birthday',{exact:true}).fill('1990-01-01');await fresh.getByLabel(/I understand this profile/).check();await fresh.getByRole('button',{name:'Continue',exact:true}).click();await fresh.getByRole('heading',{name:'Make it yours.'}).waitFor();await fresh.getByLabel('Custom profile color').fill('#ca247c');await noClip(fresh);await fresh.screenshot({path:'docs/live-qa/onboarding-profile-320.png'});await fresh.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await fresh.getByLabel('Your name',{exact:true}).inputValue(),'Fresh Relative');await fresh.getByRole('button',{name:'Continue',exact:true}).click();await fresh.getByRole('button',{name:'Finish joining',exact:true}).click();await fresh.getByRole('button',{name:'Check my status'}).click();await fresh.getByRole('status').filter({hasText:'Still waiting for organizer approval.'}).waitFor();await noClip(fresh);await closePerson(fresh);
 currentCheck='cross-account post persistence';const alice=await person('alice');await alice.getByRole('button',{name:'Post an update',exact:true}).click();await alice.getByRole('textbox',{name:"What's on your mind"}).fill('A real persisted family update');await alice.getByRole('button',{name:'Send post',exact:true}).click();await alice.getByText('A real persisted family update',{exact:true}).waitFor();await reloadRoute(alice);await alice.getByText('A real persisted family update',{exact:true}).waitFor();
 currentCheck='cross-account reactions and comments';const bob=await person('bob',1280);await bob.getByText('A real persisted family update',{exact:true}).waitFor();const article=bob.getByRole('article').filter({hasText:'A real persisted family update'});await article.getByRole('button',{name:'Add reaction',exact:true}).click();await bob.getByRole('button',{name:'React ❤️',exact:true}).click();await article.getByRole('button',{name:'See who reacted ❤️',exact:true}).click();await bob.locator('.reaction-people-pop:popover-open').getByRole('button',{name:/Bob/}).waitFor();await bob.keyboard.press('Escape');await article.getByRole('button',{name:/Comments/}).click();await bob.getByRole('textbox',{name:'Write a comment…'}).fill('A reply from another account');{const send=bob.getByRole('button',{name:'Send',exact:true});console.log('SEND GEOMETRY',JSON.stringify(await send.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),viewport:[innerWidth,innerHeight],hit:hit?.outerHTML.slice(0,400),ancestors:[el.parentElement,el.closest('.conversation-composer'),el.closest('.detail-page')].map(a=>({class:a.className,rect:a.getBoundingClientRect().toJSON(),overflow:getComputedStyle(a).overflow}))}})));await send.click();}await bob.locator('.detail-page').getByText('A reply from another account',{exact:true}).waitFor();await bob.locator('.page-back').click();await reloadRoute(alice);await alice.getByRole('article').filter({hasText:'A real persisted family update'}).getByRole('button',{name:/Comments/}).click();await alice.locator('.detail-page').getByText('A reply from another account',{exact:true}).waitFor();await alice.locator('.page-back').click();
 currentCheck='member RSVP persistence and organizer access';await alice.getByRole('navigation').getByRole('button',{name:'You',exact:true}).click();assert.equal(await alice.getByRole('heading',{name:'Leader Tools',exact:true}).count(),0);await alice.getByRole('button',{name:/My RSVP/}).click();const rsvpCount=alice.getByRole('combobox',{name:'How many people?',exact:true});await rsvpCount.scrollIntoViewIfNeeded();await rsvpCount.click();await expect(rsvpCount).toHaveAttribute('aria-expanded','true');await rsvpCount.fill('3');const rsvpChoices=alice.getByRole('listbox',{name:'How many people?',exact:true});await expect(rsvpChoices).toBeVisible();const threePeople=rsvpChoices.getByRole('option',{name:'3',exact:true});await expect(threePeople).toBeVisible();await threePeople.click();assert.equal(await rsvpCount.inputValue(),'3','RSVP choice commits three people');assert.equal(await rsvpCount.getAttribute('aria-expanded'),'false','RSVP choice closes after selection');await alice.getByRole('button',{name:'Save RSVP',exact:true}).click();await alice.getByText('Planning to come',{exact:true}).waitFor();await reloadRoute(alice);await alice.getByRole('navigation').getByRole('button',{name:'You',exact:true}).click();await alice.getByText('Planning to come',{exact:true}).waitFor();
 currentCheck='membership approval and organizer RSVP';const owner=await person('owner',1280);await owner.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'You',exact:true}).click();await owner.getByRole('button',{name:/^People Membership/}).click();await approvePendingMembership(owner, 'pending@example.test');await owner.getByRole('navigation',{name:'Leader tools sections'}).getByRole('button',{name:'Reunion details',exact:true}).click();await owner.getByText('Planning to come · 3 people',{exact:true}).waitFor();await owner.screenshot({path:'docs/live-qa/organizer-desktop.png'});
 currentCheck='memory upload and same-tab media retry reload';await alice.getByRole('navigation').getByRole('button',{name:'Family',exact:true}).click();await alice.getByRole('tab',{name:'Memories',exact:true}).click();
 const png={name:'memory.png',mimeType:'image/png',buffer:createTestPng()};
 let failedMediaOnce=false;await alice.route('**/api/media/*',route=>{if(route.request().method()==='GET'&&!failedMediaOnce){failedMediaOnce=true;return route.fulfill({status:503,json:{error:'Synthetic transient storage failure'}})}return route.continue()});const chooserPromise=alice.waitForEvent('filechooser');await alice.getByRole('button',{name:'Add a memory',exact:true}).click();await(await chooserPromise).setFiles(png);const memoryDetails=alice.getByRole('dialog',{name:'Memory details',exact:true});await expect(memoryDetails).toBeVisible();await memoryDetails.getByText('Your memory is saved. Add any details you know, or close this window.',{exact:true}).waitFor();const memoryPhoto=memoryDetails.getByRole('img',{name:'Current memory photo',exact:true});await expect(memoryPhoto).toBeVisible();await expect.poll(()=>memoryPhoto.evaluate(img=>img.complete&&img.naturalWidth>0),{message:'The current memory photo recovers from the exercised transient private-media failure.',timeout:15000}).toBe(true);assert.equal(failedMediaOnce,true,'private media transient failure was exercised');await noClip(alice);await alice.unroute('**/api/media/*');await memoryDetails.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(memoryDetails).toHaveCount(0);await alice.waitForFunction(()=>{const img=document.querySelector('.field-memory-open img');return img?.complete&&img.naturalWidth>0});console.log('MEMORY GRID GEOMETRY',JSON.stringify(await alice.locator('.field-memory-gallery').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]}))));await reloadRoute(alice);await alice.getByRole('navigation').getByRole('button',{name:'Family',exact:true}).click();await alice.getByRole('tab',{name:'Memories',exact:true}).click();assert.equal(await alice.locator('.field-memory-open').count(),1);assert.equal(await alice.getByRole('tab',{name:'Featured photos',exact:true}).count(),0);
 currentCheck='featured photo approval';await reloadRoute(owner);await owner.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Family',exact:true}).click();await owner.getByRole('tab',{name:'Memories',exact:true}).click();await owner.getByRole('tab',{name:'Featured photos',exact:true}).click();await owner.getByRole('button',{name:'Approve photo',exact:true}).click();await owner.getByRole('button',{name:'Use as main photo',exact:true}).click();await owner.getByText('Main photo',{exact:true}).waitFor();await owner.waitForFunction(()=>{const img=document.querySelector('.featured-photo-row img');return img?.complete&&img.naturalWidth>0},null,{timeout:15000});assert.ok(await owner.locator('.featured-photo-row img').evaluate(img=>img.complete&&img.naturalWidth>0),'another approved member renders the featured image');await owner.screenshot({path:'docs/live-qa/featured-photos-desktop.png'});
 await alice.screenshot({path:'docs/live-qa/live-memories-mobile.png'});
 for (const {page} of sessions) if (!page.isClosed()) await settleBrowserReads(page);
 assertBrowserErrors('No unhandled browser exceptions.');
 passed.push('cross-account post persistence', 'cross-account comments', 'RSVP persistence', 'role-scoped organizer',
   'membership approval', '320px two-step onboarding and visible status feedback', 'one-tap media upload with optional details',
   'same-tab reload after private image retry', 'admin-only featured photo approval');
} catch (error) {
 failure = error.stack || error.message;
 console.error('GW LIVE FAILURE', failure);
 console.log('::error title=GW live browser::' + String(failure).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D'));
 for (const {id, page, trace} of sessions) {
   console.error('LIVE FAILURE TIMELINE', JSON.stringify({user: id, ...trace.snapshot()}));
   if (page.isClosed()) continue;
   console.log('Failed-page text', (await page.locator('body').innerText({timeout: 5000}).catch(() => '<body unavailable>')).slice(-1200));
   console.log('Input geometry', await page.locator('input,select,textarea').evaluateAll(es => es.map(e => ({type: e.type, label: e.getAttribute('aria-label'), class: e.className, rect: e.getBoundingClientRect().toJSON()}))).catch(() => '<geometry unavailable>'));
   await page.screenshot({path: `${output}/failure-${id}-${engineName}.png`, timeout: 5000}).catch(() => {});
 }
 throw error;
} finally {
 const scenarioFailed = !!failure;
 const persist = () => Promise.all([
   writeFile(`${output}/results.json`, JSON.stringify({browser: engineName, passed, pageErrors: errors, ...errorReport(),
     classifiedReadCancellations: sessions.flatMap(({id, trace}) => trace.classifiedReadCancellations.map(value => ({user: id, ...value}))), ...(failure ? {failure} : {})}, null, 2)),
   writeFile(`${output}/network-${engineName}.json`, JSON.stringify({browser: engineName, pages: sessions.map(({id, trace}) => ({
     user: id, documentEpoch: trace.documentEpoch, documentTimeOrigin: trace.documentTimeOrigin, reads: trace.reads,
     classifiedReadCancellations: trace.classifiedReadCancellations, droppedEvents: trace.droppedEvents, pending: trace.snapshot().pending, transitions: trace.transitions, events: trace.events,
   }))}, null, 2)),
 ]);
 await persist();
 currentCheck = 'browser cleanup';
 for (const {page, trace} of sessions) if (!page.isClosed()) trace.beginTransition('browser-close');
 try {await browser.close();} finally {
   const report = errorReport();
   console.log('LIVE BROWSER ERROR CLASSIFICATION', JSON.stringify({pageErrorCount: report.pageErrorCount,
     classifiedInspectorCount: report.classifiedInspectorCount, fatalErrorCount: report.fatalErrors.length, domErrorCount: report.domErrors.length}));
   if (!failure && (report.fatalErrors.length || report.domErrors.length)) failure = 'Unhandled browser exceptions were observed during browser cleanup.';
   await persist();
 }
 if (!scenarioFailed) assertBrowserErrors('No unhandled browser exceptions, including browser cleanup.');
}
