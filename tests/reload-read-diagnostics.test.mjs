// Synthetic provenance contracts only. No browser or network access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReloadReadCancellation, inspectReloadReadCancellation, isPendingReloadReadCancellation} from './reload-read-diagnostics.mjs';

function fixture() {
  const target = 'http://127.0.0.1:4174/#/you', sourceTimeOrigin = 1791288004573.1, targetTimeOrigin = sourceTimeOrigin + 20;
  const read = {id: 37, method: 'GET', path: '/api/notifications', url: 'http://127.0.0.1:4174/api/notifications',
    resource: 'fetch', navigation: false, mainFrame: true, frame: 1, frameUrl: target, detached: false,
    documentEpoch: 3, documentTimeOrigin: sourceTimeOrigin, startedEvent: 155, finishedEvent: 158,
    startedMs: 4491, finishedMs: 4505, failure: 'net::ERR_ABORTED'};
  const reload = {type: 'reload', target, sourceEpoch: 3, sourceTimeOrigin, targetEpoch: 4, targetTimeOrigin,
    drainedEvent: 150, startedEvent: 151, startedMs: 4490, committedEvent: 159, committedMs: 4506, documentStartedEvent: 160, documentStartedMs: 4507};
  const next = {...read, id: 38, documentEpoch: 4, documentTimeOrigin: targetTimeOrigin, startedEvent: 161, finishedEvent: 163,
    startedMs: 4508, finishedMs: 4510, status: 200}; delete next.failure;
  const events = [
    {type: 'route-reads-settled', eventSequence: 150, ms: 4490, documentEpoch: 3, documentTimeOrigin: sourceTimeOrigin, through: 36, pending: []},
    {type: 'reload-start', eventSequence: 151, ms: 4490, documentEpoch: 3, documentTimeOrigin: sourceTimeOrigin, ...reload, type: 'reload-start', pending: []},
    {...read, failure: undefined, type: 'request', eventSequence: 155, ms: 4491},
    {type: 'document-lifecycle', event: 'beforeunload', eventSequence: 157, ms: 4503, documentEpoch: 3, timeOrigin: sourceTimeOrigin, url: 'http://127.0.0.1:4174/'},
    {...read, type: 'requestfailed', eventSequence: 158, ms: 4505},
    {type: 'frame-navigated', eventSequence: 159, ms: 4506, mainFrame: true, frame: 1, frameUrl: target},
    {type: 'document-lifecycle', event: 'new-document', eventSequence: 160, ms: 4507, documentEpoch: 4, timeOrigin: targetTimeOrigin, url: 'http://127.0.0.1:4174/'},
    {...next, type: 'request', eventSequence: 161, ms: 4508},
    {...next, type: 'requestfinished', eventSequence: 163, ms: 4510},
  ];
  return {read, trace: {events, transitions: [reload], reads: [read, next], documentEpoch: 4, documentTimeOrigin: targetTimeOrigin, documentUrl: 'http://127.0.0.1:4174/'}, reload, next};
}
const evidence = value => classifyReloadReadCancellation(value.read, value.trace);
const event = (value, type) => value.trace.events.find(entry => entry.type === type);
const removeEvent = (value, type) => {value.trace.events = value.trace.events.filter(entry => entry.type !== type);};

test('only a fully correlated outgoing reload cancellation has positive evidence', () => {
  for (const failure of ['net::ERR_ABORTED', 'Load request cancelled']) for (const status of [undefined, 200, 204]) {
    const value = fixture(); value.read.failure = failure; value.read.status = status;
    Object.assign(event(value, 'requestfailed'), {failure, status});
    const original = structuredClone(value);
    assert.deepEqual(evidence(value), {kind: 'explicit-reload-outgoing-read-cancelled', read: 37, sourceEpoch: 3,
      sourceTimeOrigin: 1791288004573.1, reloadStartedEvent: 151, beforeunloadEvent: 157, committedEvent: 159,
      documentStartedEvent: 160, targetEpoch: 4, targetTimeOrigin: 1791288004593.1, replacementRead: 38});
    assert.deepEqual(value, original, 'Neither original read nor original failure event is changed.');
  }
});
test('replacement init/commit delivery order and body cancellation after commit retain exact proof', () => {
  const value = fixture(), commit = event(value, 'frame-navigated'), init = value.trace.events.find(entry => entry.event === 'new-document');
  [commit.eventSequence, init.eventSequence] = [init.eventSequence, commit.eventSequence];
  [commit.ms, init.ms] = [init.ms, commit.ms];
  value.reload.committedEvent = commit.eventSequence; value.reload.committedMs = commit.ms;
  value.reload.documentStartedEvent = init.eventSequence; value.reload.documentStartedMs = init.ms;
  value.read.finishedEvent = 162; value.read.finishedMs = 4509;
  Object.assign(event(value, 'requestfailed'), {eventSequence: 162, finishedEvent: 162, ms: 4509, finishedMs: 4509});
  assert.ok(evidence(value));
});
test('a request arriving as the drain promise resolves needs its pending snapshot and undrained id', () => {
  const value = fixture(); value.read.startedEvent = 149; value.read.startedMs = 4489;
  Object.assign(event(value, 'request'), {eventSequence: 149, startedEvent: 149, startedMs: 4489, ms: 4489});
  event(value, 'route-reads-settled').pending.push({...value.read});
  assert.ok(evidence(value));
  event(value, 'route-reads-settled').pending = [];
  assert.equal(evidence(value), null);
});
test('missing replacement success can only keep polling, never produce a passing classification', () => {
  const value = fixture(); value.trace.reads.pop();
  assert.equal(evidence(value), null); assert.equal(isPendingReloadReadCancellation(value.read, value.trace), true);
  value.read.status = 403; event(value, 'requestfailed').status = 403;
  assert.equal(isPendingReloadReadCancellation(value.read, value.trace), false);
});

const mutations = {
  'unknown source epoch': v => {v.read.documentEpoch = null;},
  'unknown source time origin': v => {v.read.documentTimeOrigin = null;},
  'current-document cancellation even after success': v => {v.read.documentEpoch = 4; v.read.documentTimeOrigin = v.trace.documentTimeOrigin;},
  'old read without a deliberate reload': v => {v.trace.transitions = [];},
  'signin is not a reload': v => {v.reload.type = 'signin';},
  'closure is not a reload': v => {v.reload.type = 'context-close';},
  'uncommitted reload': v => {delete v.reload.committedEvent;},
  'missing replacement time origin': v => {delete v.reload.targetTimeOrigin;},
  'same-document hash change': v => {v.reload.targetEpoch = 3;},
  'unchanged replacement time origin': v => {v.reload.targetTimeOrigin = v.reload.sourceTimeOrigin;},
  'later unrelated current document': v => {v.trace.documentEpoch = 5;},
  'mismatched current time origin': v => {v.trace.documentTimeOrigin++;},
  'unknown frame': v => {v.read.frame = null;},
  'non-main-frame read': v => {v.read.mainFrame = false;},
  'detached frame': v => {v.read.detached = true;},
  'POST is not a read': v => {v.read.method = 'POST';},
  'navigation request': v => {v.read.navigation = true;},
  'image request': v => {v.read.resource = 'image';},
  'generic cancellation wording': v => {v.read.failure = 'cancelled';},
  'other transport error': v => {v.read.failure = 'net::ERR_FAILED';},
  'access-control error': v => {v.read.failure = 'Access control checks failed';},
  '401 is never excused': v => {v.read.status = 401; event(v, 'requestfailed').status = 401;},
  '403-body cancellation is never excused': v => {v.read.status = 403; event(v, 'requestfailed').status = 403;},
  '503-body cancellation is never excused': v => {v.read.status = 503; event(v, 'requestfailed').status = 503;},
  'string 200 is not a known HTTP status': v => {v.read.status = '200';},
  'missing request start record': v => removeEvent(v, 'request'),
  'missing failure record': v => removeEvent(v, 'requestfailed'),
  'mismatched failure record': v => {event(v, 'requestfailed').failure = 'net::ERR_FAILED';},
  'mismatched request frame': v => {event(v, 'request').frame = 2;},
  'missing reload start record': v => removeEvent(v, 'reload-start'),
  'mismatched reload source record': v => {event(v, 'reload-start').sourceEpoch = 2;},
  'missing explicit drain pointer': v => {delete v.reload.drainedEvent;},
  'drain pointer refers to reload start': v => {v.reload.drainedEvent = v.reload.startedEvent;},
  'missing drain record': v => removeEvent(v, 'route-reads-settled'),
  'already-drained request': v => {event(v, 'route-reads-settled').through = 37;},
  'missing commit record': v => removeEvent(v, 'frame-navigated'),
  'wrong commit frame': v => {event(v, 'frame-navigated').frame = 2;},
  'wrong commit target': v => {event(v, 'frame-navigated').frameUrl = 'http://127.0.0.1:4174/#/home';},
  'missing replacement init': v => {v.trace.events = v.trace.events.filter(entry => entry.event !== 'new-document');},
  'replacement init from wrong address': v => {v.trace.events.find(entry => entry.event === 'new-document').url = 'https://other.test/';},
  'missing beforeunload': v => {v.trace.events = v.trace.events.filter(entry => entry.event !== 'beforeunload');},
  'read started in commit/init gap': v => {v.read.startedEvent = 159;},
  'failure before reload at same ms': v => {v.read.finishedEvent = 150; v.read.finishedMs = 4490; Object.assign(event(v, 'requestfailed'), {finishedEvent: 150, eventSequence: 150, finishedMs: 4490, ms: 4490});},
  'failure timestamp before reload': v => {v.read.finishedMs = 4489;},
  'replacement success from outgoing epoch': v => {v.next.documentEpoch = 3;},
  'replacement success with wrong time origin': v => {v.next.documentTimeOrigin--;},
  'replacement success for another endpoint': v => {v.next.path = '/api/state';},
  'replacement success on another frame': v => {v.next.frame = 2;},
  'replacement success on another route': v => {v.next.frameUrl = 'http://127.0.0.1:4174/#/home';},
  'replacement success from wrong URL': v => {v.next.url = 'https://other.test/api/notifications';},
  'replacement response headers only': v => {delete v.next.finishedEvent; delete v.next.finishedMs;},
  'replacement failed after 200 headers': v => {v.next.failure = 'net::ERR_ABORTED';},
  'replacement before init/commit': v => {v.next.startedEvent = 159;},
  'replacement before init timestamp': v => {v.next.startedMs = 4506;},
  'missing replacement start record': v => {v.trace.events = v.trace.events.filter(entry => entry.eventSequence !== 161);},
  'missing replacement finish record': v => removeEvent(v, 'requestfinished'),
  'mismatched replacement finish path': v => {event(v, 'requestfinished').path = '/api/state';},
  'unreadable lifecycle': v => {v.trace.events.push({type: 'unreadable-lifecycle-record'});},
};
for (const [name, mutate] of Object.entries(mutations)) test('fails closed: ' + name, () => {
  const value = fixture(); mutate(value);
  assert.equal(evidence(value), null);
  assert.ok(Object.values(inspectReloadReadCancellation(value.read, value.trace).checks).includes(false));
});

test('historical request 37 remains unclassified without unavailable transition/lifecycle evidence', () => {
  const value = fixture(); value.trace.events = []; value.trace.transitions = [];
  assert.equal(evidence(value), null); assert.equal(isPendingReloadReadCancellation(value.read, value.trace), false);
});
