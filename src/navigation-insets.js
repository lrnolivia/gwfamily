// Device geometry must not follow the user's Glass/Flat material choice.
// Keep this module independent of React so detection and viewport behavior can
// be tested without creating a browser or touching preview/production data.
export function mobileOS({userAgent = '', platform = '', maxTouchPoints = 0} = {}) {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS can request desktop websites and report the Mac user agent/platform.
  if ((/Macintosh|Mac OS X/i.test(userAgent) || platform === 'MacIntel') && maxTouchPoints > 1) return 'ios';
  return 'none';
}

export function displayMode(win = globalThis.window) {
  if (win?.matchMedia?.('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (win?.navigator?.standalone === true || win?.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  // minimal-ui still has browser chrome; do not pretend it is an installed app.
  return 'browser';
}

export function deviceContext(win = globalThis.window) {
  return {mobileOS: mobileOS(win?.navigator), displayMode: displayMode(win)};
}

export function isTextEntry(element) {
  if (!element || element.disabled || element.readOnly || element.inputMode === 'none') return false;
  if (element.isContentEditable) return true;
  if (element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT' && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/i.test(element.type || 'text');
}

export function keyboardIsOpen({mobileOS: os = 'none', editable = false, layoutHeight = 0,
  baselineHeight = layoutHeight, viewportHeight = layoutHeight, viewportTop = 0,
  viewportScale = 1, virtualKeyboardHeight = 0} = {}) {
  if (os === 'none' || !editable) return false;
  if (virtualKeyboardHeight > 0) return true;
  // Zoom and ordinary browser toolbar motion are not software keyboards.
  if (Math.abs(viewportScale - 1) > 0.05) return false;
  const threshold = Math.max(120, baselineHeight * 0.2);
  return Math.max(layoutHeight - viewportHeight - Math.max(0, viewportTop), baselineHeight - viewportHeight) > threshold;
}

// Reference geometry for unit/hosted-browser assertions. The browser itself
// resolves env() dynamically in CSS; there is no cached or guessed OS inset.
export function navigationInsetMetrics({mobileOS: os = 'none', displayMode: mode = 'browser',
  safeAreaBottom = 0, width = 390, material = 'ios'} = {}) {
  const safe = Math.max(0, Number(safeAreaBottom) || 0);
  if(material==='android'&&width<700)return {bottom:0,buttonBottom:safe+8,height:64+safe,fabBottom:76+safe,fabHeight:56};
  const gap = mode === 'browser' && width >= 700 ? 18 : os === 'none' ? 4 : os === 'ios' && mode === 'browser' ? 2 : 0;
  const bottom = Math.max(gap, safe - 7);
  return {bottom, buttonBottom: bottom + 7, height: 72,
    fabBottom: bottom + (width >= 700 ? 8 : 84), fabHeight: 56};
}

/** Mount once alongside useViewport; returned cleanup restores all owned state.
 * Does not change --vv-* or material/theme state. Safe-area values stay in CSS.
 */
export function bindNavigationInsets(win = globalThis.window, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!win || !root) return () => {};
  const keys = ['mobileOs', 'displayMode', 'keyboardOpen', 'inputMode'];
  const previous = Object.fromEntries(keys.map(key => [key, root.dataset[key]]));
  const removers = [];
  let baselineHeight = win.innerHeight || 0;
  let baselineWidth = win.innerWidth || 0;
  let frame = null;
  let disposed = false;
  const update = () => {
    frame = null;
    if (disposed) return;
    const context = deviceContext(win), viewport = win.visualViewport;
    const editable = isTextEntry(doc.activeElement);
    // Reset on rotation/layout-width changes, never on an OSK height resize.
    // Otherwise resizes-content keyboards become the new "closed" baseline.
    if (Math.abs((win.innerWidth || 0) - baselineWidth) > 80) {
      baselineHeight = win.innerHeight || 0;
      baselineWidth = win.innerWidth || 0;
    }
    if (!editable) baselineHeight = Math.max(win.innerHeight || 0, viewport?.height || 0);
    root.dataset.mobileOs = context.mobileOS;
    root.dataset.displayMode = context.displayMode;
    root.dataset.keyboardOpen = String(keyboardIsOpen({
      ...context, editable, baselineHeight, layoutHeight: win.innerHeight || 0,
      viewportHeight: viewport?.height ?? win.innerHeight ?? 0,
      viewportTop: viewport?.offsetTop || 0, viewportScale: viewport?.scale || 1,
      virtualKeyboardHeight: win.navigator?.virtualKeyboard?.boundingRect?.height || 0,
    }));
  };
  const schedule = () => {
    if (frame !== null || disposed) return;
    frame = win.requestAnimationFrame ? win.requestAnimationFrame(update) : win.setTimeout(update, 0);
  };
  const listen = (target, event) => {
    if (!target?.addEventListener) return;
    target.addEventListener(event, schedule);
    removers.push(() => target.removeEventListener(event, schedule));
  };
  for (const event of ['resize', 'orientationchange', 'pageshow', 'appinstalled']) listen(win, event);
  for (const event of ['resize', 'scroll']) listen(win.visualViewport, event);
  for (const event of ['focusin', 'focusout']) listen(doc, event);
  listen(win.navigator?.virtualKeyboard, 'geometrychange');
  for (const mode of ['standalone', 'fullscreen']) {
    const media = win.matchMedia?.(`(display-mode: ${mode})`);
    if (media?.addEventListener) listen(media, 'change');
    else if (media?.addListener) {
      media.addListener(schedule);
      removers.push(() => media.removeListener(schedule));
    }
  }
  // Safari may retain :focus-visible when script focus follows a mouse click.
  // Track the initiating input, including clicks delivered by assistive tools.
  const pointer = () => { root.dataset.inputMode = 'pointer'; };
  const key = event => { if (['Tab','Enter',' '].includes(event.key) || event.key.startsWith('Arrow')) root.dataset.inputMode = 'keyboard'; };
  const click = event => { if (event.detail > 0) pointer(); };
  for (const [event, handler] of [['pointerdown',pointer],['mousedown',pointer],['keydown',key],['click',click]]) {
    doc.addEventListener(event, handler, true);
    removers.push(() => doc.removeEventListener(event, handler, true));
  }
  root.dataset.inputMode = 'pointer';
  update();
  return () => {
    disposed = true;
    if (frame !== null) {
      if (win.cancelAnimationFrame) win.cancelAnimationFrame(frame);
      else win.clearTimeout(frame);
    }
    for (const remove of removers) remove();
    for (const key of keys) {
      if (previous[key] === undefined) delete root.dataset[key];
      else root.dataset[key] = previous[key];
    }
  };
}
