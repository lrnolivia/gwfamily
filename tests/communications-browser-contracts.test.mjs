// Node-only event and source contracts. These do not launch a browser or claim
// that the hosted Chromium/WebKit communications suites have passed.
import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {COMMUNICATIONS_LIFECYCLE_PREFIX, diagnosticUrl, installCommunicationsLifecycle, observeCommunicationsPage} from './communications-browser-diagnostics.mjs';

const base = 'http://127.0.0.1:4175';
const source = readFileSync(new URL('./communications-browser.mjs', import.meta.url), 'utf8');
const diagnosticSource = readFileSync(new URL('./communications-browser-diagnostics.mjs', import.meta.url), 'utf8');
class Frame {
  constructor(path = '/#/chat/synthetic') {this.path = path; this.detached = false;}
  url() {return base + this.path;}
  isDetached() {return this.detached;}
}
class Page extends EventEmitter {
  frame = new Frame();
  url() {return this.frame.url();}
  mainFrame() {return this.frame;}
}
function observed() {
  const page = new Page(), context = new EventEmitter(), errors = [];
  let check = 'synthetic setup';
  const trace = observeCommunicationsPage({page, context, label: 'bob', base, errors, getCheck: () => check});
  const lifecycle = (event, timeOrigin = 100) => page.emit('console', {text: () => COMMUNICATIONS_LIFECYCLE_PREFIX + JSON.stringify({event, url: base + '/', timeOrigin, documentMs: 0, readyState: 'loading'})});
  lifecycle('new-document');
  return {page, context, trace, errors, lifecycle, check: value => {check = value;}};
}
function request(page, path, {method = 'GET', failure, resource = 'fetch', navigation = false, frame = page.mainFrame()} = {}) {
  return {url: () => base + path, method: () => method, resourceType: () => resource, isNavigationRequest: () => navigation, frame: () => frame,
    failure: () => failure ? {errorText: failure} : null,
    // Diagnostics must not ask to read any request contents or headers.
    postDataJSON() {throw new Error('Body access forbidden');}, headers() {throw new Error('Request header access forbidden');},
  };
}
function response(page, req, status = 200) {
  page.emit('response', {request: () => req, status: () => status, url: req.url,
    headers: () => ({'content-type': 'application/json', 'set-cookie': 'never-log-cookie', authorization: 'never-log-token', location: '/?secret=never-log-location', 'access-control-allow-origin': base}),
    body() {throw new Error('Body access forbidden');}, json() {throw new Error('Body access forbidden');},
  });
}

test('communications trace correlates request start, response, completed body and route/frame context', () => {
  const {page, trace, check} = observed(), req = request(page, '/api/conversations/synthetic/messages?after=123');
  check('synthetic message loading');
  page.emit('request', req);
  assert.equal(trace.readiness({required: ['/api/conversations/synthetic/messages']}).missing.length, 1);
  response(page, req);
  assert.equal(trace.readiness({required: ['/api/conversations/synthetic/messages']}).pending.length, 1, 'Response headers alone do not mean its body finished.');
  page.emit('requestfinished', req);
  assert.deepEqual(trace.readiness({required: ['/api/conversations/synthetic/messages']}), {missing: [], pending: []});
  assert.deepEqual(trace.requiredReadFailures({required: ['/api/conversations/synthetic/messages']}), []);
  const events = trace.events.filter(event => ['request', 'response', 'requestfinished'].includes(event.type));
  assert.deepEqual(events.map(event => event.id), [1, 1, 1]);
  assert.equal(events[0].frame, 1);
  assert.equal(events[0].mainFrame, true);
  assert.equal(events[0].check, 'synthetic message loading');
  assert.equal(events[2].status, 200);
  assert.equal(events[2].startedDocument, 1);
  assert.equal(events[2].documentEpoch, 1);
  assert.equal(events[2].documentTimeOrigin, 100);
  assert.ok(events[2].finishedMs >= events[2].startedMs);
});

test('required route reads reject 401, 403, 503 and transport cancellation without changing expected permission tests', () => {
  for (const status of [401, 403, 503]) {
    const {page, trace} = observed(), req = request(page, '/api/conversations/synthetic');
    page.emit('request', req); response(page, req, status); page.emit('requestfinished', req);
    assert.equal(trace.requiredReadFailures({required: ['/api/conversations/synthetic']})[0].status, status);
    assert.deepEqual(trace.readiness({required: ['/api/conversations/synthetic']}), {missing: ['/api/conversations/synthetic'], pending: []}, 'A completed HTTP failure cannot establish successful readiness.');
    assert.deepEqual(trace.requiredReadFailures(), [], 'No invented success contract for deliberate denied/failed scenarios.');
    assert.equal(trace.events.at(-1).status, status, 'Permission failures remain fully visible.');
  }
  const {page, trace} = observed(), req = request(page, '/api/conversations/synthetic', {failure: 'cancelled'});
  page.emit('request', req); page.emit('requestfailed', req);
  assert.deepEqual(trace.readiness({required: ['/api/conversations/synthetic']}), {missing: ['/api/conversations/synthetic'], pending: []});
  assert.equal(trace.requiredReadFailures({required: ['/api/conversations/synthetic']})[0].failure, 'cancelled');
});

test('completed old-document reads cannot satisfy a new hard-navigation readiness contract', () => {
  const {page, trace, lifecycle} = observed(), old = request(page, '/api/state');
  page.emit('request', old); response(page, old); page.emit('requestfinished', old);
  const since = trace.sequence;
  trace.log('route-reads-settled', {through: since, pending: []});
  trace.beginTransition('navigation', base + '/#/post/synthetic');
  lifecycle('beforeunload', 100);
  page.frame.path = '/#/post/synthetic'; page.emit('framenavigated', page.frame);
  assert.equal(trace.document, 1, 'A frame commit alone never invents JavaScript document identity.');
  lifecycle('new-document', 200);
  assert.equal(trace.document, 2);
  assert.equal(trace.documentTimeOrigin, 200);
  assert.deepEqual(trace.readiness({since: 0, required: ['/api/state']}).missing, ['/api/state'], 'Even without a sequence watermark, a completed old-document read cannot satisfy the new document.');
  assert.deepEqual(trace.readiness({since, required: ['/api/state']}).missing, ['/api/state']);
  const next = request(page, '/api/state');
  page.emit('request', next); response(page, next); page.emit('requestfinished', next);
  assert.deepEqual(trace.readiness({since, required: ['/api/state']}), {missing: [], pending: []});
  assert.equal(trace.events.at(-1).startedDocument, 2);
  assert.equal(trace.events.at(-1).documentTimeOrigin, 200);
});

test('frame detach, page closure and context closure retain in-flight request identity', () => {
  const {page, context, trace} = observed(), frame = new Frame('/embedded'), req = request(page, '/api/notifications', {frame});
  page.emit('frameattached', frame); page.emit('request', req); frame.detached = true;
  page.emit('framedetached', frame); page.emit('close'); context.emit('close');
  const start = trace.events.find(event => event.type === 'request'), detach = trace.events.find(event => event.type === 'framedetached');
  assert.equal(start.frame, detach.frame); assert.equal(detach.detached, true);
  assert.equal(trace.events.at(-1).type, 'context-close'); assert.equal(trace.events.at(-1).pendingCount, 1);
  assert.equal(trace.snapshot().pending[0].id, start.id);
});

test('every access-control pageerror is retained with bounded stack and immediate request evidence', () => {
  const {page, trace, errors, check} = observed(), req = request(page, '/api/conversations/synthetic/messages', {failure: 'cancelled'});
  check('synthetic navigation'); page.emit('request', req); response(page, req); page.emit('requestfailed', req);
  const message = 'Fetch API cannot load ' + req.url() + ' due to access control checks.';
  const error = new Error(message); error.stack = 'Synthetic stack\n'.repeat(700);
  // Avoid printing the intentionally repeated stack in Node test output.
  const original = console.error; console.error = () => {};
  try {page.emit('pageerror', error); page.emit('pageerror', new Error('Second exception'));} finally {console.error = original;}
  assert.equal(errors.length, 2); assert.equal(errors[0].error, message); assert.equal(errors[0].check, 'synthetic navigation');
  assert.equal(errors[0].stack.length, 4000); assert.equal(errors[0].documentUrl, page.url());
  assert.equal(errors[0].recentEvents.at(-1).failure, 'cancelled'); assert.equal(errors[0].recentEvents.at(-1).status, 200);
  assert.equal(trace.events.at(-1).type, 'pageerror');
});

test('diagnostics exclude cookies, authorization, request/response bodies and URL query secrets', () => {
  const {page, trace} = observed(), req = request(page, '/api/notifications?token=never-log-query');
  page.emit('request', req); response(page, req); page.emit('requestfinished', req);
  const detail = {event: 'new-document', timeOrigin: 123, documentMs: 0, readyState: 'loading', body: 'never-log-body', token: 'never-log-console-token'};
  page.emit('console', {text: () => COMMUNICATIONS_LIFECYCLE_PREFIX + JSON.stringify(detail)});
  page.emit('console', {text: () => 'unrelated private console content'});
  const serialized = JSON.stringify(trace.events);
  assert.doesNotMatch(serialized, /never-log|private console content|[?]token/);
  assert.equal(diagnosticUrl('https://username:password@example.com/path?secret=x#/chat/id?secret=y'), 'https://example.com/path#/chat/id');
  assert.equal(diagnosticUrl('data:text/plain,private'), 'data:');
  assert.equal(trace.events.find(event => event.type === 'response').headers['access-control-allow-origin'], base);
});

test('request histories and event rings are bounded without losing pending requests', () => {
  const {page, trace} = observed(), pending = request(page, '/api/state'); page.emit('request', pending);
  for (let index = 0; index < 350; index++) {
    const req = request(page, '/api/notifications'); page.emit('request', req); response(page, req); page.emit('requestfinished', req);
  }
  assert.equal(trace.events.length, 700); assert.equal(trace.reads.length, 300); assert.ok(trace.droppedEvents > 0);
  assert.equal(trace.snapshot().pending[0].path, '/api/state'); assert.equal(trace.snapshot().recentEvents.length, 30);
});

test('document lifecycle observes errors and rejected promises without consuming browser events', () => {
  const listeners = new Map(), records = [], window = {}; window.top = window;
  vm.runInNewContext('(' + installCommunicationsLifecycle.toString() + ')()', {
    window, location: {origin: base, pathname: '/'},
    performance: {timeOrigin: 123, now: () => 4}, document: {readyState: 'loading'},
    console: {log: value => records.push(JSON.parse(value.slice(COMMUNICATIONS_LIFECYCLE_PREFIX.length)))},
    addEventListener: (event, callback) => listeners.set(event, callback),
  });
  for (const event of ['beforeunload', 'pagehide', 'pageshow', 'error', 'unhandledrejection']) assert.ok(listeners.has(event));
  const fail = () => {throw new Error('Must not consume an exception');};
  listeners.get('error')({message: 'window error', error: {stack: 'stack'}, preventDefault: fail});
  listeners.get('unhandledrejection')({reason: new Error('rejected'), preventDefault: fail});
  listeners.get('pagehide')({persisted: true});
  assert.equal(records[0].event, 'new-document'); assert.equal(records[1].event, 'window-error');
  assert.equal(records[2].event, 'unhandledrejection'); assert.equal(records[3].persisted, true);
});

test('harness drains actual requests and verifies authenticated routes on both sides of hard navigation', () => {
  const navigation = source.slice(source.indexOf('async function navigate('), source.indexOf('async function inbox('));
  assert.ok(navigation.indexOf('await settleBrowserReads(page);') < navigation.indexOf('await page.goto('));
  assert.ok(navigation.indexOf('await authenticatedRouteReady(page, {since, type, id});') > navigation.indexOf('await page.goto('));
  assert.match(navigation, /expect\(page\)\.toHaveURL\(target\)/);
  assert.match(navigation, /Promise\.all\(\[page\.waitForEvent\('domcontentloaded'\), control\.click\(\)\]\)/);
  assert.match(source, /\.app:not\(\.is-onboarding\) > header/); assert.match(source, /locator\('\.onboard'\)\)\.toHaveCount\(0\)/);
  assert.match(source, /required\.push\(`\/api\/conversations\/\$\{encodeURIComponent\(id\)\}`, `\/api\/conversations\/\$\{encodeURIComponent\(id\)\}\/messages`\)/);
  const consent=source.slice(source.indexOf("await check('DM invitation consent"),source.indexOf("await check('ordinary outsiders"));
  assert.match(consent,/await expect\(bob\)\.toHaveURL/);
  assert.match(consent,/await expect\.poll\(async \(\) => \(await summary\(bob, directId\)\)\?\.unreadCount\)\.toBe\(0\);\s+await settleBrowserReads\(bob\);/);
  assert.doesNotMatch(consent,/await navigate\(bob, 'chat', directId\)/);
  assert.doesNotMatch(navigation, /waitForTimeout|networkidle|route\.abort|clearInterval|setTimeout/);
});

test('hosted diagnostics preserve zero pageerrors, real retry/permission scenarios and closure artifacts', () => {
  assert.match(source, /assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions\.'\)/);
  assert.match(source, /await assertAccessDenied\(bob, groupId\)/);
  assert.match(source, /route\.abort\('connectionfailed'\)/);
  assert.match(source, /network-\$\{engineName\}\.json/);
  assert.match(source, /try \{await browser\.close\(\);\} finally \{await persist\(\);\}/);
  assert.doesNotMatch(source + diagnosticSource, /errors\.filter\(|ignoreHTTPSErrors|disable-web-security|preventDefault\(\)/);
  assert.doesNotMatch(diagnosticSource, /response\.(json|body|text)\(|request\.(postData|headers)\(/);
});
