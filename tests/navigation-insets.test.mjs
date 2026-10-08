import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mobileOS, displayMode, deviceContext, isTextEntry, keyboardIsOpen,
  navigationInsetMetrics, bindNavigationInsets} from '../src/navigation-insets.js';

const iphone = {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5};
const ipad = {userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5};
const android = {userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9)', platform: 'Linux armv8l', maxTouchPoints: 5};
const mac = {...ipad, maxTouchPoints: 0};
const css = readFileSync(new URL('../src/navigation-insets.css', import.meta.url), 'utf8');

function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type,event={}) { for (const listener of listeners.get(type) || []) listener(event); },
    listenerCount() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
  });
}
function environment(navigator = iphone) {
  const media = new Map(), frames = new Map();
  let frameId = 0;
  const win = events({
    navigator: {...navigator}, innerWidth: 390, innerHeight: 844,
    visualViewport: events({height: 844, width: 390, offsetTop: 0, scale: 1}),
    matchMedia(query) {
      if (!media.has(query)) media.set(query, events({matches: false}));
      return media.get(query);
    },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    flush() {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback();
    },
  });
  const doc = events({documentElement: {dataset: {}}, activeElement: null});
  return {win, doc, media, frames};
}

test('real mobile OS detection distinguishes desktop Mac from iPad desktop-mode UA', () => {
  for (const nav of [iphone, ipad, {...iphone, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'}, {...iphone, userAgent: 'iPod'}]) assert.equal(mobileOS(nav), 'ios');
  assert.equal(mobileOS(android), 'android');
  assert.equal(mobileOS({...android, maxTouchPoints: 0}), 'android');
  assert.equal(mobileOS(mac), 'none');
  assert.equal(mobileOS({...mac, maxTouchPoints: 1}), 'none');
  assert.equal(mobileOS({userAgent: 'Windows NT 10.0', maxTouchPoints: 10}), 'none');
  assert.equal(mobileOS(), 'none');
});

test('display mode uses standalone/fullscreen signals, not screen size or installed event alone', () => {
  const {win} = environment();
  assert.equal(displayMode(win), 'browser');
  win.matchMedia('(display-mode: minimal-ui)').matches = true;
  assert.equal(displayMode(win), 'browser');
  win.navigator.standalone = true;
  assert.equal(displayMode(win), 'standalone');
  win.navigator.standalone = false;
  win.matchMedia('(display-mode: standalone)').matches = true;
  assert.equal(displayMode(win), 'standalone');
  win.matchMedia('(display-mode: fullscreen)').matches = true;
  assert.equal(displayMode(win), 'fullscreen');
  assert.deepEqual(deviceContext(win), {mobileOS: 'ios', displayMode: 'fullscreen'});
  assert.equal(displayMode(undefined), 'browser');
});

test('device and display mode are independent of selected material and theme', () => {
  for (const material of ['ios', 'android']) for (const theme of ['light', 'dark']) {
    const {win, doc} = environment(android);
    Object.assign(doc.documentElement.dataset, {platform: material, theme, deviceOs: 'android'});
    const cleanup = bindNavigationInsets(win, doc);
    assert.equal(doc.documentElement.dataset.mobileOs, 'android');
    assert.equal(doc.documentElement.dataset.platform, material);
    assert.equal(doc.documentElement.dataset.theme, theme);
    assert.equal(doc.documentElement.dataset.deviceOs, 'android');
    cleanup();
  }
  assert.match(css, /data-platform=android/); // Geometry differs by material; OS detection does not.
});

test('390px, 768px and landscape geometry consumes the safe-area inset once in either material', () => {
  for (const width of [390, 699, 700, 768, 667, 844, 1280]) for (const os of ['ios', 'android', 'none']) {
    for (const mode of ['browser', 'standalone', 'fullscreen']) for (const safe of [0, 21, 24, 34]) {
      const options = {width, mobileOS: os, displayMode: mode, safeAreaBottom: safe};
      const glass = navigationInsetMetrics({...options, material: 'ios'});
      const flat = navigationInsetMetrics({...options, material: 'android'});
      if(width>=700){assert.equal(flat.layout,'rail');assert.equal(flat.railWidth,96);assert.equal(flat.top,44);assert.equal(flat.buttonBottom,safe+12);
        if(os==='android')assert.equal(flat.fabBottom,Math.max(24,safe+12));
        else assert.equal(flat.fabBottom,undefined,'desktop and iOS Flat keep header-adjacent Post');}
      else {assert.equal(flat.bottom,0);assert.equal(flat.height,64+safe);assert.equal(flat.buttonBottom,safe+8);assert.equal(flat.fabBottom-flat.height,12);}
      assert.ok(glass.bottom >= 0);
      assert.ok(glass.buttonBottom >= safe, 'every button stays above the home-indicator inset');
      const chosenGap=mode==='browser'&&width>=700?18:os==='none'?4:os==='ios'&&mode==='browser'?2:0;assert.equal(glass.bottom,Math.max(chosenGap,safe-7),'single hardware inset plus explicit regular-browser wide-screen lift');
      if (mode!=='browser'&&safe>=7) assert.equal(glass.bottom,safe-7,'installed PWA geometry remains unchanged');
      if (width >= 700) assert.equal(glass.fabBottom + glass.fabHeight / 2, glass.bottom + glass.height / 2);
      else assert.equal(glass.fabBottom - glass.bottom - glass.height, 12);
    }
  }
});

test('zero-inset browser chrome does not create a phantom hardware inset', () => {
  assert.equal(navigationInsetMetrics({mobileOS: 'ios'}).bottom, 2);
  assert.equal(navigationInsetMetrics({mobileOS: 'ios', displayMode: 'standalone'}).bottom, 0);
  assert.equal(navigationInsetMetrics({mobileOS: 'android'}).bottom, 0);
  assert.equal(navigationInsetMetrics({mobileOS: 'none'}).bottom, 4);
  assert.equal(navigationInsetMetrics({mobileOS: 'android', safeAreaBottom: -10}).bottom, 0);
  assert.equal(navigationInsetMetrics({mobileOS: 'android', safeAreaBottom: NaN}).bottom, 0);
});

test('CSS shares dock/FAB geometry and protects landscape edges', () => {
  assert.match(css, /--gw-nav-bottom:\s*max\(var\(--gw-nav-edge-gap\), calc\(var\(--gw-safe-bottom\) - 7px\)\)/);
  assert.match(css, /--gw-nav-height:\s*72px/);
  assert.match(css, /--gw-nav-fab-bottom:\s*calc\(var\(--gw-nav-bottom\) \+ var\(--gw-nav-height\) \+ 12px\)/);
  assert.match(css, /@media \(min-width: 700px\)[\s\S]*--gw-nav-fab-bottom:\s*calc\(var\(--gw-nav-bottom\) \+ 8px\)/);
  assert.equal((css.match(/env\(safe-area-inset-bottom/g) || []).length, 1);
  assert.match(css, /height:\s*var\(--gw-nav-height\);\s*padding:\s*7px/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /--gw-nav-side-clearance:\s*max\(12px, var\(--gw-safe-left\), var\(--gw-safe-right\)\)/);
  assert.match(css, /100vw - var\(--gw-nav-side-clearance\) - var\(--gw-nav-side-clearance\)/);
  assert.doesNotMatch(css, /--vv-(?:height|top|width|left)\s*:/);
  assert.doesNotMatch(css, /\.message-compose-area|\.conversation-composer/);
});

test('only editable controls can trigger keyboard treatment', () => {
  for (const type of ['text', 'email', 'number', 'password', 'tel', 'search', 'url']) assert.equal(isTextEntry({tagName: 'INPUT', type}), true);
  for (const type of ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']) assert.equal(isTextEntry({tagName: 'INPUT', type}), false);
  assert.equal(isTextEntry({tagName: 'TEXTAREA'}), true);
  assert.equal(isTextEntry({isContentEditable: true}), true);
  assert.equal(isTextEntry({tagName: 'INPUT', disabled: true}), false);
  assert.equal(isTextEntry({tagName: 'TEXTAREA', readOnly: true}), false);
  assert.equal(isTextEntry({tagName: 'INPUT', inputMode: 'none'}), false);
  assert.equal(isTextEntry(null), false);
});

test('keyboard signal excludes browser toolbar motion, hardware keyboards and pinch zoom', () => {
  const input = {mobileOS: 'ios', editable: true, baselineHeight: 844, layoutHeight: 844};
  assert.equal(keyboardIsOpen({...input, viewportHeight: 500}), true);
  assert.equal(keyboardIsOpen({...input, viewportHeight: 500, viewportTop: 160}), true);
  assert.equal(keyboardIsOpen({...input, viewportHeight: 500, editable: false}), false);
  assert.equal(keyboardIsOpen({...input, viewportHeight: 744}), false);
  assert.equal(keyboardIsOpen({...input, viewportHeight: 844}), false);
  assert.equal(keyboardIsOpen({...input, viewportHeight: 422, viewportScale: 2}), false);
  assert.equal(keyboardIsOpen({...input, mobileOS: 'none', viewportHeight: 500}), false);
  assert.equal(keyboardIsOpen({...input, virtualKeyboardHeight: 300}), true);
  assert.equal(keyboardIsOpen(), false);
});

test('binder updates on focus, visual viewport changes and keyboard dismissal', () => {
  const {win, doc} = environment();
  const cleanup = bindNavigationInsets(win, doc);
  assert.deepEqual(doc.documentElement.dataset, {mobileOs: 'ios', displayMode: 'browser', keyboardOpen: 'false',inputMode:'pointer'});
  doc.activeElement = {tagName: 'TEXTAREA'};
  doc.emit('focusin'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'false');
  win.visualViewport.height = 500;
  win.visualViewport.emit('resize'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'true');
  win.visualViewport.height = 844;
  win.visualViewport.emit('resize'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'false');
  cleanup();
});

test('resizes-content Android keyboard keeps the prior closed-height baseline', () => {
  const {win, doc} = environment(android);
  const cleanup = bindNavigationInsets(win, doc);
  doc.activeElement = {tagName: 'INPUT', type: 'text'};
  doc.emit('focusin'); win.flush();
  win.innerHeight = 500; win.visualViewport.height = 500;
  win.emit('resize'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'true');
  win.emit('resize'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'true');
  win.innerHeight = 844; win.visualViewport.height = 844;
  win.emit('resize'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'false');
  cleanup();
});

test('rotation does not retain a portrait keyboard baseline', () => {
  const {win, doc} = environment();
  const cleanup = bindNavigationInsets(win, doc);
  doc.activeElement = {tagName: 'TEXTAREA'};
  win.innerWidth = 844; win.innerHeight = 390; win.visualViewport.height = 390;
  win.emit('orientationchange'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'false');
  win.visualViewport.height = 220; win.visualViewport.emit('resize'); win.flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen, 'true');
  cleanup();
});

test('binder observes standalone transitions but does not confuse installation with launch mode', () => {
  const {win, doc} = environment();
  const cleanup = bindNavigationInsets(win, doc);
  win.emit('appinstalled'); win.flush();
  assert.equal(doc.documentElement.dataset.displayMode, 'browser');
  const media = win.matchMedia('(display-mode: standalone)');
  media.matches = true; media.emit('change'); win.flush();
  assert.equal(doc.documentElement.dataset.displayMode, 'standalone');
  cleanup();
});

test('cleanup restores owned attributes, removes listeners and cancels pending work', () => {
  const {win, doc, media, frames} = environment();
  doc.documentElement.dataset.mobileOs = 'saved';
  doc.documentElement.dataset.platform = 'android';
  const cleanup = bindNavigationInsets(win, doc);
  win.emit('resize');
  assert.equal(frames.size, 1);
  cleanup();
  assert.equal(frames.size, 0);
  assert.equal(win.listenerCount() + doc.listenerCount() + win.visualViewport.listenerCount(), 0);
  for (const entry of media.values()) assert.equal(entry.listenerCount(), 0);
  assert.deepEqual(doc.documentElement.dataset, {mobileOs: 'saved', platform: 'android'});
  win.flush();
  assert.equal(doc.documentElement.dataset.mobileOs, 'saved');
});

test('server-side/no-document binding is harmless', () => {
  assert.doesNotThrow(() => bindNavigationInsets(undefined, undefined)());
});

test('pointer focus suppression changes back to visible keyboard focus and cleans up',()=>{const {win,doc}=environment();const cleanup=bindNavigationInsets(win,doc);doc.emit('keydown',{key:'Tab'});assert.equal(doc.documentElement.dataset.inputMode,'keyboard');doc.emit('pointerdown');assert.equal(doc.documentElement.dataset.inputMode,'pointer');doc.emit('keydown',{key:'ArrowDown'});assert.equal(doc.documentElement.dataset.inputMode,'keyboard');doc.emit('click',{detail:1});assert.equal(doc.documentElement.dataset.inputMode,'pointer');cleanup();assert.equal(doc.documentElement.dataset.inputMode,undefined);});
