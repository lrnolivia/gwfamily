import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notificationPopoverGeometry, bindNotificationPopoverPlacement} from '../src/notification-popover-geometry.js';

const bell = {left: 285, right: 329, top: 30, bottom: 74, width: 44, height: 44};
const navigation = {left: 12, right: 378, top: 768, bottom: 840, width: 366, height: 72};
const defaults = {layoutWidth: 390, layoutHeight: 844, anchor: bell, width: 390, height: 16000};
function assertFits(result, anchor = bell) {
  const {x, y, width, height, maxWidth, maxHeight, bounds} = result;
  assert.ok(x >= bounds.left && y >= bounds.top, JSON.stringify(result));
  assert.ok(x + width <= bounds.right + 0.001 && y + height <= bounds.bottom + 0.001, JSON.stringify(result));
  assert.ok(width <= maxWidth && height <= maxHeight);
  if (height > 0) assert.ok(y >= anchor.bottom + 8 || y + height <= anchor.top - 8, JSON.stringify(result));
}

test('a 135-item inbox stays below the header bell instead of covering it at viewport top', () => {
  const geometry = notificationPopoverGeometry(defaults);
  assert.deepEqual(geometry, {x: 12, y: 82, width: 366, height: 750, maxWidth: 366, maxHeight: 750,
    side: 'below', bounds: {left: 12, top: 12, right: 378, bottom: 832}});
  assertFits(geometry);
  // The previous generic fallback used height - 24 and y = 12 here.
  assert.ok(12 < bell.bottom && 12 + 820 > bell.top);
});

test('a tall inbox fits between the header bell and visible Main navigation', () => {
  const geometry = notificationPopoverGeometry({...defaults, bottomNavigationRect: navigation});
  assert.deepEqual(geometry, {x: 12, y: 82, width: 366, height: 678, maxWidth: 366, maxHeight: 678,
    side: 'below', bounds: {left: 12, top: 12, right: 378, bottom: 760}});
  assertFits(geometry);assert.ok(geometry.y + geometry.height <= navigation.top - 8);
  for (const point of [bell, navigation].map(rect => ({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}))) {
    assert.ok(point.x < geometry.x || point.x > geometry.x + geometry.width ||
      point.y < geometry.y || point.y > geometry.y + geometry.height, 'The popover cannot intercept either control center');
  }
});

test('phone, tablet, desktop and landscape inboxes fit without crossing their trigger', () => {
  for (const [layoutWidth, layoutHeight] of [[320, 568], [390, 844], [768, 1024], [1280, 800], [844, 390]]) {
    const anchor = {...bell, left: layoutWidth - 100, right: layoutWidth - 56};
    const bottomNavigationRect = {...navigation, right: layoutWidth - 12, top: layoutHeight - 76, bottom: layoutHeight - 4};
    for (const height of [90, 500, 16000]) for (const nav of [undefined, bottomNavigationRect]) {
      const geometry = notificationPopoverGeometry({...defaults, layoutWidth, layoutHeight, anchor, height, bottomNavigationRect: nav});
      assertFits(geometry, anchor);
      if (nav) assert.ok(geometry.y + geometry.height <= nav.top - 8);
    }
  }
});

test('navigation exclusion still chooses below, above or the larger available side', () => {
  const bottomNavigationRect = {...navigation, top: 600, bottom: 672};
  const anchor = {...bell, top: 400, bottom: 444};
  for (const [height, side, maxHeight] of [[90, 'below', 140], [200, 'above', 380], [16000, 'above', 380]]) {
    const geometry = notificationPopoverGeometry({...defaults, anchor, bottomNavigationRect, height});
    assert.equal(geometry.side, side);assert.equal(geometry.maxHeight, maxHeight);assertFits(geometry, anchor);
    assert.ok(geometry.y + geometry.height <= bottomNavigationRect.top - 8);
  }
  const tiedAnchor = {...bell, top: 280, bottom: 324};
  const tied = notificationPopoverGeometry({...defaults, anchor: tiedAnchor, bottomNavigationRect});
  assert.equal(tied.side, 'below');assert.equal(tied.maxHeight, 260);assertFits(tied, tiedAnchor);
});

test('absent, empty and fully offscreen navigation preserve viewport-only placement', () => {
  for (const bottomNavigationRect of [undefined, null,
    {...navigation, top: 844, bottom: 916}, {...navigation, top: -72, bottom: 0},
    {...navigation, left: 390, right: 756}, {...navigation, left: -366, right: 0},
    {...navigation, right: navigation.left}, {...navigation, bottom: navigation.top}]) {
    assert.deepEqual(notificationPopoverGeometry({...defaults, bottomNavigationRect}), notificationPopoverGeometry(defaults));
  }
  const partial = notificationPopoverGeometry({...defaults, bottomNavigationRect: {...navigation, top: 820, bottom: 892}});
  assert.equal(partial.bounds.bottom, 812);assertFits(partial);
});

test('near-bottom triggers use the space above and short content prefers below when it fits', () => {
  const anchor = {...bell, top: 730, bottom: 774};
  const tall = notificationPopoverGeometry({...defaults, anchor});
  assert.equal(tall.side, 'above');assert.equal(tall.y, 12);assert.equal(tall.maxHeight, 710);assertFits(tall, anchor);
  const short = notificationPopoverGeometry({...defaults, height: 90});
  assert.equal(short.side, 'below');assert.equal(short.height, 90);assert.equal(short.y, 82);assertFits(short);
});

test('neither-side-fit chooses the larger side and a tied side consistently prefers below', () => {
  for (const [top, expected] of [[220, 'below'], [380, 'below'], [450, 'above']]) {
    const anchor = {...bell, top, bottom: top + 44};
    const result = notificationPopoverGeometry({...defaults, anchor});
    assert.equal(result.side, expected);assertFits(result, anchor);
  }
  const anchor = {...bell, top: 400, bottom: 444};
  const result = notificationPopoverGeometry({...defaults, anchor});
  assert.equal(result.side, 'below');assert.equal(result.maxHeight, 380);assertFits(result, anchor);
});

test('current safe-area insets bound both materials without changing text or palette tokens', () => {
  const geometry = notificationPopoverGeometry({...defaults, safeArea: {top: 59, bottom: 34, left: 44, right: 44}});
  assert.deepEqual(geometry.bounds, {left: 44, right: 346, top: 59, bottom: 810});
  assert.equal(geometry.maxWidth, 302);assert.equal(geometry.maxHeight, 728);assertFits(geometry);
});

test('keyboard visual viewport shrinking and pinch-pan offsets use the visible CSS pixel rectangle', () => {
  const keyboard = notificationPopoverGeometry({...defaults, visualViewport: {width: 390, height: 430, offsetLeft: 0, offsetTop: 0}});
  assert.equal(keyboard.maxHeight, 336);assertFits(keyboard);
  const anchor = {...bell, left: 240, right: 284, top: 165, bottom: 209};
  const zoomed = notificationPopoverGeometry({...defaults, anchor,
    visualViewport: {width: 195, height: 422, offsetLeft: 97.5, offsetTop: 150.5}});
  assert.deepEqual(zoomed.bounds, {left: 109.5, right: 280.5, top: 162.5, bottom: 560.5});assertFits(zoomed, anchor);
});

test('an overlay keyboard is excluded even if VisualViewport has not shrunk', () => {
  const geometry = notificationPopoverGeometry({...defaults,
    keyboardRect: {left: 0, right: 390, top: 470, bottom: 844, height: 374}});
  assert.equal(geometry.bounds.bottom, 458);assert.equal(geometry.maxHeight, 376);assertFits(geometry);
  assert.deepEqual(notificationPopoverGeometry({...defaults,
    keyboardRect: {left: 500, right: 600, top: 470, bottom: 844, height: 374}}), notificationPopoverGeometry(defaults));
});

test('navigation, safe areas, visual offsets and keyboard share the tightest visible bottom bound', () => {
  const safe = notificationPopoverGeometry({...defaults, safeArea: {top: 59, bottom: 34, left: 44, right: 44},
    bottomNavigationRect: {...navigation, top: 745, bottom: 817}});
  assert.deepEqual(safe.bounds, {left: 44, right: 346, top: 59, bottom: 737});assertFits(safe);
  const keyboardRect = {left: 0, right: 390, top: 470, bottom: 844, height: 374};
  const keyboard = notificationPopoverGeometry({...defaults, keyboardRect, bottomNavigationRect: navigation});
  assert.equal(keyboard.bounds.bottom, 458);assertFits(keyboard);
  const aboveKeyboard = notificationPopoverGeometry({...defaults, keyboardRect,
    bottomNavigationRect: {...navigation, top: 378, bottom: 450}});
  assert.equal(aboveKeyboard.bounds.bottom, 370);assertFits(aboveKeyboard);
  const shrunk = notificationPopoverGeometry({...defaults, bottomNavigationRect: navigation,
    visualViewport: {width: 390, height: 430, offsetLeft: 0, offsetTop: 0}});
  assert.equal(shrunk.bounds.bottom, 418);assertFits(shrunk);
  const anchor = {...bell, left: 240, right: 284, top: 180, bottom: 224};
  const zoomed = notificationPopoverGeometry({...defaults, anchor, safeArea: {top: 20, right: 20, bottom: 34},
    visualViewport: {width: 195, height: 422, offsetLeft: 97.5, offsetTop: 150.5},
    bottomNavigationRect: {...navigation, top: 500, bottom: 572}});
  assert.deepEqual(zoomed.bounds, {left: 109.5, right: 272.5, top: 170.5, bottom: 492});assertFits(zoomed, anchor);
});

test('stale rotation samples are clamped to current layout before notification sizing', () => {
  const geometry = notificationPopoverGeometry({...defaults, layoutWidth: 320, layoutHeight: 430,
    visualViewport: {width: 390, height: 844, offsetLeft: 70, offsetTop: 120}});
  assert.deepEqual(geometry.bounds, {left: 12, top: 12, right: 308, bottom: 418});assertFits(geometry);
});

function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, fn) {if (!listeners.has(type)) listeners.set(type, new Set());listeners.get(type).add(fn);},
    removeEventListener(type, fn) {listeners.get(type)?.delete(fn);},
    emit(type, target = this) {for (const listener of listeners.get(type) || []) listener({type, target});},
    listenerCount() {return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);},
  });
}
function environment({withNavigation = false} = {}) {
  const properties = new Map(), frames = new Map(), observed = new Set(), safe = {};
  let frameId = 0, callback, closed = 0, writes = 0;
  const style = {
    getPropertyValue(key) {return properties.get(key)?.value || '';},
    getPropertyPriority(key) {return properties.get(key)?.priority || '';},
    setProperty(key, value, priority = '') {writes++;properties.set(key, {value, priority});},
    removeProperty(key) {properties.delete(key);},
  };
  for (const [key, property] of [['left', 'left'], ['top', 'top'], ['max-width', 'maxWidth'], ['max-height', 'maxHeight'], ['transform-origin', 'transformOrigin']]) {
    Object.defineProperty(style, property, {get: () => style.getPropertyValue(key), set: value => style.setProperty(key, value)});
  }
  const panel = {naturalHeight: 16000, scrollTop: 0,
    get offsetHeight() {return Math.min(this.naturalHeight, parseFloat(style.getPropertyValue('--notification-content-max-height')) || Infinity);},
    get scrollHeight() {return this.naturalHeight;},
  }, anchor = {isConnected: true, rect: {...bell}, getBoundingClientRect() {return this.rect;}},
  nav = {isConnected: true, hidden: false, display: 'flex', visibility: 'visible',
    rect: {...navigation}, getBoundingClientRect() {return this.rect;}};
  const el = {style, naturalWidth: 390, open: true,
    matches() {return this.open;}, contains(node) {return node === this || node === panel;},
    querySelector(selector) {assert.equal(selector, '.notification-panel');return panel;},
    get offsetWidth() {return Math.min(this.naturalWidth, parseFloat(style.maxWidth) || Infinity);},
    get offsetHeight() {return Math.min(panel.offsetHeight + 10, parseFloat(style.maxHeight) || Infinity);},
  };
  const root = {clientWidth: 390, clientHeight: 844};
  const win = events({innerWidth: 390, innerHeight: 844,
    visualViewport: events({width: 390, height: 844, offsetLeft: 0, offsetTop: 0}),
    navigator: {virtualKeyboard: events({boundingRect: {height: 0}})},
    getComputedStyle(node) {return {getPropertyValue: key => safe[key] || '0px', display: node.display, visibility: node.visibility,
      borderTopWidth: node === panel ? '0px' : '1px', borderBottomWidth: node === panel ? '0px' : '1px', paddingTop: '4px', paddingBottom: '4px'};},
    ResizeObserver: class {constructor(fn) {callback = fn;}observe(node) {observed.add(node);}unobserve(node) {observed.delete(node);}disconnect() {observed.clear();}},
    requestAnimationFrame(fn) {frames.set(++frameId, fn);return frameId;},
    cancelAnimationFrame(id) {frames.delete(id);},
    flush() {const pending = [...frames.values()];frames.clear();for (const fn of pending) fn();},
  });
  const doc = {documentElement: root, navigation: withNavigation ? nav : null,
    querySelector(selector) {assert.equal(selector, '[aria-label="Main navigation"]');return this.navigation;}};
  return {win, doc, root, el, anchor, panel, nav, properties, frames, observed, safe,
    resizeContent: () => callback(), onUnavailable: () => closed++, closeCount: () => closed, writeCount: () => writes};
}

test('binder uses natural scroll height after loading more or scrolling the long inbox', () => {
  const env = environment(), {el, panel, win} = env;
  const cleanup = bindNotificationPopoverPlacement(el, env.anchor, env.onUnavailable, win, env.doc);
  assert.equal(el.style.top, '82px');assert.equal(el.style.maxHeight, '750px');assert.equal(el.style.maxWidth, '366px');
  assert.equal(env.observed.size, 3);
  assert.equal(el.style.getPropertyValue('--notification-content-max-height'), '740px');
  panel.scrollTop = 15000;panel.naturalHeight = 32000;env.resizeContent();
  assert.equal(el.style.top, '82px');assert.equal(el.style.maxHeight, '750px');assert.equal(panel.scrollTop, 15000);
  assert.equal(el.offsetHeight, 750);assert.equal(panel.offsetHeight, 740);
  const before = env.writeCount();win.emit('scroll', el);win.emit('scroll', env.panel);
  assert.equal(env.writeCount(), before);assert.equal(env.frames.size, 0);
  cleanup();
});

test('binder observes actual navigation size and bounds only the scroll body above it', () => {
  const env = environment({withNavigation: true}), {el, panel, nav} = env;
  const cleanup = bindNotificationPopoverPlacement(el, env.anchor, env.onUnavailable, env.win, env.doc);
  assert.equal(env.observed.size, 4);assert.ok(env.observed.has(nav));
  assert.equal(el.style.top, '82px');assert.equal(el.style.maxHeight, '678px');
  assert.equal(el.style.getPropertyValue('--notification-content-max-height'), '668px');
  panel.scrollTop = 15000;panel.naturalHeight = 32000;nav.rect = {...navigation, top: 720, height: 120};env.resizeContent();
  assert.equal(el.style.top, '82px');assert.equal(el.style.maxHeight, '630px');
  assert.equal(el.offsetHeight, 630);assert.equal(panel.offsetHeight, 620);assert.equal(panel.scrollTop, 15000);
  assert.equal(env.closeCount(), 0);cleanup();assert.equal(env.observed.size, 0);
});

test('hidden navigation and routes without navigation retain the previous available space', () => {
  const env = environment({withNavigation: true}), {el, nav, win} = env;
  const cleanup = bindNotificationPopoverPlacement(el, env.anchor, env.onUnavailable, win, env.doc);
  // Keyboard visibility changes leave the dock rectangle intact. Reread its
  // visibility on the viewport event and its delayed follow-up frame.
  nav.visibility = 'hidden';win.visualViewport.emit('resize');assert.equal(el.style.maxHeight, '750px');
  nav.visibility = 'visible';win.flush();assert.equal(el.style.maxHeight, '678px');
  for (const [key, value] of [['hidden', true], ['display', 'none'], ['visibility', 'collapse']]) {
    const before = nav[key];nav[key] = value;env.resizeContent();assert.equal(el.style.maxHeight, '750px');
    nav[key] = before;env.resizeContent();assert.equal(el.style.maxHeight, '678px');
  }
  nav.rect = {...navigation, top: 844, bottom: 916};env.resizeContent();assert.equal(el.style.maxHeight, '750px');
  nav.rect = {...navigation};nav.isConnected = false;env.resizeContent();
  assert.equal(el.style.maxHeight, '750px');assert.ok(!env.observed.has(nav));
  env.doc.navigation = null;win.emit('pageshow');assert.equal(el.style.maxHeight, '750px');
  env.doc.navigation = nav;nav.isConnected = true;win.emit('pageshow');
  assert.equal(el.style.maxHeight, '678px');assert.ok(env.observed.has(nav));assert.equal(env.closeCount(), 0);cleanup();
});

test('window resize clamps immediately and rereads a delayed VisualViewport on the next frame', () => {
  const env = environment(), {el, win, root} = env;
  const cleanup = bindNotificationPopoverPlacement(el, env.anchor, env.onUnavailable, win, env.doc);
  root.clientWidth = win.innerWidth = 320;root.clientHeight = win.innerHeight = 430;
  win.emit('resize');assert.equal(el.style.maxWidth, '296px');assert.equal(el.style.maxHeight, '336px');
  Object.assign(win.visualViewport, {width: 320, height: 300});win.flush();
  assert.equal(el.style.maxHeight, '206px');cleanup();
});

test('visual resize, safe-area change, orientation, history and overlay keyboard all refresh placement', () => {
  const env = environment(), {el, win} = env;
  const cleanup = bindNotificationPopoverPlacement(el, env.anchor, env.onUnavailable, win, env.doc);
  win.visualViewport.height = 430;win.visualViewport.emit('resize');assert.equal(el.style.maxHeight, '336px');
  env.safe['--notification-safe-bottom'] = '34px';win.emit('orientationchange');assert.equal(el.style.maxHeight, '314px');
  env.safe['--notification-safe-bottom'] = '12px';win.visualViewport.height = 844;win.emit('pageshow');assert.equal(el.style.maxHeight, '750px');
  win.navigator.virtualKeyboard.boundingRect = {left: 0, right: 390, top: 470, bottom: 844, height: 374};
  win.navigator.virtualKeyboard.emit('geometrychange');assert.equal(el.style.maxHeight, '376px');cleanup();
});

test('page scroll follows the bell; a disconnected or fully hidden bell dismisses the popover', () => {
  const env = environment(), {el, win, anchor} = env;
  const cleanup = bindNotificationPopoverPlacement(el, anchor, env.onUnavailable, win, env.doc);
  anchor.rect = {...bell, top: 10, bottom: 54};win.emit('scroll');assert.equal(el.style.top, '62px');
  anchor.isConnected = false;win.emit('scroll');assert.equal(env.closeCount(), 1);
  anchor.isConnected = true;anchor.rect = {...bell, top: -50, bottom: -6};win.emit('scroll');assert.equal(env.closeCount(), 2);
  anchor.rect = {...bell, top: 900, bottom: 944};win.visualViewport.emit('scroll');assert.equal(env.closeCount(), 3);cleanup();
});

test('no usable space dismisses instead of covering the trigger with popover chrome', () => {
  const env = environment();env.root.clientHeight = 70;env.win.visualViewport.height = 70;
  env.anchor.rect = {...bell, top: 13, bottom: 57};
  const cleanup = bindNotificationPopoverPlacement(env.el, env.anchor, env.onUnavailable, env.win, env.doc);
  assert.equal(env.closeCount(), 1);cleanup();
});

test('cleanup restores owned styles, disconnects navigation and content observers and cancels pending work', () => {
  const env = environment({withNavigation: true});env.el.style.setProperty('max-width', '75vw', 'important');env.el.style.setProperty('color', 'green');
  const before = [...env.properties];
  const cleanup = bindNotificationPopoverPlacement(env.el, env.anchor, env.onUnavailable, env.win, env.doc);
  env.win.emit('resize');assert.equal(env.frames.size, 1);cleanup();
  assert.equal(env.observed.size, 0);assert.equal(env.frames.size, 0);
  assert.equal(env.win.listenerCount() + env.win.visualViewport.listenerCount() + env.win.navigator.virtualKeyboard.listenerCount(), 0);
  assert.deepEqual([...env.properties], before);env.resizeContent();env.win.flush();assert.deepEqual([...env.properties], before);
});

test('notification policy remains opt-in with native popovers and a single scroller in both materials', () => {
  const ui = readFileSync(new URL('../src/ui-core.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/notifications.css', import.meta.url), 'utf8');
  assert.match(ui, /if\(kind==='notifications'\)\{\s*if\(!el\.matches\(':popover-open'\)\)el\.showPopover\(\);\s*const cleanup=bindNotificationPopoverPlacement\(el,anchor,onClose\)/);
  assert.match(ui, /cleanup\(\);if\(el\.matches\(':popover-open'\)\)el\.hidePopover\(\)/);
  assert.match(ui, /className=\{'gw-glass-menu '\+surfaceClass\}/);
  assert.match(ui, /className=\{'gw-material-menu '\+surfaceClass\}/);
  assert.equal((ui.match(/popover="auto"/g) || []).length, 2);
  assert.match(css, /\.notification-popover\.gw-glass-menu\[popover\],\.notification-popover\.gw-material-menu\[popover\]\{overflow:hidden\}/);
  assert.match(css, /\.notification-popover\.gw-glass-menu>\.liquid-glass-content\{max-height:none;overflow:visible;min-height:0\}/);
  assert.match(css, /\.notification-popover \.notification-panel\.pop-content\{max-height:var\(--notification-content-max-height,none\);overflow:auto;overscroll-behavior:contain;min-height:0\}/);
  assert.match(css, /width:max-content;min-width:0;min-height:0/);
});
