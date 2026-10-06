// Node-only contracts for hosted browser diagnostics. No browser is launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {routeFromHash} from '../src/navigation.js';
const source = readFileSync(new URL('./page-content-browser.mjs', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function observeBrowser('), source.indexOf('async function person('));
const navigation = source.slice(source.indexOf('async function navigate('), source.indexOf('async function edit('));
const base = 'http://127.0.0.1:4176';
class Page extends EventEmitter {
  constructor() {super(); this.currentUrl = base + '/#/family'; this.frame = {url: () => this.url()};}
  url() {return this.currentUrl;}
  mainFrame() {return this.frame;}
}
function lifecycle(page, event, timeOrigin) {
  page.emit('console', {text: () => '__GW_CMS_LIFECYCLE__' + JSON.stringify({event, url: page.url(), timeOrigin})});
}
function commitDocument(page, url, timeOrigin = 200000) {
  page.currentUrl = url;
  page.emit('framenavigated', page.mainFrame());
  lifecycle(page, 'new-document', timeOrigin);
}
function observed({initialize = true} = {}) {
  let now = 1000, afterReady;
  const context = vm.createContext({Date: class extends Date {static now() {return now;}}, URL, Object, Map, WeakMap, JSON, assert, base, currentCheck: 'synthetic contract', traceStarted: 0, browserReads: new WeakMap(), errors: [], console: {error() {}},
    // Immediate probes make these pure event contracts, not timing simulations.
    expect: {poll: probe => ({async toEqual(wanted) {assert.equal(JSON.stringify(probe()), JSON.stringify(wanted)); afterReady?.();}})},
  });
  vm.runInContext(helpers, context);
  const page = new Page(), trace = context.observeBrowser(page, 'alice');
  if (initialize) lifecycle(page, 'new-document', 100000);
  return {page, trace, errors: context.errors, time: ms => {now = ms;}, onReady: callback => {afterReady = callback;}, settle: options => context.settleBrowserReads(page, options)};
}
function request(page, path, failure) {
  return {frame: () => page.mainFrame(), url: () => base + path, method: () => 'GET', resourceType: () => 'fetch', isNavigationRequest: () => false, failure: () => failure ? {errorText: failure} : null};
}
function finish(page, req, status = 200) {
  page.emit('response', {request: () => req, status: () => status, url: req.url, headers: () => ({'content-type': 'application/json', 'set-cookie': 'never-log-this', 'access-control-allow-origin': base})});
  page.emit('requestfinished', req);
}
test('shared-page navigation waits for authenticated content and successful initial reads on both sides of hard navigation', () => {
  assert.match(navigation, /\.app:not\(\.is-onboarding\) > header/);
  assert.match(navigation, /locator\('\.onboard'\)\)\.toHaveCount\(0\)/);
  assert.match(navigation, /getByRole\('navigation', \{name: 'Main navigation', exact: true\}\)\)\.toBeVisible\(\)/);
  assert.match(navigation, /expect\(page\)\.toHaveURL\(target\)/);
  assert.ok(navigation.indexOf('await settleBrowserReads(page);') < navigation.indexOf('await page.goto('));
  assert.ok(navigation.indexOf('trace.beginNavigation(target);') > navigation.indexOf('await settleBrowserReads(page);'));
  assert.ok(navigation.indexOf('trace.beginNavigation(target);') < navigation.indexOf('await page.goto('));
  assert.match(navigation, /const since = trace\.lastDrained,/);
  assert.ok(navigation.indexOf('await settleBrowserReads(page, {since, required});') > navigation.indexOf('await page.goto('));
  for (const path of ['/api/state', '/api/conversations', '/api/conversations/recipients', '/api/page-content/global', '/api/directory', '/api/page-content/people']) assert.ok(navigation.includes(path));
  assert.match(navigation, /required\.push\('\/api\/page-content\/' \+ route\)/);
  assert.doesNotMatch(navigation, /waitForTimeout|networkidle|route\.abort/);
});
test('Memories checks reach the real Family tab rather than the unknown-route Home fallback', () => {
  const routeSource = source.slice(source.indexOf('function sharedPageRoute('), source.indexOf('async function navigate('));
  const sharedPageRoute = vm.runInNewContext(routeSource + '; sharedPageRoute;');
  assert.deepEqual(routeFromHash('#/' + sharedPageRoute('memories')), {type: 'family', tab: 'memories'});
  assert.deepEqual(routeFromHash('#/' + sharedPageRoute('profile', 'member/1')), {type: 'profile', id: 'member/1'});
  assert.match(navigation, /required\.push\('\/api\/page-content\/family'\)/);
  assert.match(navigation, /name: 'Memories', exact: true.*toHaveAttribute\('aria-selected', 'true'\)/);
});
test('read readiness requires observed requested endpoints and completed network bodies', async () => {
  const {page, trace, settle} = observed(), req = request(page, '/api/page-content/family');
  await assert.rejects(settle({required: ['/api/page-content/family']}));
  page.emit('request', req);
  await assert.rejects(settle({required: ['/api/page-content/family']}));
  finish(page, req);
  await settle({required: ['/api/page-content/family']});
  assert.equal(trace.pending.size, 0);
  assert.equal(trace.lastDrained, trace.sequence);
});
test('normal browser 401, 403, 503 and current-document cancelled reads all fail readiness', async () => {
  for (const status of [401, 403, 503]) {
    const {page, settle} = observed(), req = request(page, '/api/directory');
    page.emit('request', req); finish(page, req, status);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
  for (const failure of ['cancelled', 'Load request cancelled', 'net::ERR_ABORTED']) {
    const {page, settle} = observed(), req = request(page, '/api/conversations', failure);
    page.emit('request', req); page.emit('requestfailed', req);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
});
test('requests arriving as the readiness assertion resolves are not silently marked drained', async () => {
  const {page, trace, settle, onReady} = observed();
  const initial = request(page, '/api/state'); page.emit('request', initial); finish(page, initial);
  const late = request(page, '/api/conversations', 'Load request cancelled');
  onReady(() => {page.emit('request', late); onReady(null);});
  await settle({required: ['/api/state']});
  assert.equal(trace.lastDrained, 1);
  assert.equal(trace.sequence, 2);
  assert.equal(trace.pending.size, 1);
  page.emit('requestfailed', late);
  await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
});
test('late outgoing-document cancellation is classified only after confirmed replacement and successful current reads', async () => {
  const {page, trace, settle, time} = observed();
  const since = trace.sequence, target = base + '/?qa=next-document#/family';
  // Reproduce the reported 81370 -> 81378 ms WebKit cancellation, with
  // explicit synthetic navigation/epoch evidence absent from the old trace.
  time(81369); trace.beginNavigation(target);
  time(81370); const oldRead = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', oldRead);
  time(81378); page.emit('requestfailed', oldRead);
  await assert.rejects(settle({since}), /Normal same-origin browser reads succeed/, 'An uncommitted navigation is insufficient.');
  time(81380); commitDocument(page, target);
  await assert.rejects(settle({since, required: ['/api/conversations']}), 'An old cancellation cannot satisfy the new document read.');
  const currentRead = request(page, '/api/conversations'); page.emit('request', currentRead); finish(page, currentRead);
  await settle({since, required: ['/api/conversations']});
  assert.equal(trace.reads[0].documentEpoch, 1);
  assert.equal(trace.reads[1].documentEpoch, 2);
  assert.equal(trace.events.filter(event => event.type === 'superseded-document-read-cancelled').length, 1);
  assert.equal(trace.pending.size, 0);
});
test('confirmed replacement tolerates lifecycle event ordering and body cancellation after commit', async () => {
  for (const order of ['frame-first', 'init-first']) for (const failure of ['Load request cancelled', 'net::ERR_ABORTED']) {
    const {page, trace, settle} = observed(), target = base + '/?qa=replacement#/family';
    const req = request(page, '/api/conversations', failure); page.emit('request', req);
    trace.beginNavigation(target);
    page.currentUrl = target;
    if (order === 'frame-first') page.emit('framenavigated', page.mainFrame());
    lifecycle(page, 'new-document', 200000);
    if (order === 'init-first') page.emit('framenavigated', page.mainFrame());
    page.emit('requestfailed', req);
    const current = request(page, '/api/conversations'); page.emit('request', current); finish(page, current);
    await settle({required: ['/api/conversations']});
    assert.equal(trace.events.filter(event => event.type === 'superseded-document-read-cancelled').length, 1);
  }
});
test('an old successful read cannot satisfy a required new-document endpoint', async () => {
  const {page, trace, settle} = observed(), target = base + '/?qa=replacement#/family';
  const oldRead = request(page, '/api/conversations'); page.emit('request', oldRead); finish(page, oldRead);
  trace.beginNavigation(target); commitDocument(page, target);
  await assert.rejects(settle({required: ['/api/conversations']}));
  const currentRead = request(page, '/api/conversations'); page.emit('request', currentRead); finish(page, currentRead);
  await settle({required: ['/api/conversations']});
});
test('replacement-document cancellation remains a failure even if the same required endpoint later succeeds', async () => {
  const {page, trace, settle} = observed(), target = base + '/?qa=replacement#/family';
  trace.beginNavigation(target); commitDocument(page, target);
  const cancelled = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', cancelled); page.emit('requestfailed', cancelled);
  const succeeded = request(page, '/api/conversations'); page.emit('request', succeeded); finish(page, succeeded);
  await assert.rejects(settle({required: ['/api/conversations']}), /Normal same-origin browser reads succeed/);
});
test('cancellation that predates navigation is not excused, even in the same clock millisecond', async () => {
  const {page, trace, settle} = observed(), target = base + '/?qa=replacement#/family';
  const req = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', req); page.emit('requestfailed', req);
  trace.beginNavigation(target); commitDocument(page, target);
  assert.equal(trace.reads[0].finishedMs, trace.navigations[0].startedMs);
  await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
});
test('replacement requires both explicit navigation and new-document plus matching main-frame evidence', async () => {
  for (const absent of ['navigation-start', 'new-document', 'main-frame', 'matching-target', 'document-identity']) {
    const {page, trace, settle} = observed({initialize: absent !== 'document-identity'}), target = base + '/?qa=replacement#/family';
    if (absent !== 'navigation-start') trace.beginNavigation(target);
    const req = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', req); page.emit('requestfailed', req);
    page.currentUrl = absent === 'matching-target' ? base + '/?qa=different#/family' : target;
    if (absent !== 'main-frame') page.emit('framenavigated', page.mainFrame());
    if (absent !== 'new-document') lifecycle(page, 'new-document', 200000);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/, absent);
  }
});
test('same-document hash navigation and uncertain frame-commit gaps cannot excuse cancellations', async () => {
  {
    const {page, trace, settle} = observed(), target = base + '/#/family?tab=memories';
    trace.beginNavigation(target);
    const req = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', req);
    page.currentUrl = target; page.emit('framenavigated', page.mainFrame()); page.emit('requestfailed', req);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
  {
    const {page, trace, settle} = observed(), target = page.url();
    trace.beginNavigation(target);
    page.emit('framenavigated', page.mainFrame());
    const req = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', req);
    assert.equal(trace.reads[0].documentEpoch, null, 'Same-URL reload must not attribute an uncertain request to the outgoing epoch.');
    lifecycle(page, 'new-document', 200000); page.emit('requestfailed', req);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
});
test('teardown never excuses HTTP/auth failures or non-cancellation network failures', async () => {
  for (const status of [401, 403, 503, undefined]) {
    const {page, trace, settle} = observed(), target = base + '/?qa=replacement#/family';
    trace.beginNavigation(target);
    const req = request(page, '/api/conversations', status === undefined ? 'net::ERR_FAILED' : 'Load request cancelled'); page.emit('request', req);
    if (status !== undefined) page.emit('response', {request: () => req, status: () => status, url: req.url, headers: () => ({})});
    commitDocument(page, target); page.emit('requestfailed', req);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
});
test('requests without positive main-frame identity cannot receive an outgoing-document exemption', async () => {
  for (const frame of [() => ({}), () => {throw new Error('Service worker has no frame');}]) {
    const {page, trace, settle} = observed(), target = base + '/?qa=replacement#/family';
    trace.beginNavigation(target);
    const req = {...request(page, '/api/conversations', 'Load request cancelled'), frame}; page.emit('request', req);
    assert.equal(trace.reads[0].documentEpoch, null);
    commitDocument(page, target); page.emit('requestfailed', req);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
  assert.match(source, /if \(window === window\.top\) console\.log\('__GW_CMS_LIFECYCLE__'/);
});
test('confirmed teardown still retains every access-control pageerror', async () => {
  const {page, trace, errors, settle} = observed(), target = base + '/?qa=replacement#/family';
  trace.beginNavigation(target);
  const req = request(page, '/api/conversations', 'Load request cancelled'); page.emit('request', req);
  commitDocument(page, target); page.emit('requestfailed', req);
  page.emit('pageerror', new Error('Fetch API cannot load due to access control checks.'));
  await settle();
  assert.equal(errors.length, 1);
  assert.match(source, /assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions\.'\)/);
});
test('access-control pageerrors retain error, URL, request status/failure, and strict final assertion', () => {
  const {page, errors} = observed(), req = request(page, '/api/conversations', 'cancelled');
  page.emit('request', req); page.emit('requestfailed', req);
  const message = 'Fetch API cannot load ' + req.url() + ' due to access control checks.';
  page.emit('pageerror', new Error(message));
  assert.equal(errors.length, 1); assert.equal(errors[0].error, message);
  assert.equal(errors[0].document, page.url());
  assert.equal(errors[0].recentEvents.at(-1).failure, 'cancelled');
  assert.match(source, /assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions\.'\)/);
  assert.match(source, /if \(id !== 'anonymous' && id !== 'pending'\) await settleBrowserReads\(page\)/);
  assert.doesNotMatch(source, /errors\.filter\(|preventDefault\(\).*emit\(|ignoreHTTPSErrors|disable-web-security/);
});
test('diagnostic history stays bounded and never captures cookies or response bodies', () => {
  const {page, trace} = observed(), req = request(page, '/api/page-content/family');
  page.emit('request', req); finish(page, req);
  assert.ok(!JSON.stringify(trace.events).includes('never-log-this'));
  assert.equal(trace.events.find(event => event.type === 'response').headers['access-control-allow-origin'], base);
  for (let i = 0; i < 700; i++) trace.log('synthetic-event');
  assert.equal(trace.events.length, 600); assert.ok(trace.droppedEvents > 0);
  for (let i = 0; i < 110; i++) trace.beginNavigation(base + '/?qa=' + i + '#/family');
  assert.equal(trace.navigations.length, 100);
  assert.match(source, /navigations: trace\.navigations, droppedEvents:/);
  assert.match(source, /network-\$\{engineName\}\.json/);
  assert.match(source, /addEventListener\('unhandledrejection'/);
  assert.match(source, /\['beforeunload', 'pagehide', 'pageshow'\]/);
});
