import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReloadInspectorError, reportReloadInspectorErrors} from './reload-inspector-diagnostics.mjs';

// The signature/outgoing timings match b09's hosted WebKit trace. Attempt and
// replacement records are synthetic positive evidence now required by the
// harness; the old compact annotation alone cannot establish this contract.
function fixture() {
  const base = 'http://127.0.0.1:4174', timeOrigin = 1791286407909;
  const error = {name: 'Fetch API cannot load http', error: '/127.0.0.1:4174/api/notifications due to access control checks.',
    stack: `Fetch API cannot load ${base}/api/notifications due to access control checks.\n` +
      `    at unknown (web-inspector://bootstrap.js:37:32)\n    at api (${base}/react-app.js:24802:33)\n` +
      `    at notificationRequest (${base}/react-app.js:24818:23)\n    at list (${base}/react-app.js:24825:71)`,
    document: base + '/#/you', documentEpoch: 3, documentTimeOrigin: timeOrigin, eventSequence: 153, ms: 8089, pending: []};
  const transition = {type: 'reload', target: error.document, sourceEpoch: 3, sourceTimeOrigin: timeOrigin,
    startedEvent: 150, startedMs: 8062, committedEvent: 154, committedMs: 8100, documentStartedEvent: 155,
    documentStartedMs: 8101, targetEpoch: 4, targetTimeOrigin: timeOrigin + 2300};
  const lifecycle = (event, eventSequence, ms, extra = {}) => ({type: 'document-lifecycle', event, eventSequence, ms,
    documentEpoch: 3, timeOrigin, url: base + '/', ...extra});
  return {engine: 'webkit', base, error, transitions: [transition], domErrors: [], events: [
    {type: 'route-reads-settled', eventSequence: 149, ms: 8062, documentEpoch: 3, documentTimeOrigin: timeOrigin, document: error.document, pending: [], through: 35},
    {type: 'reload-start', eventSequence: 150, ms: 8062, sourceEpoch: 3, sourceTimeOrigin: timeOrigin,
      documentEpoch: 3, documentTimeOrigin: timeOrigin, target: error.document, pending: []},
    lifecycle('beforeunload', 151, 8083), lifecycle('notification-fetch-attempt', 152, 8088, {request: 2, aborted: false}),
    {...error, type: 'pageerror'},
    {type: 'frame-navigated', eventSequence: 154, ms: 8100, mainFrame: true, frameUrl: error.document},
    lifecycle('new-document', 155, 8101, {documentEpoch: 4, timeOrigin: transition.targetTimeOrigin}),
    {type: 'reload-ready', eventSequence: 160, ms: 8400, documentEpoch: 4, documentTimeOrigin: transition.targetTimeOrigin, pending: []},
  ], reads: [
    {id: 29, path: '/api/notifications', method: 'GET', mainFrame: true, documentEpoch: 3, documentTimeOrigin: timeOrigin,
      startedEvent: 114, finishedEvent: 125, startedMs: 6227, finishedMs: 6279, status: 200},
    {id: 40, path: '/api/notifications', method: 'GET', mainFrame: true, documentEpoch: 4,
      documentTimeOrigin: transition.targetTimeOrigin, startedEvent: 157, finishedEvent: 159, startedMs: 8200, finishedMs: 8300, status: 200},
  ]};
}

test('classifies only the complete inspector-only notification teardown proof and retains its provenance', () => {
  const value = fixture(), evidence = classifyReloadInspectorError(value);
  assert.equal(evidence.kind, 'webkit-inspector-notification-reload-teardown');
  assert.equal(evidence.fetchAttemptEvent, 152); assert.equal(evidence.beforeunloadEvent, 151);
  assert.deepEqual(evidence.completedNotificationReads, [29]); assert.equal(evidence.replacementNotificationRead, 40);
  const report = reportReloadInspectorErrors({...value, traces: [{...value, pageErrors: [value.error]}]});
  assert.equal(report.pageErrorCount, 1); assert.equal(report.classifiedInspectorCount, 1);
  assert.equal(report.classifiedInspectorErrors[0].error, value.error);
  assert.deepEqual(report.fatalErrors, []); assert.deepEqual(report.domErrors, []);
});

const rejectCases = {
  'missing original pageerror event': v => {v.events.splice(4, 1);},
  'mismatched reload start identity': v => {v.events[1].sourceEpoch = 2;},
  'mismatched commit timestamp': v => {v.events[5].ms++;},
  'missing outgoing request start': v => {delete v.reads[0].startedEvent;},
  'missing outgoing request finish time': v => {delete v.reads[0].finishedMs;},
  'missing replacement request id': v => {delete v.reads[1].id;},
  'replacement 403 followed by success': v => {v.reads.push({...v.reads[1], id: 39, status: 403});},
  'replacement late 403 after readiness': v => {v.reads.push({...v.reads[1], id: 41, status: 403, startedEvent: 161, finishedEvent: 162});},
  'replacement pending read': v => {v.reads.push({...v.reads[1], id: 41, finishedEvent: undefined});},
  'unrelated API auth failure in outgoing document': v => {v.reads.push({...v.reads[0], id: 28, path: '/api/state', status: 401});},
  'unrelated API auth failure in replacement document': v => {v.reads.push({...v.reads[1], id: 41, path: '/api/state', status: 403});},
  'unreadable replacement lifecycle record': v => {v.events.push({type: 'unreadable-lifecycle-record', documentEpoch: 4});},
  'missing attempt abort state': v => {delete v.events[3].aborted;},
  'zero attempt request id': v => {v.events[3].request = 0;},
  'unknown-epoch API auth failure during commit gap': v => {v.reads.push({...v.reads[1], id: 41, path: '/api/state', status: 401,
    documentEpoch: null, documentTimeOrigin: null, startedEvent: 154, finishedEvent: 156, startedMs: 8100});},
  'unrelated API source time origin mismatch': v => {v.reads.push({...v.reads[0], id: 28, path: '/api/state', documentTimeOrigin: 1});},
  'string beforeunload sequence': v => {v.events[2].eventSequence = '151';},
  'string drain sequence': v => {v.events[0].through = '35';},
  'negative replacement time origin': v => {v.transitions[0].targetTimeOrigin = -1;},
  'string attempt sequence': v => {v.events[3].eventSequence = '152';},
  'Chromium': v => {v.engine = 'chromium';},
  'missing engine': v => {delete v.engine;},
  'missing DOM observation': v => {delete v.domErrors;},
  'ordinary application stack': v => {v.error.stack = v.error.stack.replace('web-inspector://bootstrap.js', v.base + '/react-app.js');},
  'different endpoint': v => {v.error.error = v.error.error.replace('/notifications', '/state');},
  'different origin': v => {v.base = 'http://elsewhere.test';},
  'missing notification call frame': v => {v.error.stack = v.error.stack.replace('at notificationRequest', 'at unrelated');},
  'pending read at error': v => {v.error.pending.push({path: '/api/notifications'});},
  'pending write at reload': v => {v.events[1].pending.push({method: 'POST'});},
  'no drain': v => {v.events.shift();},
  'drain from another epoch': v => {v.events[0].documentEpoch = 2;},
  'undrained successful request': v => {v.events[0].through = 28;},
  'signin instead of explicit reload': v => {v.transitions[0].type = 'signin';},
  'closure instead of reload': v => {v.transitions[0].type = 'browser-close';},
  'wrong reload target': v => {v.transitions[0].target = v.base + '/#/home';},
  'wrong source epoch': v => {v.transitions[0].sourceEpoch = 2;},
  'wrong source time origin': v => {v.transitions[0].sourceTimeOrigin--;},
  'missing beforeunload': v => {v.events.splice(2, 1);},
  'beforeunload from another document': v => {v.events[2].timeOrigin--;},
  'beforeunload before explicit intent at same millisecond': v => {v.events[2].eventSequence = 149; v.events[2].ms = 8062;},
  'missing actual fetch attempt': v => {v.events.splice(3, 1);},
  'attempt before beforeunload at same millisecond': v => {v.events[3].eventSequence = 150; v.events[3].ms = 8083;},
  'already aborted attempt': v => {v.events[3].aborted = true;},
  'attempt from another document': v => {v.events[3].documentEpoch = 2;},
  'backwards timestamp despite ordered sequence': v => {v.error.ms = 8080;},
  'error after commit at same millisecond': v => {v.error.eventSequence = 156; v.error.ms = 8101;},
  'cancelled reload without commit': v => {delete v.transitions[0].committedEvent;},
  'missing actual main frame commit': v => {v.events[5].mainFrame = false;},
  'missing replacement document': v => {v.events.splice(6, 1);},
  'replacement reuses source time origin': v => {v.transitions[0].targetTimeOrigin = v.error.documentTimeOrigin;},
  'missing replacement readiness': v => {v.events.pop();},
  'missing replacement notification read': v => {v.reads.pop();},
  'replacement read borrowed from outgoing document': v => {v.reads[1].documentEpoch = 3;},
  'unknown outgoing read document identity': v => {v.reads[0].documentTimeOrigin = null;},
  'read not finished before reload': v => {v.reads[0].finishedEvent = 152;},
  'late new network request': v => {v.reads.push({...v.reads[0], id: 36, startedEvent: 152});},
  'unreadable lifecycle evidence': v => {v.events.push({type: 'unreadable-lifecycle-record', documentEpoch: 3});},
  'DOM error before or after inspector delivery': v => {v.domErrors.push({event: 'window-error'});},
  'unhandled rejection after replacement': v => {v.domErrors.push({event: 'unhandledrejection', documentEpoch: 4});},
};
for (const [name, mutate] of Object.entries(rejectCases)) test('fails closed: ' + name, () => {
  const value = fixture(); mutate(value); assert.equal(classifyReloadInspectorError(value), null);
});
for (const status of [401, 403, 503]) for (const index of [0, 1]) test(`rejects ${status} in ${index ? 'replacement' : 'outgoing'} document`, () => {
  const value = fixture(); value.reads[index].status = status; assert.equal(classifyReloadInspectorError(value), null);
});
for (const failure of ['Load request cancelled', 'net::ERR_ABORTED', 'Access control checks failed']) test('rejects actual transport failure: ' + failure, () => {
  const value = fixture(); value.reads[0].failure = failure; assert.equal(classifyReloadInspectorError(value), null);
});

test('aggregation never removes originals and independently reports delayed DOM/rejection failures', () => {
  const value = fixture(), trace = {...value, pageErrors: [value.error]}, original = structuredClone(value.error);
  const other = {...fixture(), pageErrors: [{...value.error, name: 'TypeError'}]};
  const first = reportReloadInspectorErrors({...value, traces: [trace, other]});
  assert.equal(first.pageErrorCount, 2); assert.equal(first.classifiedInspectorCount, 1); assert.equal(first.fatalErrors.length, 1);
  trace.domErrors.push({event: 'unhandledrejection', documentEpoch: 4});
  const later = reportReloadInspectorErrors({...value, traces: [trace, other]});
  assert.equal(later.classifiedInspectorCount, 0); assert.equal(later.fatalErrors.length, 2); assert.equal(later.domErrors.length, 1);
  assert.deepEqual(trace.pageErrors, [original]);
});
