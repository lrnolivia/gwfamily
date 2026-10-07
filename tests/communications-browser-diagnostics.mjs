// Body-free, bounded diagnostics for the hosted communications harness. This
// module has no Playwright dependency and its event contracts run in Node.
import {classifyCommunicationsReadCancellation, inspectCommunicationsReadCancellation} from './communications-read-diagnostics.mjs';
const EVENT_LIMIT = 700, READ_LIMIT = 300, STACK_LIMIT = 4000;
export const COMMUNICATIONS_LIFECYCLE_PREFIX = '__GW_COMMUNICATIONS_LIFECYCLE__';

export function diagnosticUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return url.protocol;
    // Queries and userinfo may contain tokens; route identity is enough here.
    return (url.origin + url.pathname + url.hash.split('?')[0]).slice(0, 1000);
  } catch { return '<unavailable>'; }
}
function diagnosticText(value, limit = 2000) {
  return String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/g, diagnosticUrl).slice(0, limit);
}
export function installCommunicationsLifecycle() {
  if (window !== window.top) return;
  const emit = (event, detail = {}) => console.log('__GW_COMMUNICATIONS_LIFECYCLE__' + JSON.stringify({
    event, url: location.origin + location.pathname, timeOrigin: performance.timeOrigin, documentMs: performance.now(), readyState: document.readyState, ...detail,
  }));
  emit('new-document');
  for (const event of ['beforeunload', 'pagehide', 'pageshow']) addEventListener(event, value => emit(event, {persisted: !!value.persisted}));
  // Observation only: never preventDefault or otherwise consume an exception.
  addEventListener('error', event => emit('window-error', {message: event.message, filename: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack}));
  addEventListener('unhandledrejection', event => emit('unhandledrejection', {message: String(event.reason?.message || event.reason), stack: event.reason?.stack}));
}
export function observeCommunicationsPage({page, context, label, base, errors, getCheck, started = Date.now()}) {
  const trace = {sequence: 0, eventSequence: 0, document: 0, documentEpoch: 0, documentTimeOrigin: null, documentUrl: null,
    lastDrained: 0, events: [], droppedEvents: 0, reads: [], pending: new Map(), transitions: [], classifiedReadCancellations: []};
  const requests = new WeakMap(), frames = new WeakMap();
  let frameSequence = 0;
  const frameInfo = frame => {
    if (!frame) return {frame: null};
    if (!frames.has(frame)) frames.set(frame, ++frameSequence);
    return {frame: frames.get(frame), mainFrame: frame === page.mainFrame(), frameUrl: diagnosticUrl(frame.url()), detached: frame.isDetached?.() || false};
  };
  trace.log = (type, detail = {}) => {
    trace.events.push({eventSequence: ++trace.eventSequence, ms: Date.now() - started, check: getCheck(), context: label,
      document: trace.document, documentEpoch: trace.documentEpoch, documentTimeOrigin: trace.documentTimeOrigin,
      documentUrl: diagnosticUrl(page.url()), ...detail, type});
    if (trace.events.length > EVENT_LIMIT) {trace.events.shift(); trace.droppedEvents++;}
  };
  trace.snapshot = () => ({pending: [...trace.pending.values()].map(entry => ({...entry})), transitions: trace.transitions.slice(-4).map(value => ({...value})), recentEvents: trace.events.slice(-30)});
  trace.beginTransition = (type, target = page.url()) => {
    const transition = {type, sourceUrl: diagnosticUrl(page.url()), target: diagnosticUrl(target),
      sourceEpoch: trace.documentEpoch, sourceTimeOrigin: trace.documentTimeOrigin,
      startedMs: Date.now() - started, startedEvent: trace.eventSequence + 1,
      drainedEvent: trace.events.findLast(event => event.type === 'route-reads-settled' &&
        event.documentEpoch === trace.documentEpoch && event.documentTimeOrigin === trace.documentTimeOrigin)?.eventSequence};
    trace.transitions.push(transition);
    if (trace.transitions.length > 50) trace.transitions.shift();
    trace.log(type + '-start', {...transition, ms: transition.startedMs, pending: trace.snapshot().pending});
  };
  const address = value => {try {const url = new URL(value); return url.origin + url.pathname;} catch {return '';}};
  const currentRead = (read, since) => read.id > since && read.documentEpoch === trace.documentEpoch &&
    read.documentTimeOrigin === trace.documentTimeOrigin && trace.documentEpoch > 0 && read.mainFrame;
  trace.readiness = ({since = trace.lastDrained, required = []} = {}) => ({
    missing: required.filter(path => !trace.reads.some(read => currentRead(read, since) && read.path === path &&
      read.finishedMs !== undefined && !read.failure && read.status >= 200 && read.status < 300)),
    pending: [...trace.pending.values()].map(({id, path, method}) => ({id, path, method})),
  });
  trace.requiredReadFailures = ({since = trace.lastDrained, required = []} = {}) => trace.reads
    .filter(read => read.id > since && required.includes(read.path) && read.finishedMs !== undefined &&
      (read.failure || !(read.status >= 200 && read.status < 300)) && !classifyCommunicationsReadCancellation(read, trace))
    .map(read => ({...read}));
  trace.reportRequiredReadFailures = options => {
    for (const read of trace.requiredReadFailures(options)) {
      const detail = {read: {...read}, current: {epoch: trace.documentEpoch, timeOrigin: trace.documentTimeOrigin},
        ...inspectCommunicationsReadCancellation(read, trace)};
      trace.log('required-read-failure', detail);
      console.error('COMMUNICATIONS REQUIRED READ FAILURE', JSON.stringify(detail));
    }
  };
  trace.recordReadCancellations = ({since, required}, through) => {
    for (const read of trace.reads.filter(read => read.id > since && read.id <= through && required.includes(read.path))) {
      const evidence = classifyCommunicationsReadCancellation(read, trace);
      if (evidence && !trace.classifiedReadCancellations.some(value => value.read.id === read.id)) {
        const detail = {read: {...read}, evidence};
        trace.classifiedReadCancellations.push(detail);
        trace.log('superseded-document-read-cancelled', detail);
      }
    }
  };
  page.on('request', request => {
    const url = new URL(request.url()), sameOriginApi = url.origin === base && url.pathname.startsWith('/api/');
    if (!sameOriginApi && !request.isNavigationRequest()) return;
    let frame;
    try {frame = frameInfo(request.frame());} catch {frame = {frame: null, frameUnavailable: true};}
    const transition = trace.transitions.at(-1);
    // A new commit is not evidence of its JavaScript document identity. Keep
    // reads in that gap unknown rather than attributing them to the old page.
    const committedWithoutIdentity = transition && ['signin', 'navigation', 'reload'].includes(transition.type) &&
      transition.committedEvent !== undefined && transition.targetEpoch === undefined;
    const knownDocument = frame.mainFrame && trace.documentEpoch > 0 &&
      address(trace.documentUrl) === address(page.url()) && !committedWithoutIdentity;
    const entry = {id: ++trace.sequence, url: diagnosticUrl(request.url()), path: url.pathname, method: request.method(), resource: request.resourceType(), navigation: request.isNavigationRequest(), startedMs: Date.now() - started, startedDocument: trace.document,
      startedEvent: trace.eventSequence + 1, documentEpoch: knownDocument ? trace.documentEpoch : null,
      documentTimeOrigin: knownDocument ? trace.documentTimeOrigin : null, ...frame};
    requests.set(request, entry);
    if (sameOriginApi && ['fetch', 'xhr'].includes(entry.resource)) {
      trace.pending.set(entry.id, entry);
      if (entry.method === 'GET') {
        trace.reads.push(entry);
        if (trace.reads.length > READ_LIMIT) trace.reads.shift();
      }
    }
    trace.log('request', {...entry, ms: entry.startedMs});
  });
  page.on('response', response => {
    const entry = requests.get(response.request()); if (!entry) return;
    entry.status = response.status(); entry.responseMs = Date.now() - started;
    const headers = response.headers();
    trace.log('response', {id: entry.id, url: diagnosticUrl(response.url()), status: entry.status,
      headers: Object.fromEntries(Object.entries(headers).filter(([name]) => ['content-type', 'cache-control', 'access-control-allow-origin'].includes(name)))});
  });
  for (const event of ['requestfinished', 'requestfailed']) page.on(event, request => {
    const entry = requests.get(request); if (!entry) return;
    entry.finishedMs = Date.now() - started;
    entry.finishedEvent = trace.eventSequence + 1;
    if (event === 'requestfailed') entry.failure = diagnosticText(request.failure()?.errorText || 'Unknown request failure');
    trace.pending.delete(entry.id);
    trace.log(event, {...entry, ms: entry.finishedMs});
  });
  page.on('framenavigated', frame => {
    const ms = Date.now() - started;
    const transition = trace.transitions.at(-1);
    if (frame === page.mainFrame() && transition && ['signin', 'navigation', 'reload'].includes(transition.type) && transition.committedEvent === undefined) {
      transition.committedEvent = trace.eventSequence + 1; transition.committedMs = ms;
    }
    trace.log('frame-navigated', {...frameInfo(frame), ms});
  });
  for (const event of ['frameattached', 'framedetached']) page.on(event, frame => trace.log(event, frameInfo(frame)));
  for (const event of ['domcontentloaded', 'load', 'close', 'crash']) page.on(event, () => trace.log('page-' + event, {pendingCount: trace.pending.size}));
  context.on('close', () => trace.log('context-close', {pendingCount: trace.pending.size}));
  page.on('console', message => {
    if (!message.text().startsWith(COMMUNICATIONS_LIFECYCLE_PREFIX)) return;
    try {
      const detail = JSON.parse(message.text().slice(COMMUNICATIONS_LIFECYCLE_PREFIX.length)), ms = Date.now() - started;
      if (detail.event === 'new-document' && Number.isFinite(detail.timeOrigin) && typeof detail.url === 'string' && detail.timeOrigin !== trace.documentTimeOrigin) {
        const previousEpoch = trace.documentEpoch;
        trace.document = ++trace.documentEpoch; trace.documentTimeOrigin = detail.timeOrigin; trace.documentUrl = diagnosticUrl(detail.url);
        const transition = trace.transitions.at(-1);
        if (transition?.sourceEpoch === previousEpoch && ['signin', 'navigation', 'reload'].includes(transition.type) && transition.targetEpoch === undefined) {
          transition.targetEpoch = trace.documentEpoch; transition.targetTimeOrigin = detail.timeOrigin;
          transition.documentStartedEvent = trace.eventSequence + 1; transition.documentStartedMs = ms;
        }
      }
      // Do not copy arbitrary console records, bodies or application state.
      trace.log('document-lifecycle', {
        ms, event: diagnosticText(detail.event, 80), url: diagnosticUrl(detail.url), timeOrigin: detail.timeOrigin, documentMs: detail.documentMs,
        readyState: diagnosticText(detail.readyState, 40), persisted: detail.persisted,
        ...(detail.message === undefined ? {} : {message: diagnosticText(detail.message), stack: diagnosticText(detail.stack, STACK_LIMIT), filename: diagnosticUrl(detail.filename), line: detail.line, column: detail.column}),
      });
    } catch {trace.log('unreadable-lifecycle-record');}
  });
  page.on('pageerror', error => {
    const detail = {user: label, error: diagnosticText(error.message), name: diagnosticText(error.name, 100), stack: diagnosticText(error.stack, STACK_LIMIT), ms: Date.now() - started, check: getCheck(), document: trace.document, documentUrl: diagnosticUrl(page.url()), ...trace.snapshot()};
    errors.push(detail); // Keep every pageerror, including access-control errors.
    trace.log('pageerror', {error: detail.error, stack: detail.stack});
    console.error('COMMUNICATIONS BROWSER ERROR', JSON.stringify(detail));
  });
  trace.log('observe-page', frameInfo(page.mainFrame()));
  return trace;
}
