// VisualViewport can lag the layout viewport during a WebKit resize/rotation.
// Clamp both the size and origin so an older sample cannot extend past it.
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const offset = (value, available) => Math.max(0, Math.min(Number.isFinite(value) ? value : 0, available));

export function viewportBounds({layoutWidth, layoutHeight, visualViewport} = {}) {
  const layoutW = positive(layoutWidth, positive(visualViewport?.width, 1));
  const layoutH = positive(layoutHeight, positive(visualViewport?.height, 1));
  const width = Math.min(layoutW, positive(visualViewport?.width, layoutW));
  const height = Math.min(layoutH, positive(visualViewport?.height, layoutH));
  return {left: offset(visualViewport?.offsetLeft, layoutW - width),
    top: offset(visualViewport?.offsetTop, layoutH - height), width, height};
}

// Own only --vv-*; keyboard detection, safe-area insets and materials belong to
// their existing binders. This also keeps the Sheet/Popover viewport contract.
export function bindViewportBounds(win = globalThis.window, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!win || !root) return () => {};
  const keys = ['left', 'top', 'width', 'height'];
  const previous = keys.map(key => [key, root.style.getPropertyValue('--vv-' + key), root.style.getPropertyPriority('--vv-' + key)]);
  const removers = [];
  let frame = null, disposed = false;
  const update = () => {
    if (disposed) return;
    const bounds = viewportBounds({
      layoutWidth: positive(root.clientWidth, win.innerWidth),
      layoutHeight: positive(root.clientHeight, win.innerHeight),
      visualViewport: win.visualViewport,
    });
    for (const key of keys) root.style.setProperty('--vv-' + key, bounds[key] + 'px');
  };
  const refresh = () => {
    // Apply the clamped sample immediately, then reread on the next rendering
    // opportunity: some engines expose the new VisualViewport after resize.
    update();
    if (frame === null && win.requestAnimationFrame) frame = win.requestAnimationFrame(() => {frame = null; update();});
  };
  const listen = (target, event) => {
    if (!target?.addEventListener) return;
    target.addEventListener(event, refresh);
    removers.push(() => target.removeEventListener(event, refresh));
  };
  for (const event of ['resize', 'orientationchange', 'pageshow']) listen(win, event);
  for (const event of ['resize', 'scroll']) listen(win.visualViewport, event);
  update();
  return () => {
    disposed = true;
    if (frame !== null) win.cancelAnimationFrame?.(frame);
    for (const remove of removers) remove();
    for (const [key, value, priority] of previous) {
      if (value) root.style.setProperty('--vv-' + key, value, priority);
      else root.style.removeProperty('--vv-' + key);
    }
  };
}
