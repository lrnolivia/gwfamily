// Named synthetic provenance/source checks. No server or browser is imported.
import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {classifyCommunicationsReadCancellation, inspectCommunicationsReadCancellation} from './communications-read-diagnostics.mjs';
import {observeCommunicationsPage, COMMUNICATIONS_LIFECYCLE_PREFIX} from './communications-browser-diagnostics.mjs';

const base = 'http://127.0.0.1:4175', sourceUrl = base + '/#/chat/synthetic-old', target = base + '/#/chat/synthetic-new';
function evidence(type = 'navigation') {
  const read = {id: 20, path: '/api/conversations', url: base + '/api/conversations', method: 'GET', resource: 'fetch',
    navigation: false, frame: 1, mainFrame: true, frameUrl: sourceUrl, detached: false, documentEpoch: 1, documentTimeOrigin: 100,
    startedEvent: 8, finishedEvent: 20, startedMs: 8, finishedMs: 20, failure: 'net::ERR_ABORTED'};
  const destination = type === 'reload' ? sourceUrl : target;
  const replacement = {...read, id: 30, frameUrl: destination, documentEpoch: 2, documentTimeOrigin: 200,
    startedEvent: 30, finishedEvent: 35, startedMs: 30, finishedMs: 35, status: 200};
  delete replacement.failure;
  const transition = {type, sourceUrl, target: destination, sourceEpoch: 1, sourceTimeOrigin: 100, targetEpoch: 2, targetTimeOrigin: 200,
    drainedEvent: 5, startedEvent: 10, committedEvent: 25, documentStartedEvent: 26, startedMs: 10, committedMs: 25, documentStartedMs: 26};
  const events = [
    {type: 'route-reads-settled', eventSequence: 5, ms: 5, documentEpoch: 1, documentTimeOrigin: 100, through: 19, pending: []},
    {...read, type: 'request', eventSequence: 8, ms: 8},
    {...transition, type: type + '-start', eventSequence: 10, ms: 10, documentEpoch: 1, documentTimeOrigin: 100, pending: []},
    {type: 'document-lifecycle', event: 'beforeunload', eventSequence: 15, ms: 15, documentEpoch: 1, timeOrigin: 100, url: base + '/'},
    {...read, type: 'requestfailed', eventSequence: 20, ms: 20},
    {type: 'frame-navigated', eventSequence: 25, ms: 25, mainFrame: true, frame: 1, frameUrl: destination},
    {type: 'document-lifecycle', event: 'new-document', eventSequence: 26, ms: 26, documentEpoch: 2, timeOrigin: 200, url: base + '/'},
    {...replacement, type: 'request', eventSequence: 30, ms: 30},
    {...replacement, type: 'requestfinished', eventSequence: 35, ms: 35},
  ];
  return {read, trace: {events, transitions: [transition], reads: [read, replacement], documentEpoch: 2, documentTimeOrigin: 200, documentUrl: base + '/'}};
}

test('only positively proven outgoing navigation/reload GET with completed new-document replacement is classified', () => {
  for (const type of ['navigation', 'reload']) {
    const {read, trace} = evidence(type);
    assert.ok(Object.values(inspectCommunicationsReadCancellation(read, trace).checks).every(Boolean));
    const classified = classifyCommunicationsReadCancellation(read, trace);
    assert.equal(classified.transition, type);
    assert.equal(classified.replacementRead, 30);
    assert.equal(classified.sourceTimeOrigin, 100);
    assert.equal(classified.targetTimeOrigin, 200);
  }
});

test('every required evidence predicate remains fail-closed', () => {
  const mutations = [
    ({read}) => {read.failure = 'net::ERR_CONNECTION_REFUSED';},
    ({read}) => {read.status = 401;},
    ({read}) => {read.method = 'POST';},
    ({read}) => {read.mainFrame = false;},
    ({read}) => {read.detached = true;},
    ({read}) => {read.navigation = true;},
    ({read}) => {read.documentEpoch = null;},
    ({read}) => {read.documentTimeOrigin = null;},
    ({read}) => {read.startedEvent = 27;},
    ({read}) => {read.finishedEvent = 9;},
    ({trace}) => {trace.transitions = [];},
    ({trace}) => {trace.transitions[0].type = 'hash-change';},
    ({trace}) => {trace.transitions[0].sourceUrl = target;},
    ({trace}) => {trace.transitions[0].targetEpoch = 1;},
    ({trace}) => {trace.documentEpoch = 3;},
    ({trace}) => {trace.documentTimeOrigin = 300;},
    ({trace}) => {trace.events[0].through = 20;},
    ({trace}) => {trace.events[3].timeOrigin = 200;},
    ({trace}) => {trace.events[3].ms = 21;},
    ({trace}) => {trace.events.push({type: 'unreadable-lifecycle-record'});},
    ({trace}) => {trace.reads[1].finishedMs = undefined;},
    ({trace}) => {trace.reads[1].status = 403;},
    ({trace}) => {trace.reads[1].failure = 'net::ERR_ABORTED';},
    ({trace}) => {trace.reads[1].documentEpoch = 1;},
    ({trace}) => {trace.reads[1].path = '/api/notifications';},
    ({trace}) => {trace.reads[1].frameUrl = sourceUrl;},
    ({trace}) => {trace.reads[1].frame = 2;},
  ];
  for (const mutate of mutations) {
    const fixture = evidence(); mutate(fixture);
    assert.equal(classifyCommunicationsReadCancellation(fixture.read, fixture.trace), null, mutate.toString());
  }
  for (let index = 0; index < 9; index++) {
    const fixture = evidence(); fixture.trace.events.splice(index, 1);
    assert.equal(classifyCommunicationsReadCancellation(fixture.read, fixture.trace), null, 'Missing record ' + index);
  }
});

function observer() {
  const page = new EventEmitter(), context = new EventEmitter();
  let url = sourceUrl;
  const frame = {url: () => url, isDetached: () => false};
  page.url = () => url; page.mainFrame = () => frame;
  const trace = observeCommunicationsPage({page, context, label: 'synthetic', base, errors: [], getCheck: () => 'synthetic', started: Date.now()});
  const lifecycle = (event, timeOrigin) => page.emit('console', {text: () => COMMUNICATIONS_LIFECYCLE_PREFIX + JSON.stringify({event, timeOrigin, url: base + '/', readyState: 'complete'})});
  const request = () => ({url: () => base + '/api/conversations', method: () => 'GET', resourceType: () => 'fetch',
    isNavigationRequest: () => false, frame: () => frame, failure: () => ({errorText: 'net::ERR_ABORTED'})});
  const finish = req => {page.emit('response', {request: () => req, status: () => 200, url: req.url, headers: () => ({})}); page.emit('requestfinished', req);};
  lifecycle('new-document', 100);
  return {page, trace, lifecycle, request, finish, frame, setUrl: value => {url = value;}};
}

test('hash navigation never invents a new document and a failed current read cannot prove route readiness', () => {
  const fixture = observer(), {page, trace, request, finish, frame, setUrl} = fixture;
  const bad = request(); page.emit('request', bad); page.emit('requestfailed', bad);
  setUrl(target); page.emit('framenavigated', frame);
  assert.equal(trace.documentEpoch, 1);
  assert.deepEqual(trace.readiness({since: 0, required: ['/api/conversations']}), {missing: ['/api/conversations'], pending: []});
  const good = request(); page.emit('request', good); finish(good);
  assert.deepEqual(trace.readiness({since: 0, required: ['/api/conversations']}), {missing: [], pending: []});
  assert.equal(trace.requiredReadFailures({since: 0, required: ['/api/conversations']}).length, 1, 'An unrelated later success never suppresses a current-document failure.');
});

test('observer classifies only after exact outgoing lifecycle and successful replacement; raw evidence is retained', () => {
  const {page, trace, lifecycle, request, finish, frame, setUrl} = observer();
  const initial = request(); page.emit('request', initial); finish(initial);
  trace.lastDrained = trace.sequence;
  trace.log('route-reads-settled', {through: trace.lastDrained, pending: []});
  const since = trace.lastDrained;
  // Polling can start after the successful drain and before deliberate goto.
  const outgoing = request(); page.emit('request', outgoing);
  trace.beginTransition('navigation', target); lifecycle('beforeunload', 100); page.emit('requestfailed', outgoing);
  setUrl(target); page.emit('framenavigated', frame); lifecycle('new-document', 200);
  const options = {since, required: ['/api/conversations']};
  assert.equal(trace.requiredReadFailures(options).length, 1);
  assert.deepEqual(trace.readiness(options).missing, ['/api/conversations']);
  const replacement = request(); page.emit('request', replacement);
  assert.equal(trace.requiredReadFailures(options).length, 1, 'A pending replacement cannot pass.');
  finish(replacement);
  assert.deepEqual(trace.readiness(options), {missing: [], pending: []});
  assert.deepEqual(trace.requiredReadFailures(options), []);
  trace.recordReadCancellations(options, trace.sequence);
  assert.equal(trace.classifiedReadCancellations.length, 1);
  assert.equal(trace.reads.find(read => read.id === since + 1).failure, 'net::ERR_ABORTED');
  assert.equal(trace.events.filter(event => event.type === 'requestfailed').length, 1);
});

test('commit/init gap request identity stays unknown and fail-closed', () => {
  const {page, trace, request, frame, setUrl} = observer();
  trace.beginTransition('navigation', target); setUrl(target); page.emit('framenavigated', frame);
  const unknown = request(); page.emit('request', unknown); page.emit('requestfailed', unknown);
  assert.equal(trace.reads[0].documentEpoch, null);
  assert.equal(trace.requiredReadFailures({since: 0, required: ['/api/conversations']}).length, 1);
});

test('browser source retains authoritative auth/read/security assertions and exact transition watermark', () => {
  const source = readFileSync(new URL('./communications-browser.mjs', import.meta.url), 'utf8');
  for (const path of ['/api/state', '/api/conversations', '/api/conversations/recipients', '/api/notifications', '/api/page-content/global']) assert.ok(source.includes("'" + path + "'"));
  assert.match(source, /assert\.deepEqual\(trace\.requiredReadFailures\(options\), \[\], 'Required authenticated route reads succeed\.'\)/);
  assert.match(source, /const since = trace\.lastDrained, target =/);
  assert.match(source, /trace\.beginTransition\('navigation', target\)/);
  assert.match(source, /trace\.beginTransition\('reload', target\)/);
  assert.match(source, /trace\.lastDrained = drainedThrough/);
  assert.match(source, /assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions\.'\)/);
  assert.match(source, /assertAccessDenied\(bob, groupId\)/);
  assert.match(source, /removed participants lose API access and already-open UI history/);
  assert.match(source, /throw error/);
  assert.doesNotMatch(source, /ignoreHTTPSErrors|waitForTimeout|networkidle.*\(\)|process\.exit\(0\)/);
});
