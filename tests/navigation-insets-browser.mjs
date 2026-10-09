import './test-environment-guard.mjs';
// Hosted-only geometry regression. Run after build against the isolated static
// preview on port 4173. Simulated UA/insets/keyboard cannot replace device QA.
import {chromium, webkit, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {initialState, PREVIEW_KEY} from '../src/data-adapter.js';
import {navigationInsetMetrics} from '../src/navigation-insets.js';
import {verifyPageHeaderGlass} from './page-header-glass-browser-check.mjs';

if (!process.env.CI && process.env.GW_HOSTED_BROWSER_QA !== '1') {
  throw new Error('Navigation browser QA runs only in the authorized hosted CI environment.');
}
const base = process.env.GW_NAVIGATION_URL || 'http://127.0.0.1:4173';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), 'Only the isolated hosted preview may be used.');
const output = 'docs/navigation-qa', results = [], errors = [], timeoutMs = 15000;
const engineName = process.env.GW_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless: true});
await mkdir(output, {recursive: true});
const devices = [
  {name: 'iphone', os: 'ios', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', touch: 5},
  {name: 'ipad-desktop-ua', os: 'ios', width: 768, height: 1024, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform: 'MacIntel', touch: 5},
  {name: 'android', os: 'android', width: 390, height: 844, userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l', touch: 5},
  ...[{name:'android-tablet-portrait',width:800,height:1280},{name:'android-tablet-landscape',width:1280,height:800},
    {name:'android-tablet-narrow-window',width:699,height:1024},{name:'android-tablet-rail-boundary',width:700,height:1024}].map(device=>({...device,os:'android',userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel Tablet) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',platform:'Linux armv8l',touch:5})),
  {name: 'iphone-landscape', os: 'ios', width: 844, height: 390, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', touch: 5},
  {name: 'mac-desktop', os: 'none', width: 768, height: 1024, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform: 'MacIntel', touch: 0},
];
const state = initialState(); state.onboarding = 'done';

// Bounded observer data survives until the failing page has been inspected.
// Neither these observers nor the frame probes change app state or scheduling.
function observeNavigationCase(page, label) {
  const events = [], requests = new Map(), ids = new WeakMap(), started = Date.now();
  let sequence = 0;
  const trace = {label, stage: 'create page', events, boot: null,
    log(type, detail = {}) {
      events.push({ms: Date.now() - started, stage: trace.stage, type, ...detail});
      if (events.length > 60) events.shift();
    },
    snapshot: () => ({pendingCount: requests.size, pending: [...requests.values()].slice(-30), events: [...events]}),
  };
  const path = value => {try {const url = new URL(value);return (url.origin === base ? '' : url.origin) + url.pathname;} catch {return String(value).slice(0,300);}};
  page.on('request', request => {
    const id = ++sequence; ids.set(request, id);
    const detail = {id, path: path(request.url()), method: request.method(), resource: request.resourceType()};
    requests.set(id, detail); trace.log('request', detail);
  });
  page.on('response', response => trace.log('response', {id: ids.get(response.request()), path: path(response.url()), status: response.status()}));
  page.on('requestfinished', request => {requests.delete(ids.get(request));trace.log('requestfinished', {id: ids.get(request), path: path(request.url())});});
  page.on('requestfailed', request => {requests.delete(ids.get(request));trace.log('requestfailed', {id: ids.get(request), path: path(request.url()), error: String(request.failure()?.errorText || '').slice(0,1000)});});
  page.on('pageerror', error => {errors.push(error.message);trace.log('pageerror', {message: String(error.stack || error.message).slice(0,2000)});});
  page.on('console', message => {if (message.type() === 'error') trace.log('consoleerror', {message: message.text().slice(0,2000)});});
  for (const event of ['domcontentloaded', 'load', 'crash', 'close']) page.on(event, () => trace.log(event));
  page.on('framenavigated', frame => {if (frame === page.mainFrame()) trace.log('framenavigated', {path: path(frame.url())});});
  return trace;
}

function installNavigationFixture({device, material, theme, mode, state, key}) {
  Object.defineProperty(navigator, 'platform', {get: () => device.platform});
  Object.defineProperty(navigator, 'maxTouchPoints', {get: () => device.touch});
  Object.defineProperty(navigator, 'standalone', {get: () => mode === 'standalone'});
  const actualMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const media = actualMatchMedia(query);
    if (query === '(display-mode: standalone)') Object.defineProperty(media, 'matches', {get: () => mode === 'standalone'});
    return media;
  };
  // Synthetic visualViewport drives the real app listeners in both engines.
  const viewport = new EventTarget();
  Object.assign(viewport, {height: device.height, width: device.width, offsetTop: 0, offsetLeft: 0, scale: 1});
  Object.defineProperty(window, 'visualViewport', {get: () => viewport});
  localStorage.setItem(key, JSON.stringify({schema: 2, mode: 'preview', state}));
  sessionStorage.setItem('gw-active-mode','preview');
  localStorage.setItem('gw-platform', material);
  localStorage.setItem('gw-theme', theme);
  localStorage.setItem('gw-preview-notice:v1', 'seen');
  localStorage.setItem('gw-install-dismissed', 'true');
  const events = [], started = performance.now();
  const snapshot = () => ({readyState: document.readyState, visibility: document.visibilityState,
    focused: document.hasFocus(), active: {tag: document.activeElement?.tagName, id: document.activeElement?.id,
      type: document.activeElement?.type, connected: document.activeElement?.isConnected},
    attributes: {...document.documentElement?.dataset}, layout: {width: innerWidth, height: innerHeight},
    viewport: {width: viewport.width, height: viewport.height, top: viewport.offsetTop, left: viewport.offsetLeft, scale: viewport.scale}});
  const qa = window.__gwNavigationQA = {stage: 'fixture initialization', events, snapshot,
    log(type, detail = {}) {
      events.push({ms: Math.round(performance.now() - started), stage: qa.stage, type, ...detail, ...snapshot()});
      if (events.length > 40) events.shift();
    },
    mark(stage) {
      qa.stage = stage; qa.log('stage');
      // A probe distinguishes a stalled rendering opportunity from a wrong
      // keyboard value without replacing requestAnimationFrame in the app.
      requestAnimationFrame(() => qa.log('animation-frame', {requestedStage: stage}));
    },
  };
  for (const event of ['pageshow', 'pagehide', 'resize', 'orientationchange']) window.addEventListener(event, e => qa.log(event, {persisted: e.persisted}));
  for (const event of ['DOMContentLoaded', 'visibilitychange', 'focusin', 'focusout']) document.addEventListener(event, () => qa.log(event));
  for (const event of ['resize', 'scroll']) viewport.addEventListener(event, () => qa.log('visualViewport.' + event));
  new MutationObserver(records => {
    const names = [...new Set(records.map(record => record.attributeName))];
    qa.log('navigation-attributes', {names});
  }).observe(document, {subtree: true, attributes: true, attributeFilter: ['data-mobile-os', 'data-display-mode', 'data-keyboard-open']});
  qa.log('fixture-initialized');
}

async function navigationStage(page, trace, stage) {
  trace.stage = stage; trace.log('stage');
  await page.evaluate(stage => window.__gwNavigationQA?.mark(stage), stage);
}

async function boundedNavigationDiagnostic(promise, ms) {
  let timer;
  try {return await Promise.race([promise, new Promise(resolve => {timer = setTimeout(() => resolve({unavailable: `Diagnostic exceeded ${ms}ms`}), ms);})]);}
  catch (error) {return {unavailable: String(error.message).slice(0,1000)};}
  finally {clearTimeout(timer);}
}

async function captureNavigationFailure(page, trace, error) {
  const diagnostics = {case: trace.label, stage: trace.stage, engine: engineName, timeoutMs,
    error: String(error.stack || error.message).slice(0,4000), boot: trace.boot, ...trace.snapshot()};
  diagnostics.document = await boundedNavigationDiagnostic(page.evaluate(() => {
    const element = selector => {
      const node = document.querySelector(selector);if (!node) return null;
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return {tag: node.tagName, className: node.className, rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom},
        display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents};
    };
    return {title: document.title, path: location.pathname + location.hash, ...window.__gwNavigationQA?.snapshot(),
      lifecycle: window.__gwNavigationQA?.events.slice(-40), rootChildren: document.getElementById('root')?.childElementCount,
      rootText: document.getElementById('root')?.innerText.slice(0,2000), app: element('.app'), nav: element('.bottom'),
      fab: element('.fab-glass, .material-fab'), input: element('#navigation-qa-input'),
      notificationStatus: document.querySelector('.notification-panel [role=status]')?.textContent?.slice(0,300),
      alerts: [...document.querySelectorAll('[role=alert]')].slice(0,5).map(node => node.textContent.slice(0,400)),
      styles: Object.fromEntries(['--vv-height', '--vv-width', '--gw-safe-bottom'].map(key => [key, document.documentElement.style.getPropertyValue(key)]))};
  }), 2500);
  const filename = `${engineName}-${trace.label}-failure`;
  diagnostics.screenshot = await boundedNavigationDiagnostic(page.screenshot({path: `${output}/${filename}.png`, timeout: 4000}).then(() => `${filename}.png`), 4500);
  try {await writeFile(`${output}/${filename}.json`, JSON.stringify(diagnostics, null, 2));}
  catch (failure) {diagnostics.persistenceError = String(failure.message).slice(0,1000);}
  console.error('NAVIGATION FAILURE DIAGNOSTICS:', JSON.stringify(diagnostics));
  return new Error(`${trace.label}: ${trace.stage}: ${error.message}`, {cause: error});
}

async function open(device, material, theme, mode, traceHolder) {
  const context = await browser.newContext({viewport: {width: device.width, height: device.height},
    userAgent: device.userAgent, hasTouch: device.touch > 0, reducedMotion: 'reduce', serviceWorkers: 'block'});
  traceHolder.context = context;
  const page = await context.newPage();
  const trace = observeNavigationCase(page, `${device.name}-${material}-${theme}-${mode}`);
  Object.assign(traceHolder, {context, page, trace});
  page.setDefaultTimeout(timeoutMs);
  // No external requests or live data. Only in-memory/localStorage preview data.
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.addInitScript(installNavigationFixture, {device, material, theme, mode, state, key: PREVIEW_KEY});
  trace.stage = 'preview document bootstrap';
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  await navigationStage(page, trace, 'preview navigation readiness');
  await page.getByRole('navigation', {name: 'Main navigation', exact: true}).waitFor();
  await page.waitForFunction(({os, material, theme, mode}) => {
    const data = document.documentElement.dataset;
    return data.mobileOs === os && data.displayMode === mode && data.platform === material &&
      data.theme === theme && data.keyboardOpen === 'false';
  }, {os: device.os, material, theme, mode});
  const attributes = await page.evaluate(() => ({...document.documentElement.dataset}));
  assert.equal(attributes.mobileOs, device.os);
  assert.equal(attributes.displayMode, mode);
  assert.equal(attributes.platform, material);
  trace.boot = {document: await page.evaluate(() => window.__gwNavigationQA.snapshot()), ...trace.snapshot()};
  return {context, page, trace};
}

try {
  for (const device of devices) for (const material of ['ios', 'android']) {
    for (const theme of ['light', 'dark']) for (const mode of ['browser', 'standalone']) {
      const label = `${device.name}-${material}-${theme}-${mode}`;
      const current = {};
      try {
        const {page, trace} = await open(device, material, theme, mode, current);
        await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Family',exact:true}).click();
        await page.evaluate(()=>document.getElementById('main').focus());
        assert.equal(await page.locator('#main').evaluate(node=>getComputedStyle(node).outlineStyle),'none',`${label}: pointer navigation has no page glow`);
        await page.keyboard.press('Tab');await page.evaluate(()=>document.getElementById('main').focus());
        assert.equal(await page.locator('#main').evaluate(node=>getComputedStyle(node).outlineStyle),'solid',`${label}: keyboard page focus remains visible`);
        await expect(page.locator('.page-navigation-header .page-back')).toHaveCount(0);
        const backGlyph=page.locator('.page-route-glyph .glyph').first();await expect(backGlyph).toBeVisible();
        assert.equal(await backGlyph.evaluate(node=>getComputedStyle(node).transform),'none',`${label}: Main destination glyph is not reversed by material wrappers`);
        await verifyPageHeaderGlass(page,{material,inline:true,label});
        if(material==='android'){
          const selected=page.getByRole('navigation',{name:'Main navigation'}).locator('button[aria-current=page]');
          const paint=await selected.evaluate(node=>({fill:getComputedStyle(node).backgroundColor,glyph:getComputedStyle(node.querySelector('.glyph')).color}));
          assert.equal(paint.fill,'rgba(0, 0, 0, 0)',`${label}: selected destination has no rectangular fill`);
          assert.equal(paint.glyph,'rgb(255, 250, 240)',`${label}: selected accent capsule has warm off-white glyph`);
        }
        // Tall tablet windows can fit the entire synthetic Family page. Give
        // this scroll-only check enough isolated content to exercise the real
        // compact-header transition, then remove it before inset measurements.
        await page.evaluate(()=>{
          const spacer=document.createElement('div');spacer.id='navigation-qa-scroll-space';
          spacer.setAttribute('aria-hidden','true');spacer.inert=true;spacer.style.height='400px';
          document.querySelector('main').append(spacer);window.scrollTo(0,300);
        });
        await page.waitForFunction(()=>window.scrollY>=299);
        await expect(page.locator('.page-navigation-header')).toHaveAttribute('data-compact','true');
        await verifyPageHeaderGlass(page,{material,inline:false,label});
        const back=page.locator('.page-route-glyph');await expect(back).toBeVisible();await expect(page.locator('.page-navigation-header .page-back')).toHaveCount(0);
        const backBox=await back.boundingBox();assert.ok(backBox.y>=0&&backBox.y+backBox.height<=device.height,`${label}: Main destination glyph stays visible after scroll`);
        await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById('navigation-qa-scroll-space').remove();});
        await page.waitForFunction(()=>window.scrollY===0&&!document.querySelector('.page-navigation-header').hasAttribute('data-compact'));
        await verifyPageHeaderGlass(page,{material,inline:true,label});
        for (const safe of [0, 21, 34]) {
          await navigationStage(page, trace, `safe-area geometry ${safe}px`);
          await page.evaluate(value => document.documentElement.style.setProperty('--gw-safe-bottom', `${value}px`), safe);
          const geometry = await page.evaluate(() => {
            const nav = document.querySelector('.bottom'), fab = document.querySelector('.fab-glass, .material-fab');
            const rect = node => {const r = node.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right};};
            return {nav: rect(nav), fab: rect(fab), main:rect(document.querySelector('main')),header:rect(document.querySelector('.app-header')), buttons: [...nav.querySelectorAll('button')].map(rect), width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth};
          });
          const expected = navigationInsetMetrics({mobileOS: device.os, displayMode: mode, safeAreaBottom: safe, width: device.width, material});
          if(expected.layout==='rail'){
            assert.equal(geometry.nav.x,0,`${label}: rail sits at the leading edge`);assert.equal(geometry.nav.width,expected.railWidth);assert.equal(geometry.nav.y,expected.top);
            assert.ok(geometry.main.x>=geometry.nav.right,`${label}: rail reserves content space`);
            assert.ok(geometry.buttons.every((button,index)=>index===0||button.y>=geometry.buttons[index-1].bottom),`${label}: destinations stack without overlap`);
            if(expected.fabBottom!==undefined){
              assert.ok(Math.abs(geometry.height-geometry.fab.bottom-expected.fabBottom)<=1,`${label}: Android tablet FAB clears the bottom safe area once`);
              assert.ok(geometry.fab.x>=geometry.nav.right+12,`${label}: bottom-right FAB stays clear of the rail`);
            }else assert.ok(geometry.fab.y>=geometry.header.bottom+11,`${label}: top-right FAB clears header controls`);
            assert.ok(geometry.fab.right<=geometry.width-23,`${label}: FAB stays in trailing margin`);
          }else{
            assert.ok(Math.abs(geometry.height - geometry.nav.bottom - expected.bottom) <= 1, `${label}: dock gap matches OS/display mode`);
            assert.ok(Math.abs(geometry.height - geometry.fab.bottom - expected.fabBottom) <= 1, `${label}: FAB consumes the same inset once`);
            assert.ok(Math.abs(geometry.nav.height-expected.height)<=1,`${label}: dock has correct material height`);
          }
          assert.ok(geometry.buttons.every(button => button.height >= 44 && geometry.height - button.bottom >= safe - 1), `${label}: controls clear the full simulated OS inset`);
          assert.ok(geometry.scrollWidth <= geometry.width + 1, `${label}: no horizontal overflow`);
          if (device.width >= 700&&expected.layout!=='rail') {
            assert.ok(geometry.fab.x >= geometry.nav.right + 8, `${label}: separate adjacent FAB`);
            assert.ok(Math.abs(geometry.fab.y + geometry.fab.height / 2 - geometry.nav.y - geometry.nav.height / 2) <= 1, `${label}: centered dock group`);
          } else if(device.width<700)assert.ok(geometry.fab.bottom + 11 <= geometry.nav.y, `${label}: stacked FAB does not overlap navigation`);
        }
        if (device.width < 700) {
          for (const [left, right] of [[44, 0], [0, 44]]) {
            await navigationStage(page, trace, `asymmetric notch left=${left}px right=${right}px`);
            const edges = await page.evaluate(({left, right}) => {
              const root = document.documentElement;
              root.style.setProperty('--gw-safe-left', `${left}px`);
              root.style.setProperty('--gw-safe-right', `${right}px`);
              const nav = document.querySelector('.bottom').getBoundingClientRect();
              const fab = document.querySelector('.fab-glass, .material-fab').getBoundingClientRect();
              const buttons=[...document.querySelectorAll('.bottom button')].map(button=>button.getBoundingClientRect());
              return {left:nav.left,right:nav.right,buttonLeft:buttons[0].left,buttonRight:buttons.at(-1).right,fabRight:fab.right};
            }, {left, right});
            if(material==='android'){assert.equal(edges.left,0);assert.equal(edges.right,device.width);assert.ok(edges.buttonLeft>=left&&edges.buttonRight<=device.width-right,`${label}: Flat controls clear asymmetric notch`);}
            else assert.ok(edges.left >= left && edges.right <= device.width - right, `${label}: centered capsule clears an asymmetric notch`);
            assert.ok(edges.fabRight <= device.width - right, `${label}: FAB clears the right notch`);
          }
          await page.evaluate(() => {
            document.documentElement.style.removeProperty('--gw-safe-left');
            document.documentElement.style.removeProperty('--gw-safe-right');
          });
        }
        if (device.os !== 'none') {
          await navigationStage(page, trace, 'keyboard open');
          await page.evaluate(() => {
            const input = document.createElement('input'); input.id = 'navigation-qa-input'; input.setAttribute('aria-label', 'Navigation QA input');
            document.querySelector('main').prepend(input); input.focus();
            window.visualViewport.height = Math.max(180, innerHeight - 300);
            window.visualViewport.dispatchEvent(new Event('resize'));
            window.__gwNavigationQA.log('keyboard-open-dispatched');
          });
          await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'true');
          assert.equal(await page.locator('.bottom').isVisible(), false, `${label}: dock does not obscure keyboard entry`);
          assert.equal(await page.locator('.fab-glass, .material-fab').isVisible(), false);
          await navigationStage(page, trace, 'keyboard dismissal');
          const dismissal = await page.evaluate(() => {
            const input = document.getElementById('navigation-qa-input');
            window.visualViewport.height = innerHeight;
            window.visualViewport.dispatchEvent(new Event('resize'));
            window.__gwNavigationQA.log('keyboard-dismissal-dispatched');
            requestAnimationFrame(() => window.__gwNavigationQA.log('keyboard-dismissal-animation-frame'));
            return {inputPresent: !!input?.isConnected, focused: document.activeElement === input};
          });
          assert.deepEqual(dismissal, {inputPresent: true, focused: true}, `${label}: dismissal retains the focused input`);
          // First prove viewport dismissal with text entry still focused. Removing
          // the input here mixes focus-removal and viewport events, and could let
          // !editable clear the keyboard flag without testing restored geometry.
          await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'false');
          await navigationStage(page, trace, 'navigation restored after keyboard dismissal');
          await page.getByRole('navigation', {name: 'Main navigation'}).waitFor({state: 'visible'});
          assert.equal(await page.evaluate(() => document.activeElement === document.getElementById('navigation-qa-input')), true,
            `${label}: viewport restoration alone clears keyboard treatment`);
          await page.evaluate(() => {
            const input = document.getElementById('navigation-qa-input');input.blur();input.remove();
            window.__gwNavigationQA.log('keyboard-input-removed');
          });
        }
        await navigationStage(page, trace, 'case screenshot');
        await page.screenshot({path: `${output}/${label}.png`});
        results.push({device: device.name, material, theme, mode, status: 'passed'});
      } catch (error) {
        results.push({device: device.name, material, theme, mode, status: 'failed', stage: current.trace?.stage, error: String(error.message).slice(0,4000)});
        if (current.page && current.trace) throw await captureNavigationFailure(current.page, current.trace, error);
        throw error;
      } finally { await current.context?.close(); }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({results, errors}));
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({results, errors}, null, 2));
  await browser.close();
}

