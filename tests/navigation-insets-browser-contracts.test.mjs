// Node-only contracts for the actual hosted harness. No browser launch, device
// emulation, external request, or claim of a WebKit/Chromium geometry pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {bindNavigationInsets} from '../src/navigation-insets.js';

const source = readFileSync(new URL('./navigation-insets-browser.mjs', import.meta.url), 'utf8');
function functionSource(name, next) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf(`\n${next}`, start);
  assert.ok(start >= 0 && end > start, `${name} must be extracted from the hosted harness.`);
  return source.slice(start, end);
}
function loadFunction(name, next, globals = {}) {
  const body = functionSource(name, next);
  return vm.runInNewContext(`(${source.slice(source.indexOf(body) - 6, source.indexOf(body)) === 'async ' ? 'async ' : ''}${body})`, globals);
}
const fixtureSource = functionSource('installNavigationFixture', 'async function navigationStage');
function fixture() {
  const frames = [], storage = new Map(), sessionStorage = new Map(), nodes = new Map();
  const navigator = {userAgent: 'Mozilla/5.0 (iPhone)'};
  const window = Object.assign(new EventTarget(), {navigator, innerWidth: 390, innerHeight: 844,
    matchMedia: () => ({matches: false}), requestAnimationFrame: callback => {frames.push(callback);return frames.length;},
    cancelAnimationFrame() {}, flush() {const callbacks = frames.splice(0);for (const callback of callbacks) callback();}});
  const document = Object.assign(new EventTarget(), {readyState: 'loading', visibilityState: 'visible',
    documentElement: {dataset: {}}, activeElement: null, hasFocus: () => true,
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector === 'main' ? {prepend(node) {nodes.set(node.id, node);node.isConnected = true;}} : null,
    createElement: tag => ({tagName: tag.toUpperCase(), type: 'text', isConnected: false,
      setAttribute() {}, focus() {document.activeElement = this;document.dispatchEvent(new Event('focusin'));},
      blur() {document.activeElement = null;document.dispatchEvent(new Event('focusout'));},
      remove() {nodes.delete(this.id);this.isConnected = false;document.activeElement = null;}}),
  });
  const context = vm.createContext({window, document, navigator, innerWidth: 390, innerHeight: 844,
    localStorage: {setItem: (key, value) => storage.set(key, value)}, sessionStorage: {setItem: (key,value)=>sessionStorage.set(key,value)}, EventTarget, Event,
    performance: {now: () => 0}, requestAnimationFrame: window.requestAnimationFrame,
    MutationObserver: class {observe(target, options) {assert.equal(target, document);assert.ok(options.attributeFilter.includes('data-keyboard-open'));}},
  });
  vm.runInContext(`(${fixtureSource})`, context)({device: {platform: 'iPhone', touch: 5, width: 390, height: 844},
    material: 'ios', theme: 'dark', mode: 'standalone', state: {onboarding: 'done', mode: 'preview'}, key: 'preview-fixture'});
  return {window, document, storage, sessionStorage, context};
}
function evaluateCallback(context, marker) {
  const start = source.indexOf(marker), callback = source.indexOf('() => {', start), end = source.indexOf('\n          });', callback);
  assert.ok(start >= 0 && callback > start && end > callback, marker);
  return vm.runInContext('(' + source.slice(callback, end) + '\n})', context)();
}

test('navigation fixture preserves preview and device setup and records bounded lifecycle/frame evidence', () => {
  const {window, document, storage, sessionStorage} = fixture(), qa = window.__gwNavigationQA;
  assert.equal(window.navigator.platform, 'iPhone');assert.equal(window.navigator.maxTouchPoints, 5);
  assert.equal(window.navigator.standalone, true);assert.equal(window.matchMedia('(display-mode: standalone)').matches, true);
  assert.deepEqual(JSON.parse(storage.get('preview-fixture')), {schema: 2, mode: 'preview', state: {onboarding: 'done', mode: 'preview'}});
  assert.equal(sessionStorage.get('gw-active-mode'),'preview');assert.equal(storage.get('gw-preview-notice:v1'), 'seen');assert.equal(storage.get('gw-install-dismissed'), 'true');
  for (let i = 0; i < 55; i++) qa.log('synthetic-event', {index: i});
  assert.equal(qa.events.length, 40);assert.equal(qa.events[0].index, 15);
  qa.mark('keyboard dismissal');
  assert.equal(qa.events.at(-1).type, 'stage');window.flush();
  assert.equal(qa.events.at(-1).type, 'animation-frame');assert.equal(qa.events.at(-1).requestedStage, 'keyboard dismissal');
  document.visibilityState = 'hidden';document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(qa.events.at(-1).visibility, 'hidden');assert.equal(qa.events.at(-1).stage, 'keyboard dismissal');
  assert.equal(document.documentElement.dataset.keyboardOpen, undefined, 'Diagnostics do not write runtime attributes.');
});

test('actual keyboard dismissal restores the viewport while text entry remains focused and connected', () => {
  const {window, document, context} = fixture();
  const cleanup = bindNavigationInsets(window, document);
  evaluateCallback(context, "await navigationStage(page, trace, 'keyboard open');");
  window.flush();
  const input = document.getElementById('navigation-qa-input');
  assert.equal(document.documentElement.dataset.keyboardOpen, 'true');assert.equal(document.activeElement, input);
  const result = evaluateCallback(context, 'const dismissal = await page.evaluate');
  assert.equal(result.inputPresent, true);assert.equal(result.focused, true);
  assert.equal(document.getElementById('navigation-qa-input'), input);assert.equal(document.activeElement, input);
  assert.equal(window.visualViewport.height, 844);
  assert.equal(document.documentElement.dataset.keyboardOpen, 'true', 'Fixture never writes the flag to force the assertion.');
  window.flush();assert.equal(document.documentElement.dataset.keyboardOpen, 'false');
  assert.equal(document.activeElement, input, 'The real binder must clear the flag through viewport restoration alone.');
  cleanup();
});

test('case observer keeps request status, pending requests, lifecycle and runtime errors bounded and attributed', () => {
  const listeners = new Map(), errors = [];
  const page = {on(name, callback) {listeners.set(name, callback);}, mainFrame: () => null};
  const observe = loadFunction('observeNavigationCase', 'function installNavigationFixture', {Date, URL, errors, base: 'http://127.0.0.1:4173'});
  const trace = observe(page, 'iphone-ios-dark-browser');trace.stage = 'preview navigation readiness';
  const request = {url: () => 'http://127.0.0.1:4173/api/config?secret=excluded', method: () => 'GET', resourceType: () => 'fetch'};
  listeners.get('request')(request);assert.equal(trace.snapshot().pendingCount, 1);
  listeners.get('response')({request: () => request, url: request.url, status: () => 404});
  assert.equal(trace.events.at(-1).status, 404);assert.equal(trace.events.at(-1).path, '/api/config');
  listeners.get('requestfinished')(request);assert.equal(trace.snapshot().pendingCount, 0);
  const failed = {...request, failure: () => ({errorText: 'failure '.repeat(200)})};
  listeners.get('request')(failed);listeners.get('requestfailed')(failed);
  assert.equal(trace.snapshot().pendingCount, 0);assert.equal(trace.events.at(-1).error.length, 1000);
  for (let i = 0; i < 70; i++) listeners.get('load')();
  assert.equal(trace.events.length, 60);
  listeners.get('pageerror')(new Error('test runtime error'));
  assert.deepEqual(errors, ['test runtime error']);assert.equal(trace.events.at(-1).stage, 'preview navigation readiness');
});

test('failure capture retains the original cause, case and stage even if diagnostics or persistence fail', async () => {
  const files = [], logs = [], error = new Error('keyboard wait failed');
  const bounded = loadFunction('boundedNavigationDiagnostic', 'async function captureNavigationFailure', {Promise, setTimeout, clearTimeout});
  const capture = loadFunction('captureNavigationFailure', 'async function open', {boundedNavigationDiagnostic: bounded,
    engineName: 'webkit', timeoutMs: 15000, output: 'docs/navigation-qa', Error, console: {error: (...args) => logs.push(args)},
    writeFile: async (path, body) => files.push({path, body: JSON.parse(body)}),
  });
  const page = {evaluate: async () => {throw new Error('Document closed');}, screenshot: async () => {throw new Error('No screenshot');}};
  const trace = {label: 'iphone-ios-dark-browser', stage: 'keyboard dismissal', boot: {readyState: 'complete'}, snapshot: () => ({pending: [], events: []})};
  const wrapped = await capture(page, trace, error);
  assert.equal(wrapped.cause, error);assert.match(wrapped.message, /iphone-ios-dark-browser: keyboard dismissal/);
  const diagnostic = files[0].body;
  assert.equal(files[0].path, 'docs/navigation-qa/webkit-iphone-ios-dark-browser-failure.json');
  assert.equal(diagnostic.stage, 'keyboard dismissal');assert.equal(diagnostic.timeoutMs, 15000);
  assert.equal(diagnostic.document.unavailable, 'Document closed');assert.equal(diagnostic.screenshot.unavailable, 'No screenshot');
  assert.equal(logs[0][0], 'NAVIGATION FAILURE DIAGNOSTICS:');
  const failingCapture = loadFunction('captureNavigationFailure', 'async function open', {boundedNavigationDiagnostic: bounded,
    engineName: 'webkit', timeoutMs: 15000, output: 'docs/navigation-qa', Error, console: {error() {}},
    writeFile: async () => {throw new Error('Unavailable artifact directory');},
  });
  assert.equal((await failingCapture(page, trace, error)).cause, error);
});

test('diagnostic deadlines are bounded without increasing browser assertion timeouts', async () => {
  let callback, cleared = false;
  const bounded = loadFunction('boundedNavigationDiagnostic', 'async function captureNavigationFailure', {
    Promise, setTimeout: (fn, delay) => {assert.equal(delay, 2500);callback = fn;return 1;}, clearTimeout: id => {assert.equal(id, 1);cleared = true;},
  });
  const pending = bounded(new Promise(() => {}), 2500);callback();
  assert.equal((await pending).unavailable, 'Diagnostic exceeded 2500ms');assert.equal(cleared, true);
  assert.match(source, /timeoutMs = 15000/);assert.match(source, /page\.setDefaultTimeout\(timeoutMs\)/);
});

test('geometry coverage, strict visibility checks and hosted isolation stay intact', () => {
  for (const contract of [
    "for (const safe of [0, 21, 34])", "['ios', 'android']", "['light', 'dark']", "['browser', 'standalone']",
    'dock gap matches OS/display mode', 'FAB consumes the same inset once', 'controls clear the full simulated OS inset',
    'no horizontal overflow', 'separate adjacent FAB', 'centered dock group', 'stacked FAB does not overlap navigation',
    'centered capsule clears an asymmetric notch', 'FAB clears the right notch',
    "dataset.keyboardOpen === 'true'", "dataset.keyboardOpen === 'false'", "assert.deepEqual(errors, [])",
    "serviceWorkers: 'block'", 'route.continue() : route.abort()',
  ]) assert.ok(source.includes(contract), contract);
  assert.ok(source.indexOf("dataset.keyboardOpen === 'false'", source.indexOf('const dismissal')) < source.indexOf('input.blur();input.remove();'));
  assert.ok(source.indexOf('captureNavigationFailure(current.page') < source.indexOf('await current.context?.close()'));
  assert.ok(source.indexOf('observeNavigationCase(page') < source.indexOf('await page.goto(base'));
  assert.doesNotMatch(source, /force\s*:\s*true|waitForTimeout|networkidle|keyboardOpen\s*=(?!=)|\.launch\([^)]*executablePath/);
});
