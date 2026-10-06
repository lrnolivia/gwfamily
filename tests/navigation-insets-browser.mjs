// Hosted-only geometry regression. Run after build against the isolated static
// preview on port 4173. Simulated UA/insets/keyboard cannot replace device QA.
import {chromium, webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {initialState, PREVIEW_KEY} from '../src/data-adapter.js';
import {navigationInsetMetrics} from '../src/navigation-insets.js';

if (!process.env.CI && process.env.GW_HOSTED_BROWSER_QA !== '1') {
  throw new Error('Navigation browser QA runs only in the authorized hosted CI environment.');
}
const base = process.env.GW_NAVIGATION_URL || 'http://127.0.0.1:4173';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), 'Only the isolated hosted preview may be used.');
const output = 'docs/navigation-qa', results = [], errors = [];
const engine = process.env.GW_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless: true});
await mkdir(output, {recursive: true});
const devices = [
  {name: 'iphone', os: 'ios', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', touch: 5},
  {name: 'ipad-desktop-ua', os: 'ios', width: 768, height: 1024, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform: 'MacIntel', touch: 5},
  {name: 'android', os: 'android', width: 390, height: 844, userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l', touch: 5},
  {name: 'iphone-landscape', os: 'ios', width: 844, height: 390, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', touch: 5},
  {name: 'mac-desktop', os: 'none', width: 768, height: 1024, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform: 'MacIntel', touch: 0},
];
const state = initialState(); state.onboarding = 'done';

async function open(device, material, theme, mode) {
  const context = await browser.newContext({viewport: {width: device.width, height: device.height},
    userAgent: device.userAgent, hasTouch: device.touch > 0, reducedMotion: 'reduce', serviceWorkers: 'block'});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  // No external requests or live data. Only in-memory/localStorage preview data.
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.addInitScript(({device, material, theme, mode, state, key}) => {
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
    localStorage.setItem('gw-platform', material);
    localStorage.setItem('gw-theme', theme);
    localStorage.setItem('gw-preview-notice:v1', 'seen');
    localStorage.setItem('gw-install-dismissed', 'true');
  }, {device, material, theme, mode, state, key: PREVIEW_KEY});
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  await page.getByRole('navigation', {name: 'Main navigation', exact: true}).waitFor();
  await page.waitForFunction(() => !!document.documentElement.dataset.mobileOs);
  const attributes = await page.evaluate(() => ({...document.documentElement.dataset}));
  assert.equal(attributes.mobileOs, device.os);
  assert.equal(attributes.displayMode, mode);
  assert.equal(attributes.platform, material);
  return {context, page};
}

try {
  for (const device of devices) for (const material of ['ios', 'android']) {
    for (const theme of ['light', 'dark']) for (const mode of ['browser', 'standalone']) {
      const {context, page} = await open(device, material, theme, mode);
      const label = `${device.name}-${material}-${theme}-${mode}`;
      try {
        for (const safe of [0, 21, 34]) {
          await page.evaluate(value => document.documentElement.style.setProperty('--gw-safe-bottom', `${value}px`), safe);
          const geometry = await page.evaluate(() => {
            const nav = document.querySelector('.bottom'), fab = document.querySelector('.fab-glass, .material-fab');
            const rect = node => {const r = node.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right};};
            return {nav: rect(nav), fab: rect(fab), buttons: [...nav.querySelectorAll('button')].map(rect), width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth};
          });
          const expected = navigationInsetMetrics({mobileOS: device.os, displayMode: mode, safeAreaBottom: safe, width: device.width});
          assert.ok(Math.abs(geometry.height - geometry.nav.bottom - expected.bottom) <= 1, `${label}: dock gap matches OS/display mode`);
          assert.ok(Math.abs(geometry.height - geometry.fab.bottom - expected.fabBottom) <= 1, `${label}: FAB consumes the same inset once`);
          assert.ok(geometry.buttons.every(button => button.height >= 44 && geometry.height - button.bottom >= safe - 1), `${label}: controls clear the full simulated OS inset`);
          assert.ok(geometry.scrollWidth <= geometry.width + 1, `${label}: no horizontal overflow`);
          if (device.width >= 700) {
            assert.ok(geometry.fab.x >= geometry.nav.right + 8, `${label}: separate adjacent FAB`);
            assert.ok(Math.abs(geometry.fab.y + geometry.fab.height / 2 - geometry.nav.y - geometry.nav.height / 2) <= 1, `${label}: centered dock group`);
          } else assert.ok(geometry.fab.bottom + 11 <= geometry.nav.y, `${label}: stacked FAB does not overlap navigation`);
        }
        if (device.width < 700) {
          for (const [left, right] of [[44, 0], [0, 44]]) {
            const edges = await page.evaluate(({left, right}) => {
              const root = document.documentElement;
              root.style.setProperty('--gw-safe-left', `${left}px`);
              root.style.setProperty('--gw-safe-right', `${right}px`);
              const nav = document.querySelector('.bottom').getBoundingClientRect();
              const fab = document.querySelector('.fab-glass, .material-fab').getBoundingClientRect();
              return {left: nav.left, right: nav.right, fabRight: fab.right};
            }, {left, right});
            assert.ok(edges.left >= left && edges.right <= device.width - right, `${label}: centered capsule clears an asymmetric notch`);
            assert.ok(edges.fabRight <= device.width - right, `${label}: FAB clears the right notch`);
          }
          await page.evaluate(() => {
            document.documentElement.style.removeProperty('--gw-safe-left');
            document.documentElement.style.removeProperty('--gw-safe-right');
          });
        }
        if (device.os !== 'none') {
          await page.evaluate(() => {
            const input = document.createElement('input'); input.id = 'navigation-qa-input'; input.setAttribute('aria-label', 'Navigation QA input');
            document.querySelector('main').prepend(input); input.focus();
            window.visualViewport.height = Math.max(180, innerHeight - 300);
            window.visualViewport.dispatchEvent(new Event('resize'));
          });
          await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'true');
          assert.equal(await page.locator('.bottom').isVisible(), false, `${label}: dock does not obscure keyboard entry`);
          assert.equal(await page.locator('.fab-glass, .material-fab').isVisible(), false);
          await page.evaluate(() => {
            window.visualViewport.height = innerHeight;
            window.visualViewport.dispatchEvent(new Event('resize'));
            document.getElementById('navigation-qa-input').remove();
          });
          await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'false');
          await page.getByRole('navigation', {name: 'Main navigation'}).waitFor({state: 'visible'});
        }
        await page.screenshot({path: `${output}/${label}.png`});
        results.push({device: device.name, material, theme, mode, status: 'passed'});
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({results, errors}));
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({results, errors}, null, 2));
  await browser.close();
}
