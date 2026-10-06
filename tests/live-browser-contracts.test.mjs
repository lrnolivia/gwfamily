// Node-only contracts; these do not launch a browser or establish a hosted pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {LIVE_LIFECYCLE_PREFIX, installLiveLifecycle, observeLivePage, liveFailureAnnotation} from './live-browser-diagnostics.mjs';

const base = 'http://127.0.0.1:4174';
const source = readFileSync(new URL('./live-browser.mjs', import.meta.url), 'utf8');
const diagnosticSource = readFileSync(new URL('./live-browser-diagnostics.mjs', import.meta.url), 'utf8');
const vmAssert = {deepEqual: (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message)};
class Frame {
  path = '/#/home';
  detached = false;
  url() {return base + this.path;}
  isDetached() {return this.detached;}
}
class Page extends EventEmitter {
  frame = new Frame();
  url() {return this.frame.url();}
  mainFrame() {return this.frame;}
}
function lifecycle(page, event = 'new-document', timeOrigin = 100, extra = {}) {
  page.emit('console', {text: () => LIVE_LIFECYCLE_PREFIX + JSON.stringify({event, timeOrigin,
    url: base + '/', documentMs: 0, readyState: 'loading', ...extra})});
}
function observed() {
  const page = new Page(), context = new EventEmitter(), errors = [];
  let check = 'synthetic setup';
  const trace = observeLivePage({page, context, label: 'alice', base, errors, getCheck: () => check});
  trace.beginTransition('signin', base + '/__test/signin?user=alice');
  page.emit('framenavigated', page.frame); lifecycle(page);
  return {page, context, trace, errors, check: value => {check = value;}};
}
function request(page, path = '/api/notifications?limit=30', {method = 'GET', failure, resource = 'fetch', frame = page.mainFrame()} = {}) {
  return {url: () => base + path, method: () => method, resourceType: () => resource, isNavigationRequest: () => false,
    frame: () => frame, failure: () => failure ? {errorText: failure} : null,
    postDataJSON() {throw new Error('Body access forbidden');}, headers() {throw new Error('Request header access forbidden');},
  };
}
function response(page, req, status = 200) {
  page.emit('response', {request: () => req, status: () => status, url: req.url,
    headers: () => ({'content-type': 'application/json', 'set-cookie': 'never-log-cookie', authorization: 'never-log-token',
      location: '/?secret=never-log-location', 'access-control-allow-origin': base}),
    body() {throw new Error('Body access forbidden');}, json() {throw new Error('Body access forbidden');},
  });
}
function finish(page, req, status = 200) {response(page, req, status); page.emit('requestfinished', req);}

test('Live readiness waits for successful current-document notification bodies, not response headers', () => {
  const {page, trace, check} = observed(), req = request(page);
  check('synthetic authenticated home'); page.emit('request', req); response(page, req);
  assert.deepEqual(trace.readiness({required: ['/api/notifications']}).missing, ['/api/notifications']);
  assert.equal(trace.readiness().pending.length, 1);
  page.emit('requestfinished', req);
  assert.deepEqual(trace.readiness({required: ['/api/notifications']}), {missing: [], pending: []});
  assert.deepEqual(trace.requiredReadFailures({required: ['/api/notifications']}), []);
  const events = trace.events.filter(event => ['request', 'response', 'requestfinished'].includes(event.type));
  assert.deepEqual(events.map(event => event.id), [1, 1, 1]);
  assert.equal(events[0].documentEpoch, 1); assert.equal(events[0].documentTimeOrigin, 100);
  assert.equal(events[0].check, 'synthetic authenticated home');
  assert.ok(events[2].finishedEvent > events[0].startedEvent);
});

test('Live drain keeps requests arriving as the readiness promise resolves unacknowledged', async () => {
  const {page, trace} = observed(), first = request(page), late = request(page);
  page.emit('request', first); finish(page, first);
  const completedThrough = trace.sequence, browserReads = new WeakMap([[page, trace]]);
  const helper = source.slice(source.indexOf('async function settleBrowserReads('), source.indexOf('async function authenticatedRouteReady('));
  const context = vm.createContext({browserReads, assert: vmAssert, expect: {poll: probe => ({async toEqual(wanted) {
    assert.equal(JSON.stringify(probe()), JSON.stringify(wanted));
    page.emit('request', late);
  }})}});
  vm.runInContext(helper, context);
  await context.settleBrowserReads(page, {since: 0, required: ['/api/notifications']});
  assert.equal(trace.lastDrained, completedThrough);
  assert.equal(trace.pending.size, 1); assert.ok(trace.snapshot().pending[0].id > trace.lastDrained);
});

test('Live drain cannot acknowledge a required failure that arrives while its assertion resolves', async () => {
  const {page, trace} = observed(), first = request(page), late = request(page);
  page.emit('request', first); finish(page, first);
  const browserReads = new WeakMap([[page, trace]]);
  const helper = source.slice(source.indexOf('async function settleBrowserReads('), source.indexOf('async function authenticatedRouteReady('));
  const context = vm.createContext({browserReads, assert: vmAssert, expect: {poll: probe => ({async toEqual(wanted) {
    assert.equal(JSON.stringify(probe()), JSON.stringify(wanted));
    page.emit('request', late); finish(page, late, 403);
  }})}});
  vm.runInContext(helper, context);
  await assert.rejects(context.settleBrowserReads(page, {since: 0, required: ['/api/notifications']}), /Required authenticated Live API reads succeed/);
  assert.equal(trace.lastDrained, 0);
});

test('Live normal authenticated reads reject 401, 403, 503 and all transport failures without exceptions for navigation', () => {
  for (const status of [401, 403, 503]) {
    const {page, trace} = observed(), req = request(page);
    page.emit('request', req); finish(page, req, status);
    assert.equal(trace.requiredReadFailures({required: ['/api/notifications']})[0].status, status);
    assert.deepEqual(trace.readiness({required: ['/api/notifications']}).missing, ['/api/notifications']);
  }
  for (const failure of ['Load request cancelled', 'net::ERR_ABORTED', 'Access control checks failed']) {
    const {page, trace} = observed(), req = request(page, '/api/notifications', {failure});
    page.emit('request', req); trace.beginTransition('reload'); response(page, req); page.emit('requestfailed', req);
    assert.equal(trace.requiredReadFailures({required: ['/api/notifications']})[0].failure, failure);
  }
});

test('Live explicit synthetic media retry remains visible without inventing a successful-status contract for it', () => {
  const {page, trace} = observed(), req = request(page, '/api/media/synthetic', {resource: 'image'});
  page.emit('request', req); finish(page, req, 503);
  assert.equal(trace.events.at(-1).status, 503);
  assert.deepEqual(trace.requiredReadFailures({required: ['/api/notifications']}), []);
  assert.match(source, /failedMediaOnce=true;return route\.fulfill\(\{status:503/);
  assert.match(source, /assert\.equal\(failedMediaOnce,true,'private media transient failure was exercised'\)/);
});

test('Live reload cannot borrow a late successful notification read from the outgoing document', () => {
  const {page, trace} = observed(), old = request(page);
  page.emit('request', old); trace.beginTransition('reload');
  page.emit('framenavigated', page.frame); lifecycle(page, 'new-document', 200); finish(page, old);
  assert.equal(trace.documentEpoch, 2);
  assert.deepEqual(trace.readiness({since: 0, required: ['/api/notifications']}).missing, ['/api/notifications']);
  const next = request(page); page.emit('request', next); finish(page, next);
  assert.deepEqual(trace.readiness({since: 0, required: ['/api/notifications']}), {missing: [], pending: []});
  assert.equal(trace.reads[0].documentTimeOrigin, 100); assert.equal(trace.reads[1].documentTimeOrigin, 200);
  const reload = trace.transitions.at(-1);
  assert.equal(reload.sourceTimeOrigin, 100); assert.equal(reload.targetTimeOrigin, 200);
  assert.ok(reload.committedEvent > reload.startedEvent); assert.ok(reload.documentStartedEvent > reload.committedEvent);
});

test('Live read identity is conservative during commit/init ordering gaps and ignores same-document hash navigation', () => {
  const {page, trace} = observed();
  page.frame.path = '/#/you'; page.emit('framenavigated', page.frame);
  assert.equal(trace.documentEpoch, 1, 'A SPA URL change is not a new document.');
  trace.beginTransition('reload'); page.emit('framenavigated', page.frame);
  const gap = request(page); page.emit('request', gap);
  assert.equal(trace.reads.at(-1).documentEpoch, null);
  lifecycle(page, 'new-document', 200); finish(page, gap);
  assert.deepEqual(trace.readiness({required: ['/api/notifications']}).missing, ['/api/notifications']);
  // Init delivery before the frame event is also allowed, with a real new identity.
  trace.beginTransition('reload'); lifecycle(page, 'new-document', 300); page.emit('framenavigated', page.frame);
  const next = request(page); page.emit('request', next); finish(page, next);
  assert.equal(trace.reads.at(-1).documentTimeOrigin, 300);
  assert.deepEqual(trace.readiness({required: ['/api/notifications']}), {missing: [], pending: []});
});

test('Live pending writes and background notification polls remain observed across explicit closure', () => {
  const {page, context, trace} = observed();
  const write = request(page, '/api/commands', {method: 'POST'}), poll = request(page);
  page.emit('request', write); page.emit('request', poll);
  assert.equal(trace.readiness().pending.length, 2);
  trace.beginTransition('context-close'); lifecycle(page, 'pagehide'); page.emit('close'); context.emit('close');
  assert.equal(trace.events.at(-1).type, 'context-close'); assert.equal(trace.events.at(-1).pending.length, 2);
  assert.equal(trace.snapshot().transitions.at(-1).type, 'context-close');
  assert.deepEqual(trace.events.find(event => event.type === 'context-close-start').pending.map(value => value.id), [1, 2]);
});

test('every Live access-control pageerror remains a failure with reload/poll correlation and bounded stack', () => {
  const {page, trace, errors, check} = observed(), req = request(page, '/api/notifications?limit=30', {failure: 'Load request cancelled'});
  check('synthetic reload'); page.emit('request', req); trace.beginTransition('reload');
  lifecycle(page, 'beforeunload'); response(page, req); page.emit('requestfailed', req);
  const error = new Error('Fetch API cannot load ' + base + '/api/notifications?limit=30 due to access control checks.');
  error.stack = 'synthetic stack\n'.repeat(700);
  const original = console.error, originalLog = console.log; console.error = () => {}; console.log = () => {};
  try {
    page.emit('pageerror', error);
    trace.beginTransition('browser-close'); page.emit('pageerror', new Error('Cleanup failure'));
  } finally {console.error = original; console.log = originalLog;}
  assert.equal(errors.length, 2); assert.match(errors[0].error, /access control checks/); assert.equal(errors[0].stack.length, 4000);
  assert.equal(errors[0].check, 'synthetic reload'); assert.equal(errors[0].transitions.at(-1).type, 'reload');
  assert.equal(errors[0].recentEvents.at(-1).failure, 'Load request cancelled');
  assert.equal(errors[0].recentEvents.at(-1).status, 200);
  assert.equal(errors[1].transitions.at(-1).type, 'browser-close');
});

test('Live diagnostics retain bounded traffic metadata and exclude bodies, credentials and query values', () => {
  const {page, trace} = observed(), pending = request(page, '/api/state'); page.emit('request', pending);
  for (let index = 0; index < 350; index++) {
    const req = request(page, '/api/notifications?token=never-log-query'); page.emit('request', req); finish(page, req);
  }
  lifecycle(page, 'pageshow', 100, {body: 'never-log-body', token: 'never-log-console-token'});
  page.emit('console', {text: () => 'unrelated private content'});
  const serialized = JSON.stringify(trace.events);
  assert.doesNotMatch(serialized, /never-log|private content|[?]token/);
  assert.equal(trace.events.length, 700); assert.equal(trace.reads.length, 300); assert.ok(trace.droppedEvents > 0);
  assert.equal(trace.snapshot().pending[0].path, '/api/state'); assert.equal(trace.snapshot().recentEvents.length, 40);
});

test('Live document lifecycle only observes exceptions and records true document time identity', () => {
  const listeners = new Map(), records = [], window = {};
  window.top = window;
  vm.runInNewContext('(' + installLiveLifecycle.toString() + ')()', {
    window, location: {origin: base, pathname: '/'}, performance: {timeOrigin: 123, now: () => 4}, document: {readyState: 'loading'},
    console: {log: value => records.push(JSON.parse(value.slice(LIVE_LIFECYCLE_PREFIX.length)))},
    addEventListener: (event, callback) => listeners.set(event, callback),
  });
  for (const event of ['beforeunload', 'pagehide', 'pageshow', 'error', 'unhandledrejection']) assert.ok(listeners.has(event));
  const fail = () => {throw new Error('Must not consume an exception');};
  listeners.get('error')({message: 'window error', error: {stack: 'stack'}, preventDefault: fail});
  listeners.get('unhandledrejection')({reason: new Error('rejected'), preventDefault: fail});
  assert.equal(records[0].event, 'new-document'); assert.equal(records[0].timeOrigin, 123);
  assert.equal(records[1].event, 'window-error'); assert.equal(records[2].event, 'unhandledrejection');
});

test('Live notification observation preserves the exact fetch promise and native call while recording abort origin', () => {
  const records = [], calls = [], listeners = new Map(), promise = Promise.resolve('native result');
  Object.defineProperty(promise, 'then', {value() {throw new Error('The observer must not chain or handle fetch promises');}});
  const window = {fetch(...args) {calls.push({receiver: this, args}); return promise;}}; window.top = window;
  vm.runInNewContext('(' + installLiveLifecycle.toString() + ')()', {
    window, URL, location: {origin: base, pathname: '/', href: base + '/'}, performance: {timeOrigin: 123, now: () => 4}, document: {readyState: 'loading'},
    console: {log: value => records.push(JSON.parse(value.slice(LIVE_LIFECYCLE_PREFIX.length)))},
    addEventListener: (event, callback) => listeners.set(event, callback),
  });
  const controller = new AbortController(), options = {signal: controller.signal, credentials: 'same-origin'}, receiver = {};
  assert.equal(window.fetch.call(receiver, '/api/notifications?token=never-log-query', options), promise);
  assert.equal(calls[0].receiver, receiver); assert.equal(calls[0].args[0], '/api/notifications?token=never-log-query'); assert.equal(calls[0].args[1], options);
  controller.abort();
  assert.deepEqual(records.slice(1).map(value => [value.event, value.request, value.aborted]), [['notification-fetch', 1, false], ['notification-abort', 1, true]]);
  assert.match(records[2].stack, /Notification AbortSignal fired/);
  assert.doesNotMatch(JSON.stringify(records), /never-log-query/);
  const length = records.length;
  assert.equal(window.fetch('/api/state'), promise); assert.equal(window.fetch('https://elsewhere.test/api/notifications'), promise);
  assert.equal(window.fetch(null), promise); assert.equal(records.length, length, 'Unrelated and malformed native inputs are not changed or logged.');
});

test('Live compact failure annotation retains matching request completion, true document identity and abort stack', () => {
  const {page, trace} = observed(), req = request(page);
  page.emit('request', req); finish(page, req);
  lifecycle(page, 'notification-fetch', 100, {request: 1, aborted: false});
  lifecycle(page, 'notification-abort', 100, {request: 1, aborted: true, stack: 'abort@' + base + '/react-app.js?v=never-log-version:123:45'});
  const detail = {name: 'Fetch API cannot load http', error: '/127.0.0.1:4174/api/notifications?token=never-log-token due to access control checks.',
    stack: 'Error\n at notificationRequest (' + base + '/react-app.js?v=never-log-version:123:45)', check: 'cross-account post persistence', ms: 4661, documentEpoch: 1};
  const annotation = liveFailureAnnotation(detail, trace), prefix = '::error title=GW live request failure::';
  assert.ok(annotation.startsWith(prefix)); assert.ok(annotation.length < 4096);
  const summary = JSON.parse(annotation.slice(prefix.length).replaceAll('%0A', '\n').replaceAll('%0D', '\r').replaceAll('%25', '%'));
  assert.equal(summary.epoch, 1); assert.equal(summary.timeOrigin, 100); assert.equal(summary.reads[0].status, 200);
  assert.equal(summary.reads[0].epoch, 1); assert.equal(summary.reads[0].timeOrigin, 100); assert.ok(Number.isFinite(summary.reads[0].end));
  assert.equal(summary.navigation[0].type, 'signin'); assert.ok(Number.isFinite(summary.navigation[0].commit));
  assert.equal(summary.lifecycle.at(-1).event, 'notification-abort'); assert.match(summary.lifecycle.at(-1).stack, /react-app\.js:123:45/);
  assert.match(summary.stack, /react-app\.js:123:45/); assert.doesNotMatch(summary.stack, /never-log-version/);
  assert.doesNotMatch(annotation, /never-log-token|never-log-version/);
});

test('Live compact failure annotation stays valid under percent encoding and large exception text', () => {
  const {page, trace} = observed();
  for (let index = 0; index < 8; index++) {
    const req = request(page); page.emit('request', req); finish(page, req);
    lifecycle(page, 'notification-abort', 100, {request: index + 1, stack: '%'.repeat(4000)});
  }
  const detail = {name: '%'.repeat(100), error: '/api/notifications' + '%'.repeat(2000), stack: '%'.repeat(4000), check: '%'.repeat(100), ms: 4661, documentEpoch: 1};
  const annotation = liveFailureAnnotation(detail, trace);
  assert.ok(annotation.length < 4096);
  assert.doesNotThrow(() => JSON.parse(annotation.split('::').at(-1).replaceAll('%25', '%')));
});

test('Live harness gates every deliberate reload and onboarding closure with actual request completion', () => {
  const reload = source.slice(source.indexOf('async function reloadRoute('), source.indexOf('async function closePerson('));
  const close = source.slice(source.indexOf('async function closePerson('), source.indexOf('try{'));
  assert.ok(reload.indexOf('await settleBrowserReads(page);') < reload.indexOf('await page.reload('));
  assert.ok(reload.indexOf('await authenticatedRouteReady(page, {since});') > reload.indexOf('await page.reload('));
  assert.ok(close.indexOf('await settleBrowserReads(page);') < close.indexOf('await session.context.close();'));
  assert.match(reload, /since = trace\.lastDrained/);
  assert.match(source, /drainedThrough = trace\.sequence/);
  assert.equal((source.match(/await reloadRoute\(alice\)/g) || []).length, 4);
  assert.doesNotMatch(source.slice(source.indexOf('try{')), /\.reload\(/);
  assert.match(source, /\.app:not\(\.is-onboarding\) > header/); assert.match(source, /locator\('\.onboard'\)\)\.toHaveCount\(0\)/);
  assert.match(source, /'\/api\/state'.*'\/api\/notifications'.*'\/api\/page-content\/global'/);
  assert.match(source, /await closePerson\(fresh\)/);
  assert.doesNotMatch(source + diagnosticSource, /waitForTimeout|networkidle|route\.abort|clearInterval|setTimeout/);
});

test('Live hosted assertions remain strict through browser cleanup with durable network artifacts', () => {
  assert.match(source, /GW_HOSTED_BROWSER_QA !== '1'/);
  assert.match(source, /assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions\.'\)/);
  assert.match(source, /if \(!scenarioFailed\) assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions, including browser cleanup\.'\)/);
  assert.match(source, /try \{await browser\.close\(\);\} finally/);
  assert.match(source, /network-\$\{engineName\}\.json/);
  assert.match(source, /assert\.equal\(await alice\.getByRole\('heading',\{name:'Leader Tools',exact:true\}\)\.count\(\),0\)/);
  assert.match(source, /assert\.equal\(await alice\.getByRole\('tab',\{name:'Featured photos',exact:true\}\)\.count\(\),0\)/);
  assert.doesNotMatch(source + diagnosticSource, /errors\.filter\(|ignoreHTTPSErrors|disable-web-security|preventDefault\(\)/);
  assert.doesNotMatch(diagnosticSource, /response\.(json|body|text)\(|request\.(postData|headers)\(/);
});
