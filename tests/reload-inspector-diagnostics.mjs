// Shared, fail-closed evidence contract. A harness may use this only when it
// records every field; absence of a DOM event alone never proves this case.
export function classifyReloadInspectorError({engine, base, error, events, reads, transitions, domErrors}) {
  if (engine !== 'webkit' || !error || !Array.isArray(events) || !Array.isArray(reads) ||
      !Array.isArray(transitions) || !Array.isArray(domErrors) || domErrors.length) return null;
  const sequence = value => Number.isSafeInteger(value) && value > 0;
  const endpoint = base + '/api/notifications';
  const message = `Fetch API cannot load ${endpoint} due to access control checks.`;
  const stack = error.stack?.split('\n') || [];
  const appFrame = name => stack.some(line => line.trim().startsWith(`at ${name} (${base}/react-app.js:`) && /:\d+:\d+\)$/.test(line));
  if (`${error.name}:/${error.error}` !== message || stack[0] !== message ||
      !/^\s+at unknown \(web-inspector:\/\/bootstrap\.js:\d+:\d+\)$/.test(stack[1] || '') ||
      !appFrame('api') || !appFrame('notificationRequest') || !appFrame('list')) return null;
  if (!Number.isSafeInteger(error.documentEpoch) || error.documentEpoch < 1 || (!Number.isFinite(error.documentTimeOrigin) || error.documentTimeOrigin <= 0) ||
      !sequence(error.eventSequence) || !Array.isArray(error.pending) || error.pending.length) return null;
  const reload = transitions.find(value => value.type === 'reload' && value.sourceEpoch === error.documentEpoch &&
    value.sourceTimeOrigin === error.documentTimeOrigin && value.target === error.document &&
    [value.startedEvent, value.committedEvent, value.documentStartedEvent].every(sequence) &&
    value.startedEvent < error.eventSequence && value.committedEvent > error.eventSequence &&
    value.documentStartedEvent > error.eventSequence && value.targetEpoch === value.sourceEpoch + 1 &&
    Number.isFinite(value.targetTimeOrigin) && value.targetTimeOrigin > value.sourceTimeOrigin);
  if (!reload) return null;
  const sourceEvent = event => event.documentEpoch === error.documentEpoch && event.timeOrigin === error.documentTimeOrigin;
  const beforeunload = events.find(event => event.type === 'document-lifecycle' && event.event === 'beforeunload' && sourceEvent(event) &&
    event.url === base + '/' && sequence(event.eventSequence) && event.eventSequence > reload.startedEvent && event.eventSequence < error.eventSequence);
  const drain = events.find(event => event.type === 'route-reads-settled' && event.documentEpoch === error.documentEpoch &&
    event.documentTimeOrigin === error.documentTimeOrigin && event.document === error.document && sequence(event.through) &&
    event.eventSequence === reload.startedEvent - 1 && Array.isArray(event.pending) && !event.pending.length);
  const start = events.find(event => event.type === 'reload-start' && event.eventSequence === reload.startedEvent &&
    event.sourceEpoch === reload.sourceEpoch && event.sourceTimeOrigin === reload.sourceTimeOrigin &&
    event.documentEpoch === error.documentEpoch && event.documentTimeOrigin === error.documentTimeOrigin &&
    event.target === reload.target && event.ms === reload.startedMs &&
    Array.isArray(event.pending) && !event.pending.length);
  const commit = events.find(event => event.type === 'frame-navigated' && event.eventSequence === reload.committedEvent && event.mainFrame === true &&
    event.frameUrl === reload.target && event.ms === reload.committedMs);
  const replacement = events.find(event => event.type === 'document-lifecycle' && event.event === 'new-document' &&
    event.eventSequence === reload.documentStartedEvent && event.documentEpoch === reload.targetEpoch &&
    event.timeOrigin === reload.targetTimeOrigin && event.url === base + '/' && event.ms === reload.documentStartedMs);
  const ready = events.find(event => event.type === 'reload-ready' && event.documentEpoch === reload.targetEpoch && event.documentTimeOrigin === reload.targetTimeOrigin &&
    sequence(event.eventSequence) && event.eventSequence > Math.max(reload.committedEvent, reload.documentStartedEvent) && Array.isArray(event.pending) && !event.pending.length);
  const pageerror = events.find(event => event.type === 'pageerror' && event.eventSequence === error.eventSequence &&
    event.ms === error.ms && event.documentEpoch === error.documentEpoch && event.documentTimeOrigin === error.documentTimeOrigin &&
    event.document === error.document && event.name === error.name && event.error === error.error && event.stack === error.stack);
  if (!beforeunload || !drain || !start || !commit || !replacement || !ready || !pageerror) return null;
  const attempt = events.find(event => event.type === 'document-lifecycle' && event.event === 'notification-fetch-attempt' &&
    sourceEvent(event) && event.url === base + '/' && sequence(event.eventSequence) && sequence(event.request) && event.aborted === false &&
    event.eventSequence > beforeunload.eventSequence && event.eventSequence < error.eventSequence);
  if (!attempt) return null;
  const times = [drain.ms, reload.startedMs, beforeunload.ms, attempt.ms, error.ms];
  if (times.some((ms, index) => !Number.isFinite(ms) || ms < 0 || (index > 0 && ms < times[index - 1])) ||
      !Number.isFinite(reload.committedMs) || reload.committedMs < error.ms ||
      !Number.isFinite(reload.documentStartedMs) || reload.documentStartedMs < error.ms ||
      !Number.isFinite(ready.ms) || ready.ms < Math.max(reload.committedMs, reload.documentStartedMs)) return null;
  if (events.some(event => event.type === 'unreadable-lifecycle-record' ||
      (event.type === 'document-lifecycle' && ['window-error', 'unhandledrejection'].includes(event.event)))) return null;
  // The observed case never reached the network: a prior authenticated read
  // completed before teardown. Failed/cancelled/in-flight reads are not this case.
  const completedRead = read => sequence(read.id) && sequence(read.startedEvent) && sequence(read.finishedEvent) &&
    read.startedEvent < read.finishedEvent && Number.isFinite(read.startedMs) && Number.isFinite(read.finishedMs) &&
    read.startedMs >= 0 && read.startedMs <= read.finishedMs && read.method === 'GET' && read.mainFrame === true && !read.failure &&
    Number.isInteger(read.status) && read.status >= 200 && read.status < 300;
  if (reads.some(read => [reload.sourceEpoch, reload.targetEpoch].includes(read.documentEpoch) &&
      (!completedRead(read) || read.documentTimeOrigin !== (read.documentEpoch === reload.sourceEpoch ? reload.sourceTimeOrigin : reload.targetTimeOrigin)))) return null;
  // Commit/init delivery gaps carry unknown identity. They cannot bypass the
  // status/current-document checks merely because no epoch was assigned.
  if (reads.some(read => ((read.startedEvent >= reload.startedEvent && read.startedEvent < ready.eventSequence) ||
      (!sequence(read.startedEvent) && read.startedMs >= reload.startedMs && read.startedMs <= ready.ms)) &&
      (!completedRead(read) || read.documentEpoch !== reload.targetEpoch || read.documentTimeOrigin !== reload.targetTimeOrigin))) return null;
  const notifications = reads.filter(read => read.path === '/api/notifications' && read.documentEpoch === error.documentEpoch);
  if (!notifications.length || notifications.some(read => !completedRead(read) ||
      read.documentTimeOrigin !== error.documentTimeOrigin || read.finishedEvent >= reload.startedEvent ||
      read.finishedMs > reload.startedMs || !(read.id <= drain.through))) return null;
  if (reads.some(read => read.path === '/api/notifications' && read.startedEvent >= reload.startedEvent &&
      read.startedEvent <= error.eventSequence)) return null;
  const replacementReads = reads.filter(read => read.path === '/api/notifications' && read.documentEpoch === reload.targetEpoch);
  if (!replacementReads.length || replacementReads.some(read => !completedRead(read) ||
      read.documentTimeOrigin !== reload.targetTimeOrigin || read.startedEvent <= reload.documentStartedEvent ||
      read.startedMs < reload.documentStartedMs)) return null;
  const replacementRead = replacementReads.find(read => read.finishedEvent < ready.eventSequence && read.finishedMs <= ready.ms);
  if (!replacementRead) return null;
  return {kind: 'webkit-inspector-notification-reload-teardown', sourceEpoch: reload.sourceEpoch,
    sourceTimeOrigin: reload.sourceTimeOrigin, reloadStartedEvent: reload.startedEvent, beforeunloadEvent: beforeunload.eventSequence,
    fetchAttemptEvent: attempt.eventSequence, errorEvent: error.eventSequence, committedEvent: reload.committedEvent, targetEpoch: reload.targetEpoch,
    targetTimeOrigin: reload.targetTimeOrigin, replacementReadyEvent: ready.eventSequence,
    completedNotificationReads: notifications.map(read => read.id), replacementNotificationRead: replacementRead.id};
}

export function reportReloadInspectorErrors({engine, base, traces}) {
  const fatalErrors = [], classifiedInspectorErrors = [], domErrors = [];
  let pageErrorCount = 0;
  for (const trace of traces) {
    domErrors.push(...trace.domErrors);
    for (const error of trace.pageErrors) {
      pageErrorCount++;
      const evidence = classifyReloadInspectorError({...trace, engine, base, error});
      if (evidence) classifiedInspectorErrors.push({error, evidence});
      else fatalErrors.push(error);
    }
  }
  return {pageErrorCount, classifiedInspectorCount: classifiedInspectorErrors.length, fatalErrors, classifiedInspectorErrors, domErrors};
}
