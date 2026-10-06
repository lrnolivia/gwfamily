// Body-free, bounded diagnostics for the hosted communications harness. This
// module has no Playwright dependency and its event contracts run in Node.
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
  const emit = (event, detail = {}) => console.log('__GW_COMMUNICATIONS_LIFECYCLE__' + JSON.stringify({
    event, timeOrigin: performance.timeOrigin, documentMs: performance.now(), readyState: document.readyState, ...detail,
  }));
  emit('new-document');
  for (const event of ['beforeunload', 'pagehide', 'pageshow']) addEventListener(event, value => emit(event, {persisted: !!value.persisted}));
  // Observation only: never preventDefault or otherwise consume an exception.
  addEventListener('error', event => emit('window-error', {message: event.message, filename: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack}));
  addEventListener('unhandledrejection', event => emit('unhandledrejection', {message: String(event.reason?.message || event.reason), stack: event.reason?.stack}));
}
export function observeCommunicationsPage({page, context, label, base, errors, getCheck, started = Date.now()}) {
  const trace = {sequence: 0, document: 0, lastDrained: 0, events: [], droppedEvents: 0, reads: [], pending: new Map()};
  const requests = new WeakMap(), frames = new WeakMap();
  let frameSequence = 0;
  const frameInfo = frame => {
    if (!frame) return {frame: null};
    if (!frames.has(frame)) frames.set(frame, ++frameSequence);
    return {frame: frames.get(frame), mainFrame: frame === page.mainFrame(), frameUrl: diagnosticUrl(frame.url()), detached: frame.isDetached?.() || false};
  };
  trace.log = (type, detail = {}) => {
    trace.events.push({ms: Date.now() - started, check: getCheck(), context: label, document: trace.document, documentUrl: diagnosticUrl(page.url()), type, ...detail});
    if (trace.events.length > EVENT_LIMIT) {trace.events.shift(); trace.droppedEvents++;}
  };
  trace.snapshot = () => ({pending: [...trace.pending.values()].map(entry => ({...entry})), recentEvents: trace.events.slice(-30)});
  trace.readiness = ({since = trace.lastDrained, required = []} = {}) => ({
    missing: required.filter(path => !trace.reads.some(read => read.id > since && read.path === path && read.finishedMs !== undefined)),
    pending: [...trace.pending.values()].map(({id, path, method}) => ({id, path, method})),
  });
  trace.requiredReadFailures = ({since = trace.lastDrained, required = []} = {}) => trace.reads
    .filter(read => read.id > since && required.includes(read.path) && (read.failure || !(read.status >= 200 && read.status < 300)))
    .map(read => ({...read}));
  page.on('request', request => {
    const url = new URL(request.url()), sameOriginApi = url.origin === base && url.pathname.startsWith('/api/');
    if (!sameOriginApi && !request.isNavigationRequest()) return;
    let frame;
    try {frame = frameInfo(request.frame());} catch {frame = {frame: null, frameUnavailable: true};}
    const entry = {id: ++trace.sequence, url: diagnosticUrl(request.url()), path: url.pathname, method: request.method(), resource: request.resourceType(), navigation: request.isNavigationRequest(), startedMs: Date.now() - started, startedDocument: trace.document, ...frame};
    requests.set(request, entry);
    if (sameOriginApi && ['fetch', 'xhr'].includes(entry.resource)) {
      trace.pending.set(entry.id, entry);
      if (entry.method === 'GET') {
        trace.reads.push(entry);
        if (trace.reads.length > READ_LIMIT) trace.reads.shift();
      }
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
    entry.finishedMs = Date.now() - started;
    if (event === 'requestfailed') entry.failure = diagnosticText(request.failure()?.errorText || 'Unknown request failure');
    trace.pending.delete(entry.id);
    trace.log(event, {...entry});
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) trace.document++;
    trace.log('frame-navigated', frameInfo(frame));
  });
  for (const event of ['frameattached', 'framedetached']) page.on(event, frame => trace.log(event, frameInfo(frame)));
  for (const event of ['domcontentloaded', 'load', 'close', 'crash']) page.on(event, () => trace.log('page-' + event, {pendingCount: trace.pending.size}));
  context.on('close', () => trace.log('context-close', {pendingCount: trace.pending.size}));
  page.on('console', message => {
    if (!message.text().startsWith(COMMUNICATIONS_LIFECYCLE_PREFIX)) return;
    try {
      const detail = JSON.parse(message.text().slice(COMMUNICATIONS_LIFECYCLE_PREFIX.length));
      // Do not copy arbitrary console records, bodies or application state.
      trace.log('document-lifecycle', {
        event: diagnosticText(detail.event, 80), timeOrigin: detail.timeOrigin, documentMs: detail.documentMs,
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
