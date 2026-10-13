// Exact, body-free provenance for an outgoing read cancelled by a deliberate
// reload. HTTP errors, current/unknown documents and unproven aborts stay fatal.
const sequence = value => Number.isSafeInteger(value) && value > 0;
const time = value => Number.isFinite(value) && value >= 0;
const address = value => {try {const url = new URL(value); return url.origin + url.pathname;} catch {return null;}};
const identity = (value, epoch, origin) => value?.documentEpoch === epoch && value?.documentTimeOrigin === origin;
const successful = read => read.method === 'GET' && read.mainFrame === true && sequence(read.frame) && read.detached === false &&
  read.navigation === false && ['fetch', 'xhr'].includes(read.resource) && sequence(read.id) &&
  sequence(read.startedEvent) && sequence(read.finishedEvent) && read.startedEvent < read.finishedEvent &&
  time(read.startedMs) && time(read.finishedMs) && read.startedMs <= read.finishedMs &&
  !read.failure && Number.isInteger(read.status) && read.status >= 200 && read.status < 300;

export function inspectReloadReadCancellation(read, trace) {
  const events = trace.events || [], transitions = trace.transitions || [], reads = trace.reads || [];
  const reload = transitions.findLast(value => value.type === 'reload' && value.sourceEpoch === read.documentEpoch &&
    value.sourceTimeOrigin === read.documentTimeOrigin);
  const eventAt = (type, eventSequence) => events.find(event => event.type === type && event.eventSequence === eventSequence);
  const drain = reload && eventAt('route-reads-settled', reload.drainedEvent);
  const start = reload && eventAt('reload-start', reload.startedEvent);
  const commit = reload && eventAt('frame-navigated', reload.committedEvent);
  const replacement = reload && eventAt('document-lifecycle', reload.documentStartedEvent);
  const request = eventAt('request', read.startedEvent), failure = eventAt('requestfailed', read.finishedEvent);
  const matchingReadEvent = (event, value = read) => event && event.id === value.id && event.path === value.path && event.url === value.url &&
    event.method === value.method && event.resource === value.resource && event.mainFrame === true &&
    event.frame === value.frame && event.frameUrl === value.frameUrl && identity(event, value.documentEpoch, value.documentTimeOrigin);
  const beforeunload = reload && events.find(event => event.type === 'document-lifecycle' && event.event === 'beforeunload' &&
    event.documentEpoch === reload.sourceEpoch && event.timeOrigin === reload.sourceTimeOrigin && event.url === address(reload.target) &&
    sequence(event.eventSequence) && event.eventSequence > reload.startedEvent && event.eventSequence < read.finishedEvent &&
    event.eventSequence < Math.min(reload.committedEvent, reload.documentStartedEvent) &&
    time(event.ms) && event.ms >= reload.startedMs && event.ms <= read.finishedMs);
  const replacementRead = reload && reads.find(value => value.path === read.path && successful(value) &&
    identity(value, reload.targetEpoch, reload.targetTimeOrigin) && value.frame === read.frame && value.frameUrl === reload.target && value.url === read.url &&
    value.startedEvent > Math.max(reload.committedEvent, reload.documentStartedEvent) &&
    value.startedMs >= Math.max(reload.committedMs, reload.documentStartedMs) &&
    events.some(event => event.type === 'request' && event.eventSequence === value.startedEvent && matchingReadEvent(event, value) && event.ms === value.startedMs) &&
    events.some(event => event.type === 'requestfinished' && event.eventSequence === value.finishedEvent && matchingReadEvent(event, value) &&
      identity(event, value.documentEpoch, value.documentTimeOrigin) && event.ms === value.finishedMs && event.status === value.status && !event.failure));
  const checks = {
    cancellation: ['Load request cancelled', 'net::ERR_ABORTED'].includes(read.failure),
    nonErrorStatus: read.status === undefined || (Number.isInteger(read.status) && read.status >= 200 && read.status < 300),
    mainFrameGet: read.method === 'GET' && read.mainFrame === true && sequence(read.frame) && read.detached === false && read.navigation === false && ['fetch', 'xhr'].includes(read.resource),
    readIdentity: sequence(read.documentEpoch) && Number.isFinite(read.documentTimeOrigin) && read.documentTimeOrigin > 0,
    readOrdering: sequence(read.id) && sequence(read.startedEvent) && sequence(read.finishedEvent) && read.startedEvent < read.finishedEvent &&
      time(read.startedMs) && time(read.finishedMs) && read.startedMs <= read.finishedMs,
    requestRecord: !!matchingReadEvent(request) && request.ms === read.startedMs && request.startedMs === read.startedMs,
    failureRecord: !!matchingReadEvent(failure) && failure.ms === read.finishedMs && failure.finishedMs === read.finishedMs &&
      failure.failure === read.failure && failure.status === read.status,
    explicitReload: !!reload && [reload.startedEvent, reload.committedEvent, reload.documentStartedEvent].every(sequence) &&
      [reload.startedMs, reload.committedMs, reload.documentStartedMs].every(time) &&
      reload.startedEvent < Math.min(reload.committedEvent, reload.documentStartedEvent) &&
      reload.startedMs <= Math.min(reload.committedMs, reload.documentStartedMs),
    outgoingIdentity: !!reload && reload.targetEpoch === reload.sourceEpoch + 1 && reload.targetEpoch === trace.documentEpoch &&
      reload.targetTimeOrigin === trace.documentTimeOrigin && Number.isFinite(reload.targetTimeOrigin) && reload.targetTimeOrigin > reload.sourceTimeOrigin,
    matchingTarget: !!reload && reload.target === read.frameUrl && start?.target === reload.target && commit?.frameUrl === reload.target,
    reloadRecord: !!reload && !!start && start.ms === reload.startedMs && start.startedEvent === reload.startedEvent &&
      start.drainedEvent === reload.drainedEvent && start.sourceEpoch === reload.sourceEpoch && start.sourceTimeOrigin === reload.sourceTimeOrigin &&
      identity(start, read.documentEpoch, read.documentTimeOrigin) && Array.isArray(start.pending),
    drainRecord: !!drain && sequence(reload.drainedEvent) && drain.eventSequence < reload.startedEvent && identity(drain, read.documentEpoch, read.documentTimeOrigin) &&
      Number.isSafeInteger(drain.through) && drain.through >= 0 && read.id > drain.through &&
      time(drain.ms) && drain.ms <= reload.startedMs && Array.isArray(drain.pending) &&
      (read.startedEvent > drain.eventSequence || drain.pending.some(value => value.id === read.id && identity(value, read.documentEpoch, read.documentTimeOrigin))),
    commitRecord: !!reload && !!commit && commit.mainFrame === true && commit.frame === read.frame && commit.ms === reload.committedMs,
    replacementRecord: !!reload && !!replacement && replacement.event === 'new-document' &&
      replacement.documentEpoch === reload.targetEpoch && replacement.timeOrigin === reload.targetTimeOrigin &&
      replacement.url === address(reload.target) && replacement.url === address(trace.documentUrl) &&
      replacement.ms === reload.documentStartedMs,
    beforeunloadRecord: !!beforeunload,
    readBeforeReplacement: !!reload && read.startedEvent < Math.min(reload.committedEvent, reload.documentStartedEvent) &&
      read.startedMs <= Math.min(reload.committedMs, reload.documentStartedMs),
    failureAfterReload: !!reload && read.finishedEvent > reload.startedEvent && read.finishedMs >= reload.startedMs,
    replacementRead: !!replacementRead,
    readableLifecycle: !events.some(event => event.type === 'unreadable-lifecycle-record'),
  };
  return {checks, reload, beforeunloadEvent: beforeunload?.eventSequence, replacementRead: replacementRead?.id};
}

export function classifyReloadReadCancellation(read, trace) {
  const result = inspectReloadReadCancellation(read, trace);
  if (!Object.values(result.checks).every(Boolean)) return null;
  return {kind: 'explicit-reload-outgoing-read-cancelled', read: read.id,
    sourceEpoch: read.documentEpoch, sourceTimeOrigin: read.documentTimeOrigin,
    reloadStartedEvent: result.reload.startedEvent, beforeunloadEvent: result.beforeunloadEvent,
    committedEvent: result.reload.committedEvent, documentStartedEvent: result.reload.documentStartedEvent,
    targetEpoch: result.reload.targetEpoch, targetTimeOrigin: result.reload.targetTimeOrigin,
    replacementRead: result.replacementRead};
}

// This is only a reason to keep polling, never a passing classification.
export function isPendingReloadReadCancellation(read, trace) {
  const {checks} = inspectReloadReadCancellation(read, trace);
  return checks.replacementRead === false && Object.entries(checks).every(([key, value]) => key === 'replacementRead' || value);
}
