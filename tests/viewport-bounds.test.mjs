import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {viewportBounds, bindViewportBounds} from '../src/viewport-bounds.js';

function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const listener of listeners.get(type) || []) listener(); },
    listenerCount() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
  });
}

function environment() {
  const properties = new Map(), frames = new Map();
  let frameId = 0;
  const root = {clientWidth: 390, clientHeight: 844, dataset: {platform: 'ios', keyboardOpen: 'false'}, style: {
    getPropertyValue(key) { return properties.get(key)?.value || ''; },
    getPropertyPriority(key) { return properties.get(key)?.priority || ''; },
    setProperty(key, value, priority = '') { properties.set(key, {value, priority}); },
    removeProperty(key) { properties.delete(key); },
  }};
  const win = events({innerWidth: 390, innerHeight: 844,
    visualViewport: events({width: 390, height: 844, offsetLeft: 0, offsetTop: 0, scale: 1}),
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
  });
  const read = () => Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, parseFloat(root.style.getPropertyValue('--vv-' + key))]));
  return {win, doc: {documentElement: root}, root, properties, frames, read};
}

test('stale WebKit 390px visual viewport is clamped to the new 320px layout', () => {
  assert.deepEqual(viewportBounds({layoutWidth: 320, layoutHeight: 430,
    visualViewport: {width: 390, height: 844, offsetLeft: 70, offsetTop: 120}}),
  {left: 0, top: 0, width: 320, height: 430});
});

test('320px, 390px, tablet and rotated layouts cannot retain an oversized visible rectangle', () => {
  for (const [layoutWidth, layoutHeight] of [[320, 844], [390, 844], [768, 1024], [844, 390]]) {
    const bounds = viewportBounds({layoutWidth, layoutHeight,
      visualViewport: {width: 1024, height: 1024, offsetLeft: 200, offsetTop: 200}});
    assert.deepEqual(bounds, {left: 0, top: 0, width: layoutWidth, height: layoutHeight});
  }
});

test('visual-only keyboard shrinking and pinch-zoom offsets remain in CSS pixel coordinates', () => {
  assert.deepEqual(viewportBounds({layoutWidth: 390, layoutHeight: 844,
    visualViewport: {width: 390, height: 430, offsetLeft: 0, offsetTop: 140, scale: 1}}),
  {left: 0, top: 140, width: 390, height: 430});
  assert.deepEqual(viewportBounds({layoutWidth: 390, layoutHeight: 844,
    visualViewport: {width: 195, height: 422, offsetLeft: 97.5, offsetTop: 150.5, scale: 2}}),
  {left: 97.5, top: 150.5, width: 195, height: 422});
});

test('clamping handles rubber-band and obsolete pan offsets without expanding a zoomed view', () => {
  const options = {layoutWidth: 320, layoutHeight: 430};
  assert.deepEqual(viewportBounds({...options, visualViewport: {width: 200, height: 300, offsetLeft: 190, offsetTop: 300}}),
    {left: 120, top: 130, width: 200, height: 300});
  assert.deepEqual(viewportBounds({...options, visualViewport: {width: 200, height: 300, offsetLeft: -12, offsetTop: -24}}),
    {left: 0, top: 0, width: 200, height: 300});
});

test('absent and nonfinite visual viewport samples use current layout dimensions', () => {
  const expected = {left: 0, top: 0, width: 390, height: 844};
  for (const visualViewport of [undefined, {}, {width: 0, height: -1, offsetLeft: NaN, offsetTop: Infinity}, {width: Infinity, height: NaN}]) {
    assert.deepEqual(viewportBounds({layoutWidth: 390, layoutHeight: 844, visualViewport}), expected);
  }
});

test('resize clamps immediately and the next frame rereads delayed VisualViewport updates', () => {
  const {win, doc, root, frames, read} = environment();
  const cleanup = bindViewportBounds(win, doc);
  root.clientWidth = win.innerWidth = 320;
  root.clientHeight = win.innerHeight = 430;
  win.emit('resize');
  assert.deepEqual(read(), {left: 0, top: 0, width: 320, height: 430}, 'no frame or visual event is needed to clamp the stale sample');
  assert.equal(frames.size, 1);
  Object.assign(win.visualViewport, {width: 320, height: 280, offsetTop: 60});
  win.flush();
  assert.deepEqual(read(), {left: 0, top: 60, width: 320, height: 280});
  cleanup();
});

test('rotation, history restore, keyboard and zoom-pan events refresh the same viewport contract', () => {
  const {win, doc, root, read, frames} = environment();
  const cleanup = bindViewportBounds(win, doc);
  root.clientWidth = win.innerWidth = 844;
  root.clientHeight = win.innerHeight = 390;
  Object.assign(win.visualViewport, {width: 844, height: 390});
  win.emit('orientationchange');
  assert.deepEqual(read(), {left: 0, top: 0, width: 844, height: 390});
  Object.assign(win.visualViewport, {width: 400, height: 200, offsetLeft: 200, offsetTop: 80, scale: 2});
  win.visualViewport.emit('resize');
  win.visualViewport.offsetLeft = 220;
  win.visualViewport.emit('scroll');
  assert.deepEqual(read(), {left: 220, top: 80, width: 400, height: 200});
  assert.equal(frames.size, 1, 'event bursts share a single frame reread');
  Object.assign(win.visualViewport, {width: 844, height: 390, offsetLeft: 0, offsetTop: 0, scale: 1});
  win.emit('pageshow');
  assert.deepEqual(read(), {left: 0, top: 0, width: 844, height: 390});
  assert.deepEqual(root.dataset, {platform: 'ios', keyboardOpen: 'false'}, 'material and navigation-inset state are not owned here');
  cleanup();
});

test('no VisualViewport support still tracks the layout viewport', () => {
  const {win, doc, root, read} = environment();
  delete win.visualViewport;
  const cleanup = bindViewportBounds(win, doc);
  root.clientWidth = win.innerWidth = 768;
  win.emit('resize');
  assert.deepEqual(read(), {left: 0, top: 0, width: 768, height: 844});
  cleanup();
});

test('cleanup restores owned custom properties and cancels all listeners and scheduled work', () => {
  const {win, doc, root, properties, frames} = environment();
  root.style.setProperty('--vv-width', '75vw', 'important');
  root.style.setProperty('--gw-safe-bottom', '34px');
  const before = [...properties];
  const cleanup = bindViewportBounds(win, doc);
  win.emit('resize');
  cleanup();
  assert.equal(frames.size, 0);
  assert.equal(win.listenerCount() + win.visualViewport.listenerCount(), 0);
  assert.deepEqual([...properties], before);
  win.flush();
  assert.deepEqual([...properties], before);
});

test('useViewport keeps its hook contract and the composer independently bounds stale CSS dimensions', () => {
  const ui = readFileSync(new URL('../src/ui-core.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/messaging.css', import.meta.url), 'utf8');
  assert.match(ui, /export function useViewport\(\)\{\s*useEffect\(\(\)=>bindViewportBounds\(\),\[\]\)/);
  assert.match(css, /--message-vv-width:min\(var\(--vv-width,100vw\),100vw\)/);
  assert.match(css, /--message-vv-height:min\(var\(--vv-height,100dvh\),100dvh\)/);
  assert.match(css, /--message-vv-left:clamp\(0px,var\(--vv-left,0px\),calc\(100vw - var\(--message-vv-width\)\)\)/);
  assert.match(css, /--message-vv-top:clamp\(0px,var\(--vv-top,0px\),calc\(100dvh - var\(--message-vv-height\)\)\)/);
  assert.match(css, /left:calc\(var\(--message-vv-left\) \+ var\(--message-vv-width\)\/2\)/);
  assert.match(css, /\.message-writing textarea\{box-sizing:border-box;min-width:0;max-width:100%/);
});

test('server-side/no-document binding is harmless', () => {
  assert.doesNotThrow(() => bindViewportBounds(undefined, undefined)());
});
