// Body-free, bounded request/lifecycle evidence for hosted Live API checks.
// No browser dependency: the observation and readiness contracts run in Node.
import {diagnosticUrl} from './communications-browser-diagnostics.mjs';

export const LIVE_LIFECYCLE_PREFIX = '__GW_LIVE_LIFECYCLE__';
const EVENT_LIMIT = 700, READ_LIMIT = 300;
const safeText = (value, limit = 2000) => String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/g, value => {
  // Stack coordinates follow the version query, so removing the entire query
  // would also discard the only useful source position in a bundled build.
  const position = /(:\d+:\d+\)?)$/.exec(value);
  return diagnosticUrl(position ? value.slice(0, -position[0].length) : value) + (position?.[0] || '');
}).replace(/\/[^\s"'<>?]*\?[^\s"'<>]+/g, value => {
  // Playwright WebKit splits a raw inspector URL at its first colon and can
  // leave only "/host/path?query" in error.message. Strip that query too.
  return value.slice(0, value.indexOf('?')) + (/(:\d+:\d+\)?)$/.exec(value)?.[0] || '');
}).slice(0, limit);
const address = value => {try {const url = new URL(value); return url.origin + url.pathname;} catch {return '';}};

// Keep the entire annotation below GitHub's per-message limit. The separate
// network artifact still contains the full timeline; this remains readable
// through connectors that only expose check annotations.
export function liveFailureAnnotation(detail, trace) {
  const text = `${detail.name}: ${detail.error}\n${detail.stack}`;
  const matching = trace.reads.filter(read => text.includes(read.path)).slice(-3);
  const compact = {
    name: safeText(detail.name, 100), message: safeText(detail.error, 280), check: safeText(detail.check, 100),
    ms: detail.ms, epoch: detail.documentEpoch, timeOrigin: trace.documentTimeOrigin,
    reads: matching.map(read => ({id: read.id, path: read.path.slice(0, 150), epoch: read.documentEpoch,
      timeOrigin: read.documentTimeOrigin, start: read.startedMs, response: read.responseMs, end: read.finishedMs,
      status: read.status, failure: read.failure ? safeText(read.failure, 150) : undefined})),
    navigation: trace.transitions.slice(-2).map(value => ({type: safeText(value.type, 80), start: value.startedMs,
      commit: value.committedMs, documentStart: value.documentStartedMs, sourceEpoch: value.sourceEpoch, targetEpoch: value.targetEpoch})),
    lifecycle: trace.events.filter(value => value.type === 'document-lifecycle').slice(-5).map(value => ({
      event: value.event, ms: value.ms, epoch: value.documentEpoch, request: value.request, aborted: value.aborted,
      message: value.message ? safeText(value.message, 200) : undefined,
      stack: value.stack ? safeText(value.stack, 350) : undefined,
    })),
    stack: safeText(detail.stack, 800),
  };
  const encode = value => JSON.stringify(value).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D');
  // Reduce whole optional fields, never truncate JSON midway through a value.
  while (encode(compact).length > 3800 && compact.lifecycle.length) compact.lifecycle.shift();
  while (encode(compact).length > 3800 && compact.reads.length > 1) compact.reads.shift();
  while (encode(compact).length > 3800 && compact.stack.length) compact.stack = compact.stack.slice(0, Math.floor(compact.stack.length / 2));
  return '::error title=GW live request failure::' + encode(compact);
}

export function installLiveLifecycle() {
  if (window !== window.top) return;
  const emit = (event, detail = {}) => console.log('__GW_LIVE_LIFECYCLE__' + JSON.stringify({
    event, url: location.origin + location.pathname, timeOrigin: performance.timeOrigin,
    documentMs: performance.now(), readyState: document.readyState, ...detail,
  }));
  emit('new-document');
  for (const event of ['beforeunload', 'pagehide', 'pageshow']) addEventListener(event, value => emit(event, {persisted: !!value.persisted}));
  // Observe exceptions without consuming or changing their browser delivery.
  addEventListener('error', event => emit('window-error', {message: event.message, filename: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack}));
  addEventListener('unhandledrejection', event => emit('unhandledrejection', {message: String(event.reason?.message || event.reason), stack: event.reason?.stack}));
  // Observe notification cancellation without settling, chaining, or replacing
  // its promise. A handled fetch rejection must stay distinguishable from a
  // WebKit inspector error, which Playwright also forwards as a pageerror.
  const fetch = window.fetch;
  let request = 0;
  window.fetch = function(input, options) {
    let url;
    // Inspect only the notification endpoint; malformed/native inputs keep
    // native behavior. Record the attempt before native fetch can throw during
    // teardown, without chaining or handling its returned promise.
    try {url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);} catch {}
    const notification = url?.origin === location.origin && url.pathname === '/api/notifications';
    const id = notification ? ++request : null, signal = notification ? options?.signal || input?.signal : null;
    if (notification) emit('notification-fetch-attempt', {request: id, aborted: !!signal?.aborted,
      stack: new Error('Notification fetch attempted').stack});
    const promise = fetch.apply(this, arguments);
    if (notification) {
      emit('notification-fetch', {request: id, aborted: !!signal?.aborted});
      signal?.addEventListener('abort', () => emit('notification-abort', {request: id, aborted: true,
        stack: new Error('Notification AbortSignal fired').stack}), {once: true});
    }
    return promise;
  };
}

export function observeLivePage({page, context, label, base, errors, getCheck, started = Date.now()}) {
  const trace = {sequence: 0, eventSequence: 0, documentEpoch: 0, documentTimeOrigin: null, documentUrl: null,
    lastDrained: 0, events: [], droppedEvents: 0, reads: [], pending: new Map(), transitions: [], pageErrors: [], domErrors: []};
  const requests = new WeakMap(), frames = new WeakMap();
  let frameSequence = 0;
  const frameInfo = frame => {
    if (!frame) return {frame: null};
    if (!frames.has(frame)) frames.set(frame, ++frameSequence);
    return {frame: frames.get(frame), mainFrame: frame === page.mainFrame(), frameUrl: diagnosticUrl(frame.url()), detached: frame.isDetached?.() || false};
  };
  trace.log = (type, detail = {}) => {
    trace.events.push({eventSequence: ++trace.eventSequence, ms: Date.now() - started, check: getCheck(), user: label,
      document: diagnosticUrl(page.url()), documentEpoch: trace.documentEpoch, documentTimeOrigin: trace.documentTimeOrigin, ...detail, type});
    if (trace.events.length > EVENT_LIMIT) {trace.events.shift(); trace.droppedEvents++;}
  };
  trace.snapshot = () => ({pending: [...trace.pending.values()].map(read => ({...read})),
    transitions: trace.transitions.slice(-4).map(value => ({...value})), recentEvents: trace.events.slice(-40)});
  trace.beginTransition = (type, target = page.url()) => {
    const transition = {type, target: diagnosticUrl(target), sourceEpoch: trace.documentEpoch, sourceTimeOrigin: trace.documentTimeOrigin,
      startedMs: Date.now() - started, startedEvent: trace.eventSequence + 1};
    trace.transitions.push(transition);
    if (trace.transitions.length > 50) trace.transitions.shift();
    trace.log(type + '-start', {...transition, ms: transition.startedMs, pending: trace.snapshot().pending});
  };
  const currentRead = (read, since) => read.id > since && read.documentEpoch === trace.documentEpoch &&
    read.documentTimeOrigin === trace.documentTimeOrigin && trace.documentEpoch > 0 && read.mainFrame;
  trace.readiness = ({since = trace.lastDrained, required = []} = {}) => ({
    missing: required.filter(path => !trace.reads.some(read => currentRead(read, since) && read.path === path &&
      read.finishedMs !== undefined && !read.failure && read.status >= 200 && read.status < 300)),
    pending: [...trace.pending.values()].map(({id, path, method}) => ({id, path, method})),
  });
  trace.requiredReadFailures = ({since = trace.lastDrained, required = []} = {}) => trace.reads
    .filter(read => read.id > since && required.includes(read.path) && read.finishedMs !== undefined &&
      (read.failure || !(read.status >= 200 && read.status < 300))).map(read => ({...read}));

  page.on('request', request => {
    const url = new URL(request.url()), sameOriginApi = url.origin === base && url.pathname.startsWith('/api/');
    if (!sameOriginApi && !request.isNavigationRequest()) return;
    let frame;
    try {frame = frameInfo(request.frame());} catch {frame = {frame: null, frameUnavailable: true};}
    const transition = trace.transitions.at(-1);
    // Do not assign outgoing-document identity during the gap between a new
    // main-frame commit and delivery of that document's init-script record.
    const committedWithoutIdentity = transition && ['signin', 'reload'].includes(transition.type) &&
      transition.committedEvent !== undefined && transition.targetEpoch === undefined;
    const knownDocument = frame.mainFrame && trace.documentEpoch > 0 &&
      address(trace.documentUrl) === address(page.url()) && !committedWithoutIdentity;
    const entry = {id: ++trace.sequence, url: diagnosticUrl(request.url()), path: url.pathname, method: request.method(),
      resource: request.resourceType(), navigation: request.isNavigationRequest(), startedMs: Date.now() - started,
      startedEvent: trace.eventSequence + 1, documentEpoch: knownDocument ? trace.documentEpoch : null,
      documentTimeOrigin: knownDocument ? trace.documentTimeOrigin : null, ...frame};
    requests.set(request, entry);
    if (sameOriginApi && ['fetch', 'xhr'].includes(entry.resource)) {
      trace.pending.set(entry.id, entry);
      if (entry.method === 'GET') {trace.reads.push(entry); if (trace.reads.length > READ_LIMIT) trace.reads.shift();}
    }
    trace.log('request', {...entry});
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
    entry.finishedMs = Date.now() - started; entry.finishedEvent = trace.eventSequence + 1;
    if (event === 'requestfailed') entry.failure = safeText(request.failure()?.errorText || 'Unknown request failure');
    trace.pending.delete(entry.id);
    trace.log(event, {...entry});
  });
  page.on('framenavigated', frame => {
    const ms = Date.now() - started;
    const transition = trace.transitions.at(-1);
    if (frame === page.mainFrame() && transition && ['signin', 'reload'].includes(transition.type) && transition.committedEvent === undefined) {
      transition.committedEvent = trace.eventSequence + 1; transition.committedMs = ms;
    }
    trace.log('frame-navigated', {...frameInfo(frame), ms});
  });
  for (const event of ['frameattached', 'framedetached']) page.on(event, frame => trace.log(event, frameInfo(frame)));
  for (const event of ['domcontentloaded', 'load', 'close', 'crash']) page.on(event, () => trace.log('page-' + event, {pending: trace.snapshot().pending}));
  context.on('close', () => trace.log('context-close', {pending: trace.snapshot().pending}));
  page.on('console', message => {
    if (!message.text().startsWith(LIVE_LIFECYCLE_PREFIX)) return;
    try {
      const detail = JSON.parse(message.text().slice(LIVE_LIFECYCLE_PREFIX.length)), ms = Date.now() - started;
      if (detail.event === 'new-document' && Number.isFinite(detail.timeOrigin) && typeof detail.url === 'string' && detail.timeOrigin !== trace.documentTimeOrigin) {
        const previousEpoch = trace.documentEpoch;
        trace.documentEpoch++; trace.documentTimeOrigin = detail.timeOrigin; trace.documentUrl = diagnosticUrl(detail.url);
        const transition = trace.transitions.at(-1);
        if (transition?.sourceEpoch === previousEpoch && ['signin', 'reload'].includes(transition.type) && transition.targetEpoch === undefined) {
          transition.targetEpoch = trace.documentEpoch; transition.targetTimeOrigin = detail.timeOrigin;
          transition.documentStartedEvent = trace.eventSequence + 1; transition.documentStartedMs = ms;
        }
      }
      trace.log('document-lifecycle', {ms, event: safeText(detail.event, 80), url: diagnosticUrl(detail.url), timeOrigin: detail.timeOrigin,
        documentMs: detail.documentMs, readyState: safeText(detail.readyState, 40), persisted: detail.persisted,
        ...(Number.isSafeInteger(detail.request) ? {request: detail.request, ...(typeof detail.aborted === 'boolean' ? {aborted: detail.aborted} : {})} : {}),
        ...(detail.message === undefined ? {} : {message: safeText(detail.message), filename: diagnosticUrl(detail.filename), line: detail.line, column: detail.column}),
        ...(detail.stack === undefined ? {} : {stack: safeText(detail.stack, 4000)})});
      if (['window-error', 'unhandledrejection'].includes(detail.event)) trace.domErrors.push(trace.events.at(-1));
    } catch {trace.log('unreadable-lifecycle-record');}
  });
  page.on('pageerror', error => {
    const detail = {user: label, error: safeText(error.message), name: safeText(error.name, 100), stack: safeText(error.stack, 4000),
      ms: Date.now() - started, check: getCheck(), document: diagnosticUrl(page.url()), documentEpoch: trace.documentEpoch,
      documentTimeOrigin: trace.documentTimeOrigin, eventSequence: trace.eventSequence + 1, ...trace.snapshot()};
    errors.push(detail); trace.pageErrors.push(detail); // Preserve every original event; classify only after proven replacement readiness.
    trace.log('pageerror', {error: detail.error, name: detail.name, stack: detail.stack, ms: detail.ms});
    console.error('LIVE BROWSER ERROR', JSON.stringify(detail));
    console.log(liveFailureAnnotation(detail, trace).replace('::error title=', '::notice title='));
  });
  trace.log('observe-page', frameInfo(page.mainFrame()));
  return trace;
}
