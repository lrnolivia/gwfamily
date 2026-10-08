// Node-only contracts; these do not launch a browser or establish a hosted pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {reportReloadInspectorErrors} from './reload-inspector-diagnostics.mjs';
import {LIVE_LIFECYCLE_PREFIX, installLiveLifecycle, observeLivePage, liveFailureAnnotation, liveReadFailureAnnotation} from './live-browser-diagnostics.mjs';

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
  const realLog = console.log, annotations = []; console.log = value => annotations.push(value);
  try {
    await assert.rejects(context.settleBrowserReads(page, {since: 0, required: ['/api/notifications']}), /Required authenticated Live API reads succeed/);
  } finally {console.log = realLog;}
  assert.equal(annotations.length, 1); assert.match(annotations[0], /^::error title=GW live required read failure::/);
  assert.equal(trace.lastDrained, 0);
});

test('Live normal authenticated reads reject 401, 403, 503 and unproven transport failures during navigation', () => {
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
  assert.deepEqual(records.slice(1).map(value => [value.event, value.request, value.aborted]), [['notification-fetch-attempt', 1, false], ['notification-fetch', 1, false], ['notification-abort', 1, true]]);
  assert.match(records[1].stack, /Notification fetch attempted/);
  assert.match(records[3].stack, /Notification AbortSignal fired/);
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
  assert.equal((source.match(/await reloadRoute\(alice\)/g) || []).length, 5);
  assert.doesNotMatch(source.slice(source.indexOf('try{')), /\.reload\(/);
  assert.match(source, /\.app:not\(\.is-onboarding\) > header/); assert.match(source, /locator\('\.onboard'\)\)\.toHaveCount\(0\)/);
  assert.match(source, /'\/api\/state'.*'\/api\/notifications'.*'\/api\/page-content\/global'/);
  assert.match(source, /await closePerson\(fresh\)/);
  assert.doesNotMatch(source + diagnosticSource, /waitForTimeout|networkidle|route\.abort|clearInterval|setTimeout/);
});

test('Live hosted assertions remain strict through browser cleanup with durable network artifacts', () => {
  assert.match(source, /GW_HOSTED_BROWSER_QA !== '1'/);
  assert.match(source, /assertBrowserErrors\('No unhandled browser exceptions\.'\)/);
  assert.match(source, /if \(!scenarioFailed\) assertBrowserErrors\('No unhandled browser exceptions, including browser cleanup\.'\)/);
  assert.match(source, /assert\.deepEqual\(report\.domErrors, \[\]/);
  assert.match(source, /assert\.deepEqual\(report\.fatalErrors, \[\]/);
  assert.match(source, /pageErrors: errors, \.\.\.errorReport\(\)/);
  assert.match(source, /classifiedInspectorCount: report\.classifiedInspectorCount/);
  assert.match(source, /try \{await browser\.close\(\);\} finally/);
  assert.match(source, /network-\$\{engineName\}\.json/);
  assert.match(source, /assert\.equal\(await alice\.getByRole\('heading',\{name:'Leader Tools',exact:true\}\)\.count\(\),0\)/);
  assert.match(source, /assert\.equal\(await alice\.getByRole\('tab',\{name:'Featured photos',exact:true\}\)\.count\(\),0\)/);
  assert.doesNotMatch(source + diagnosticSource, /errors\.filter\(|ignoreHTTPSErrors|disable-web-security|preventDefault\(\)/);
  assert.doesNotMatch(diagnosticSource, /response\.(json|body|text)\(|request\.(postData|headers)\(/);
});

test('Live records a notification attempt before a synchronous native teardown throw without consuming it', () => {
  const records = [], nativeError = new TypeError('native teardown failure');
  const window = {fetch() {throw nativeError;}}; window.top = window;
  vm.runInNewContext('(' + installLiveLifecycle.toString() + ')()', {
    window, URL, location: {origin: base, pathname: '/', href: base + '/'}, performance: {timeOrigin: 123, now: () => 4}, document: {readyState: 'complete'},
    console: {log: value => records.push(JSON.parse(value.slice(LIVE_LIFECYCLE_PREFIX.length)))}, addEventListener() {},
  });
  assert.throws(() => window.fetch('/api/notifications'), error => error === nativeError);
  assert.deepEqual(records.map(value => value.event), ['new-document', 'notification-fetch-attempt']);
  assert.equal(records[1].timeOrigin, 123); assert.equal(records[1].aborted, false);
});

test('Live preserves original pageerrors and DOM exceptions independently of bounded timeline retention', () => {
  const {page, trace, errors} = observed();
  lifecycle(page, 'unhandledrejection', 100, {message: 'late rejection'});
  const originalError = console.error, originalLog = console.log; console.error = () => {}; console.log = () => {};
  try {page.emit('pageerror', new Error('application exception'));} finally {console.error = originalError; console.log = originalLog;}
  for (let index = 0; index < 750; index++) trace.log('synthetic-background-event');
  assert.equal(trace.pageErrors.length, 1); assert.equal(trace.pageErrors[0], errors[0]);
  assert.equal(trace.pageErrors[0].documentTimeOrigin, 100); assert.ok(Number.isSafeInteger(trace.pageErrors[0].eventSequence));
  assert.equal(trace.domErrors.length, 1); assert.equal(trace.domErrors[0].event, 'unhandledrejection');
  assert.equal(trace.events.length, 700);
});


test('Live observer supplies complete classification evidence only after a ready replacement document', () => {
  const {page, trace, errors} = observed(), req = request(page);
  page.emit('request', req); finish(page, req); trace.lastDrained = trace.sequence;
  trace.log('route-reads-settled', {through: trace.lastDrained, pending: []}); trace.beginTransition('reload');
  lifecycle(page, 'beforeunload'); lifecycle(page, 'notification-fetch-attempt', 100, {request: 2, aborted: false});
  const error = new Error('/127.0.0.1:4174/api/notifications due to access control checks.');
  error.name = 'Fetch API cannot load http';
  error.stack = `Fetch API cannot load ${base}/api/notifications due to access control checks.\n` +
    `    at unknown (web-inspector://bootstrap.js:37:32)\n    at api (${base}/react-app.js:24802:33)\n` +
    `    at notificationRequest (${base}/react-app.js:24818:23)\n    at list (${base}/react-app.js:24825:71)`;
  const originalError = console.error, originalLog = console.log; console.error = () => {}; console.log = () => {};
  try {page.emit('pageerror', error);} finally {console.error = originalError; console.log = originalLog;}
  const report = () => reportReloadInspectorErrors({engine: 'webkit', base, traces: [trace]});
  assert.equal(report().fatalErrors.length, 1);
  page.emit('framenavigated', page.frame); lifecycle(page, 'new-document', 200);
  const next = request(page); page.emit('request', next); finish(page, next);
  assert.equal(report().fatalErrors.length, 1, 'Request success alone does not prove route readiness.');
  trace.log('reload-ready', {pending: []});
  assert.equal(report().classifiedInspectorCount, 1); assert.equal(report().fatalErrors.length, 0);
  assert.equal(errors.length, 1); assert.equal(report().classifiedInspectorErrors[0].error, errors[0]);
  lifecycle(page, 'window-error', 200, {message: 'late DOM failure'});
  assert.equal(report().classifiedInspectorCount, 0); assert.equal(report().fatalErrors.length, 1); assert.equal(report().domErrors.length, 1);
});


test('Live transition timestamps retain one observation across clock-tick boundaries', () => {
  const realNow = Date.now; let now = 10000;
  Date.now = () => ++now;
  try {
    const {page, trace} = observed();
    trace.beginTransition('reload'); page.emit('framenavigated', page.frame); lifecycle(page, 'new-document', 200);
    const transition = trace.transitions.at(-1);
    for (const [event, ms] of [['startedEvent', 'startedMs'], ['committedEvent', 'committedMs'], ['documentStartedEvent', 'documentStartedMs']]) {
      assert.equal(trace.events.find(value => value.eventSequence === transition[event]).ms, transition[ms]);
    }
  } finally {Date.now = realNow;}
});

function observedOutgoingCancellation({order = 'commit-first', arrival = 'after-reload'} = {}) {
  const value = observed(), {page, trace} = value;
  const original = request(page); page.emit('request', original); finish(page, original);
  const since = trace.sequence, cancelled = request(page, '/api/notifications?limit=30', {failure: 'net::ERR_ABORTED'});
  if (arrival === 'drain-race') page.emit('request', cancelled);
  trace.log('route-reads-settled', {since: 0, through: since, pending: trace.snapshot().pending});
  if (arrival === 'after-drain') page.emit('request', cancelled);
  trace.beginTransition('reload');
  if (arrival === 'after-reload') page.emit('request', cancelled);
  lifecycle(page, 'notification-fetch', 100, {request: 2, aborted: false});
  lifecycle(page, 'beforeunload');
  lifecycle(page, 'notification-abort', 100, {request: 2, aborted: true, stack: 'at cancelReads (' + base + '/react-app.js:120:2)'});
  page.emit('requestfailed', cancelled);
  if (order === 'commit-first') page.emit('framenavigated', page.frame);
  lifecycle(page, 'new-document', 200);
  if (order === 'init-first') page.emit('framenavigated', page.frame);
  const next = request(page); page.emit('request', next);
  return {...value, since, cancelled, next};
}
function settlementContext(page, trace, poll) {
  const helper = source.slice(source.indexOf('async function settleBrowserReads('), source.indexOf('async function authenticatedRouteReady('));
  const context = vm.createContext({browserReads: new WeakMap([[page, trace]]), assert: vmAssert, expect: {poll}});
  vm.runInContext(helper, context);
  return options => context.settleBrowserReads(page, options);
}
test('Live full observer preserves and reports only positively correlated outgoing cancellations after a successful drain', async () => {
  for (const order of ['commit-first', 'init-first']) for (const arrival of ['after-reload', 'drain-race', 'after-drain']) {
    const {page, trace, since, next} = observedOutgoingCancellation({order, arrival});
    const options = {since, required: ['/api/notifications']}, read = trace.reads.find(value => value.failure);
    assert.equal(trace.requiredReadFailures(options).length, 1, 'Replacement response body is still missing.');
    assert.deepEqual(trace.requiredReadFailures({...options, allowPendingReplacement: true}), []);
    finish(page, next);
    assert.deepEqual(trace.requiredReadFailures(options), []);
    assert.equal(trace.classifiedReadCancellations.length, 0, 'Filtering a probe is not an acknowledged classification.');
    const settle = settlementContext(page, trace, probe => ({async toEqual(wanted) {
      assert.equal(JSON.stringify(probe()), JSON.stringify(wanted));
    }}));
    await settle(options);
    assert.equal(trace.classifiedReadCancellations.length, 1);
    assert.equal(trace.classifiedReadCancellations[0].read.failure, 'net::ERR_ABORTED');
    assert.equal(trace.classifiedReadCancellations[0].evidence.sourceEpoch, 1);
    assert.equal(trace.classifiedReadCancellations[0].evidence.targetEpoch, 2);
    assert.equal(trace.reads.find(value => value.id === read.id), read);
    assert.equal(trace.events.find(value => value.type === 'requestfailed').failure, 'net::ERR_ABORTED');
    assert.equal(trace.events.filter(value => value.type === 'superseded-document-read-cancelled').length, 1);
  }
});
test('Live waits within the existing poll for a proven outgoing cancellation replacement without annotating transient probes', async () => {
  const {page, trace, since, next} = observedOutgoingCancellation(), annotations = [];
  const realLog = console.log; console.log = value => annotations.push(value);
  try {
    const settle = settlementContext(page, trace, probe => ({async toEqual(wanted) {
      const first = probe();
      assert.deepEqual([...first.missing], ['/api/notifications']); assert.equal(first.pending.length, 1);
      assert.equal(trace.classifiedReadCancellations.length, 0);
      finish(page, next);
      assert.equal(JSON.stringify(probe()), JSON.stringify(wanted));
    }}));
    await settle({since, required: ['/api/notifications']});
  } finally {console.log = realLog;}
  assert.deepEqual(annotations, []); assert.equal(trace.classifiedReadCancellations.length, 1);
});
test('Live times out missing replacement proof and emits one compact final failure with raw cancellation and negative checks', async () => {
  const {page, trace, since} = observedOutgoingCancellation(), annotations = [];
  const realLog = console.log; console.log = value => annotations.push(value);
  try {
    const settle = settlementContext(page, trace, probe => ({async toEqual() {
      assert.equal(probe().missing.length, 1); assert.equal(probe().missing.length, 1);
      assert.equal(annotations.length, 0);
      throw new Error('Synthetic existing poll deadline');
    }}));
    await assert.rejects(settle({since, required: ['/api/notifications']}), /existing poll deadline/);
  } finally {console.log = realLog;}
  assert.equal(annotations.length, 1); assert.equal(trace.classifiedReadCancellations.length, 0);
  const summary = JSON.parse(annotations[0].split('::').slice(2).join('::').replaceAll('%0A', '\n').replaceAll('%0D', '\r').replaceAll('%25', '%'));
  assert.equal(summary.read.method, 'GET'); assert.equal(summary.read.failure, 'net::ERR_ABORTED');
  assert.equal(summary.read.sourceUrl, base + '/#/home');
  assert.equal(summary.read.epoch, 1); assert.equal(summary.current.epoch, 2);
  assert.equal(summary.reload.sourceTimeOrigin, 100); assert.equal(summary.reload.targetTimeOrigin, 200);
  assert.equal(summary.checks.failureAfterReload, true); assert.equal(summary.checks.replacementRead, false);
  assert.ok(summary.lifecycle.some(value => value.event === 'notification-abort' && value.stack.includes('cancelReads')));
});
test('Live current-document cancellation is immediately fatal despite a later successful retry', async () => {
  const {page, trace, since, next} = observedOutgoingCancellation(); finish(page, next);
  const failed = request(page, '/api/notifications', {failure: 'net::ERR_ABORTED'}); page.emit('request', failed); page.emit('requestfailed', failed);
  const retry = request(page); page.emit('request', retry); finish(page, retry);
  const realLog = console.log, annotations = []; console.log = value => annotations.push(value);
  try {
    const settle = settlementContext(page, trace, probe => ({async toEqual() {probe(); throw new Error('Must not reach readiness');}}));
    await assert.rejects(settle({since, required: ['/api/notifications']}), /Required authenticated Live API reads succeed/);
  } finally {console.log = realLog;}
  assert.equal(annotations.length, 1); assert.equal(trace.classifiedReadCancellations.length, 0);
});
test('Live request and completion timestamps retain the same observation across clock ticks', () => {
  const realNow = Date.now; let now = 10000; Date.now = () => ++now;
  try {
    const {page, trace} = observedOutgoingCancellation();
    for (const read of trace.reads) {
      assert.equal(trace.events.find(value => value.eventSequence === read.startedEvent).ms, read.startedMs);
      if (read.finishedEvent) assert.equal(trace.events.find(value => value.eventSequence === read.finishedEvent).ms, read.finishedMs);
    }
    const latest = trace.reads.at(-1), req = request(page); page.emit('request', req); finish(page, req);
    // The unmatched pending request stays visible; only finished bodies count.
    assert.equal(trace.pending.has(latest.id), true);
  } finally {Date.now = realNow;}
});
test('Live required-read annotations remain query-free and bounded with encoded abort stacks', () => {
  const {trace, since} = observedOutgoingCancellation(), read = trace.reads.find(value => value.failure);
  for (const event of trace.events.filter(value => value.event === 'notification-abort')) event.stack = '%'.repeat(4000);
  read.frameUrl += '?secret=never-log-query';
  const annotation = liveReadFailureAnnotation(read, trace, {since, required: ['/api/notifications']});
  assert.ok(annotation.length < 4096); assert.doesNotMatch(annotation, /never-log-query/);
  assert.doesNotThrow(() => JSON.parse(annotation.split('::').slice(2).join('::').replaceAll('%25', '%')));
});
test('Live artifacts preserve classified read originals independently of the inspector error classifier', () => {
  assert.match(source, /classifiedReadCancellations: sessions\.flatMap/);
  assert.match(source, /classifiedReadCancellations: trace\.classifiedReadCancellations/);
  assert.match(source, /documentTimeOrigin: trace\.documentTimeOrigin, reads: trace\.reads/);
  assert.match(source, /catch \(error\) \{\s+trace\.reportRequiredReadFailures\(options\);\s+throw error;/);
  assert.match(source, /assertRequiredReads\(true\)/);
});

test('Live required-read annotations bound percent-heavy route targets without losing negative proof', () => {
  const {trace, since} = observedOutgoingCancellation(), read = trace.reads.find(value => value.failure);
  read.frameUrl = base + '/#/' + '%'.repeat(980);
  trace.transitions.at(-1).target = read.frameUrl;
  const annotation = liveReadFailureAnnotation(read, trace, {since, required: ['/api/notifications']});
  assert.ok(annotation.length < 4096);
  const summary = JSON.parse(annotation.split('::').slice(2).join('::').replaceAll('%25', '%'));
  assert.equal(summary.read.id, read.id); assert.equal(summary.read.epoch, 1); assert.equal(summary.current.epoch, 2);
  assert.equal(summary.checks.matchingTarget, false); assert.equal(summary.checks.replacementRead, false);
});

