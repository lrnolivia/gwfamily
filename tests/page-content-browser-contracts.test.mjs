// Node-only contracts for hosted browser diagnostics. No browser is launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {routeFromHash} from '../src/navigation.js';
import {cmsFailureAnnotation, installCmsNotificationTrace} from './page-content-browser-diagnostics.mjs';
const source = readFileSync(new URL('./page-content-browser.mjs', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function observeBrowser('), source.indexOf('async function person('));
const navigation = source.slice(source.indexOf('async function navigate('), source.indexOf('async function edit('));
const base = 'http://127.0.0.1:4176';
class Page extends EventEmitter {
  constructor() {super(); this.currentUrl = base + '/#/family'; this.frame = {url: () => this.url()};}
  url() {return this.currentUrl;}
  mainFrame() {return this.frame;}
}
function lifecycle(page, event, timeOrigin, extra = {}) {
  page.emit('console', {text: () => '__GW_CMS_LIFECYCLE__' + JSON.stringify({event, url: page.url(), timeOrigin, ...extra})});
}
function commitDocument(page, url, timeOrigin = 200000) {
  page.currentUrl = url;
  page.emit('framenavigated', page.mainFrame());
  lifecycle(page, 'new-document', timeOrigin);
}
function observed({initialize = true} = {}) {
  let now = 1000, afterReady;
  const annotations = [];
  const context = vm.createContext({Date: class extends Date {static now() {return now;}}, URL, Object, Map, WeakMap, JSON, assert, base, cmsFailureAnnotation, currentCheck: 'synthetic contract', traceStarted: 0, browserReads: new WeakMap(), errors: [], console: {error() {}, log(value) {annotations.push(value);}},
    // Immediate probes make these pure event contracts, not timing simulations.
    expect: {poll: probe => ({async toEqual(wanted) {assert.equal(JSON.stringify(probe()), JSON.stringify(wanted)); afterReady?.();}})},
  });
  vm.runInContext(helpers, context);
  const page = new Page(), trace = context.observeBrowser(page, 'alice');
  if (initialize) lifecycle(page, 'new-document', 100000);
  return {page, trace, errors: context.errors, annotations, time: ms => {now = ms;}, onReady: callback => {afterReady = callback;}, settle: options => context.settleBrowserReads(page, options)};
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

test('CMS notification observation preserves native fetch identity and records the abort call site', () => {
  const records = [], calls = [], promise = Promise.resolve('native result');
  Object.defineProperty(promise, 'then', {value() {throw new Error('Must not chain or handle native fetch');}});
  const window = {fetch(...args) {calls.push({receiver: this, args}); return promise;}}; window.top = window;
  vm.runInNewContext('(' + installCmsNotificationTrace.toString() + ')()', {
    window, URL, location: {origin: base, href: base + '/?qa=synthetic#/family'},
    performance: {timeOrigin: 123, now: () => 4}, document: {readyState: 'complete'},
    console: {log: value => records.push(JSON.parse(value.slice('__GW_CMS_LIFECYCLE__'.length)))},
  });
  const controller = new AbortController(), options = {signal: controller.signal}, receiver = {};
  assert.equal(window.fetch.call(receiver, '/api/notifications?token=never-log-query', options), promise);
  assert.equal(calls[0].receiver, receiver); assert.equal(calls[0].args[1], options);
  controller.abort();
  assert.deepEqual(records.map(value => [value.event, value.request, value.aborted]), [['notification-fetch', 1, false], ['notification-abort', 1, true]]);
  assert.equal(records[1].timeOrigin, 123); assert.equal(records[1].documentMs, 4);
  assert.match(records[1].stack, /Notification AbortSignal fired/);
  assert.doesNotMatch(JSON.stringify(records), /never-log-query/);
  assert.equal(window.fetch('/api/state'), promise); assert.equal(window.fetch('https://elsewhere.test/api/notifications'), promise);
  assert.equal(window.fetch(null), promise); assert.equal(records.length, 2);
  const requestController = new AbortController();
  assert.equal(window.fetch({url: base + '/api/notifications', signal: requestController.signal}), promise);
  requestController.abort(); assert.equal(records.at(-1).request, 2);
  const subframe = {fetch: window.fetch, top: {}};
  vm.runInNewContext('(' + installCmsNotificationTrace.toString() + ')()', {window: subframe});
  assert.equal(subframe.fetch, window.fetch, 'Subframes are not wrapped.');
  assert.match(source, /await page\.addInitScript\(installCmsNotificationTrace\)/);
});

test('CMS compact failure annotation correlates the current document, notification request and abort stack', () => {
  const {page, trace, errors, annotations} = observed(), target = base + '/?qa=next#/family';
  trace.beginNavigation(target); commitDocument(page, target);
  const req = request(page, '/api/notifications?token=never-log-token'); page.emit('request', req); finish(page, req);
  lifecycle(page, 'notification-fetch', 200000, {request: 1, aborted: false});
  lifecycle(page, 'notification-abort', 200000, {request: 1, aborted: true,
    stack: 'abort@' + base + '/react-app.js?v=never-log-version:123:45', body: 'never-log-body'});
  page.emit('pageerror', new Error('Fetch API cannot load ' + req.url() + ' due to access control checks.'));
  assert.equal(errors.length, 1); assert.equal(errors[0].documentEpoch, 2); assert.equal(errors[0].documentTimeOrigin, 200000);
  const prefix = '::error title=GW CMS request failure::', annotation = annotations.at(-1);
  assert.ok(annotation.startsWith(prefix)); assert.ok(annotation.length < 4096);
  const compact = JSON.parse(annotation.slice(prefix.length).replaceAll('%0A', '\n').replaceAll('%0D', '\r').replaceAll('%25', '%'));
  assert.equal(compact.epoch, 2); assert.equal(compact.timeOrigin, 200000);
  assert.equal(compact.reads[0].status, 200); assert.equal(compact.reads[0].epoch, 2); assert.equal(compact.reads[0].timeOrigin, 200000);
  assert.ok(Number.isFinite(compact.reads[0].end)); assert.ok(Number.isFinite(compact.navigation[0].commit));
  assert.equal(compact.navigation[0].sourceEpoch, 1); assert.equal(compact.navigation[0].targetEpoch, 2);
  assert.equal(compact.lifecycle.at(-1).event, 'notification-abort'); assert.equal(compact.lifecycle.at(-1).request, 1);
  assert.match(compact.lifecycle.at(-1).stack, /react-app\.js:123:45/);
  assert.doesNotMatch(annotation, /never-log-token|never-log-version|never-log-body/);
  assert.doesNotMatch(JSON.stringify(trace.events), /never-log-body/);
});

test('CMS lifecycle stacks and compact annotations remain bounded without dropping pageerrors', () => {
  const {page, trace, errors, annotations} = observed();
  for (let index = 0; index < 8; index++) lifecycle(page, 'notification-abort', 100000, {request: index + 1, stack: '%'.repeat(8000)});
  assert.equal(trace.events.at(-1).stack.length, 4000);
  const error = new Error('/api/notifications' + '%'.repeat(8000)); error.stack = '%'.repeat(8000);
  page.emit('pageerror', error);
  assert.equal(errors.length, 1); assert.equal(annotations.length, 1); assert.ok(annotations[0].length < 4096);
  assert.doesNotThrow(() => JSON.parse(annotations[0].split('::').at(-1).replaceAll('%25', '%')));
});
