import {viewportBounds} from './viewport-bounds.js';

const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const positive = value => Math.max(0, number(value));
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// Notifications must never cover their dismiss trigger or visible bottom
// navigation. If neither side fits the full inbox, use the larger side and
// scroll inside that height instead of covering either navigation control.
export function notificationPopoverGeometry({layoutWidth, layoutHeight, visualViewport,
  keyboardRect, safeArea = {}, anchor, bottomNavigationRect, width = 300, height = 300} = {}) {
  const viewport = viewportBounds({layoutWidth, layoutHeight, visualViewport});
  let bottom = viewport.top + viewport.height;
  if (positive(keyboardRect?.height) && keyboardRect.right > viewport.left &&
      keyboardRect.left < viewport.left + viewport.width && keyboardRect.top < bottom &&
      keyboardRect.bottom > viewport.top) bottom = Math.max(viewport.top, keyboardRect.top);
  const left = viewport.left + Math.max(12, positive(safeArea.left));
  const top = viewport.top + Math.max(12, positive(safeArea.top));
  const right = Math.max(left, viewport.left + viewport.width - Math.max(12, positive(safeArea.right)));
  bottom = Math.max(top, bottom - Math.max(12, positive(safeArea.bottom)));
  // The caller supplies only a visible navigation rectangle. Reserve its
  // measured top plus a gap, without adding its safe-area inset a second time.
  const nav = bottomNavigationRect;
  if (nav && nav.right > nav.left && nav.bottom > nav.top &&
      nav.right > viewport.left && nav.left < viewport.left + viewport.width &&
      nav.bottom > viewport.top && nav.top < viewport.top + viewport.height) {
    bottom = Math.max(top, Math.min(bottom, nav.top - 8));
  }
  const maxWidth = right - left, below = clamp(number(anchor?.bottom, top) + 8, top, bottom);
  const above = clamp(number(anchor?.top, top) - 8, top, bottom);
  const roomBelow = bottom - below, roomAbove = above - top;
  const desiredHeight = positive(height);
  const side = desiredHeight <= roomBelow ? 'below' : desiredHeight <= roomAbove ? 'above' :
    roomBelow >= roomAbove ? 'below' : 'above';
  const maxHeight = side === 'below' ? roomBelow : roomAbove;
  const fittedWidth = Math.min(positive(width), maxWidth), fittedHeight = Math.min(desiredHeight, maxHeight);
  const x = clamp(number(anchor?.left, left), left, right - fittedWidth);
  const y = side === 'below' ? below : above - fittedHeight;
  return {x, y, width: fittedWidth, height: fittedHeight, maxWidth, maxHeight, side,
    bounds: {left, top, right, bottom}};
}

// This binder owns only notification placement; native popover dismissal and
// React state continue to be managed by Popover. Only the notification body
// scrolls, keeping the Glass material layers fixed. Its scrollHeight still
// describes the full inbox after it is constrained or scrolled to its last item.
export function bindNotificationPopoverPlacement(el, anchor, onUnavailable,
  win = globalThis.window, doc = globalThis.document) {
  if (!el || !win || !doc) return () => {};
  const keys = ['left', 'top', 'max-width', 'max-height', 'transform-origin', '--notification-content-max-height'];
  const previous = keys.map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]);
  const removers = [];
  let disposed = false, frame = null, navigation = null;
  const place = () => {
    if (disposed || !el.matches(':popover-open')) return;
    const root = doc.documentElement, rect = anchor?.getBoundingClientRect?.();
    const viewport = viewportBounds({layoutWidth: root.clientWidth || win.innerWidth,
      layoutHeight: root.clientHeight || win.innerHeight, visualViewport: win.visualViewport});
    if (!anchor?.isConnected || !rect || rect.bottom <= viewport.top || rect.top >= viewport.top + viewport.height ||
        rect.right <= viewport.left || rect.left >= viewport.left + viewport.width) {onUnavailable?.(); return;}
    const computed = win.getComputedStyle(el);
    const safeArea = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side =>
      [side, parseFloat(computed.getPropertyValue('--notification-safe-' + side)) || 0]));
    const candidate = doc.querySelector?.('[aria-label="Main navigation"]');
    const nextNavigation = candidate?.isConnected ? candidate : null;
    if (nextNavigation !== navigation) {
      if (navigation) observer?.unobserve(navigation);
      navigation = nextNavigation;
      if (navigation) observer?.observe(navigation);
    }
    const navigationStyle = navigation && win.getComputedStyle(navigation);
    const bottomNavigationRect = navigation && !navigation.hidden && navigationStyle.display !== 'none' &&
      navigationStyle.visibility !== 'hidden' && navigationStyle.visibility !== 'collapse' ?
      navigation.getBoundingClientRect() : null;
    const options = {layoutWidth: root.clientWidth || win.innerWidth, layoutHeight: root.clientHeight || win.innerHeight,
      visualViewport: win.visualViewport, keyboardRect: win.navigator?.virtualKeyboard?.boundingRect,
      safeArea, anchor: rect, bottomNavigationRect};
    // Clamp width before measuring wrapping and natural height. CSS uses
    // max-content width, avoiding shrink-to-fit based on the previous x offset.
    const available = notificationPopoverGeometry(options);
    el.style.maxWidth = available.maxWidth + 'px';
    const borderHeight = positive(parseFloat(computed.borderTopWidth)) + positive(parseFloat(computed.borderBottomWidth));
    const chromeHeight = borderHeight + positive(parseFloat(computed.paddingTop)) + positive(parseFloat(computed.paddingBottom));
    const content = el.querySelector('.notification-panel'), contentStyle = content && win.getComputedStyle(content);
    const contentBorder = positive(parseFloat(contentStyle?.borderTopWidth)) + positive(parseFloat(contentStyle?.borderBottomWidth));
    const height = content ? Math.max(content.offsetHeight, content.scrollHeight + contentBorder) + chromeHeight : el.offsetHeight;
    const geometry = notificationPopoverGeometry({...options, width: el.offsetWidth, height});
    if (geometry.maxWidth <= 0 || geometry.maxHeight <= chromeHeight) {onUnavailable?.(); return;}
    el.style.left = geometry.x + 'px';
    el.style.top = geometry.y + 'px';
    el.style.maxHeight = geometry.maxHeight + 'px';
    el.style.setProperty('--notification-content-max-height', (geometry.maxHeight - chromeHeight) + 'px');
    el.style.transformOrigin = (rect.left + rect.width / 2 - geometry.x) + 'px ' +
      (rect.top + rect.height / 2 - geometry.y) + 'px';
  };
  const refresh = event => {
    // Scrolling the inbox must not alter its placement or scroll position.
    if (event?.type === 'scroll' && el.contains(event.target)) return;
    place();
    // WebKit can report VisualViewport one frame after a layout resize.
    if (frame === null && win.requestAnimationFrame) frame = win.requestAnimationFrame(() => {frame = null; place();});
  };
  const listen = (target, event, capture = false) => {
    if (!target?.addEventListener) return;
    target.addEventListener(event, refresh, capture);
    removers.push(() => target.removeEventListener(event, refresh, capture));
  };
  const observer = win.ResizeObserver ? new win.ResizeObserver(place) : null;
  for (const node of [el, anchor, el.querySelector('.notification-panel')]) if (node) observer?.observe(node);
  for (const event of ['resize', 'orientationchange', 'pageshow']) listen(win, event);
  listen(win, 'scroll', true);
  for (const event of ['resize', 'scroll']) listen(win.visualViewport, event);
  listen(win.navigator?.virtualKeyboard, 'geometrychange');
  place();
  return () => {
    disposed = true;
    if (frame !== null) win.cancelAnimationFrame?.(frame);
    observer?.disconnect();
    for (const remove of removers) remove();
    for (const [key, value, priority] of previous) {
      if (value) el.style.setProperty(key, value, priority);
      else el.style.removeProperty(key);
    }
  };
}
