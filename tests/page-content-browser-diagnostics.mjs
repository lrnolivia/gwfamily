// CMS-only notification evidence. No browser dependency or application changes.
import {liveFailureAnnotation} from './live-browser-diagnostics.mjs';

export function cmsFailureAnnotation(detail, trace) {
  // Reuse the bounded, query-free annotation format while preserving the CMS
  // harness's stricter, independent navigation/cancellation classification.
  return liveFailureAnnotation(detail, {...trace, transitions: trace.navigations.map(navigation => ({
    ...navigation, type: 'navigation', committedMs: navigation.frameNavigatedMs,
  }))}).replace('::error title=GW live request failure::', '::error title=GW CMS request failure::');
}

export function installCmsNotificationTrace() {
  if (window !== window.top) return;
  const emit = (event, detail) => console.log('__GW_CMS_LIFECYCLE__' + JSON.stringify({
    event, url: location.href, timeOrigin: performance.timeOrigin,
    documentMs: performance.now(), readyState: document.readyState, ...detail,
  }));
  const fetch = window.fetch;
  let request = 0;
  window.fetch = function(input, options) {
    const promise = fetch.apply(this, arguments);
    let url;
    // Keep native malformed-input behavior and the exact native promise. No
    // chaining or rejection handling that could consume browser error evidence.
    try {url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);} catch {return promise;}
    if (url.origin === location.origin && url.pathname === '/api/notifications') {
      const id = ++request, signal = options?.signal || input?.signal;
      emit('notification-fetch', {request: id, aborted: !!signal?.aborted});
      signal?.addEventListener('abort', () => emit('notification-abort', {request: id, aborted: true,
        stack: new Error('Notification AbortSignal fired').stack}), {once: true});
    }
    return promise;
  };
}
