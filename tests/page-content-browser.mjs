import './test-environment-guard.mjs';
import {settlePointerTarget} from './browser-transition-readiness.mjs';
import {pageContentPayload} from '../src/page-content-model.js';
import {validatePhotoFrame} from '../src/photo-framing-model.js';
import {validateCardLayouts} from '../src/card-content-layout-model.js';
// Hosted-only shared-page editor checks. Start the isolated port-4176 fixture.
// All accounts, copy, posts and uploaded media below are synthetic test data.
// Authoring or syntax-checking this file is not evidence of a browser pass.
import {chromium, webkit, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {createTestPng} from './png-fixtures.mjs';
import {SHARED_PAGE_SCHEMA, sharedPageDefaults} from '../src/shared-content-schema.js';
import {readPageSavePaint, pageSaveContrast, parsePaintColor} from './page-save-contrast.mjs';
import {cmsFailureAnnotation, installCmsNotificationTrace} from './page-content-browser-diagnostics.mjs';

if (!process.env.CI && process.env.GW_HOSTED_BROWSER_QA !== '1') {
  throw new Error('Shared-page browser QA runs only in the authorized hosted CI environment.');
}
const base = process.env.GW_PAGE_CONTENT_URL || 'http://127.0.0.1:4176';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):4176$/.test(base), 'Use the isolated hosted page-content fixture on port 4176.');
const output = 'docs/page-content-qa';
const engineName = process.env.GW_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const results = [], errors = [], sessions = [], writes = [];
const browserReads = new WeakMap(), traceStarted = Date.now();
let currentCheck = 'fixture setup';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch({headless: true});
await mkdir(output, {recursive: true});

// A valid, silent 1-second 32×32 H.264 baseline MP4, generated from a green
// color source. Embedded so hosted runs need neither external media nor ffmpeg.
const videoBytes = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAM2bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAmF0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHZbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAKABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABhG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAURzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZCWwEQAAAAwBAAAADAoPEiZIBAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABWoAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAFAAAIAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAFAAAAAQAAAChzdHN6AAAAAAAAAAAAAAAFAAACjgAAAAoAAAAKAAAACgAAAAkAAAAUc3RjbwAAAAAAAAABAAADZgAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDMAAAAIZnJlZQAAAr1tZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49NSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAABZliIQEfEYoAAlvxwABB5jgACRzJ114AAAABkGaOAj5YAAAAAZBmlQCPlgAAAAGQZpgEPLAAAAABUGagD/L', 'base64');
const uploadPhoto = (name, width = 32) => ({name, mimeType: 'image/png', buffer: createTestPng(width, 24)});
const field = (page, key) => page.locator(`[data-page-field="${key}"]`);
const toolbar = page => page.locator('.page-edit-toolbar');
const saveStatus = page => toolbar(page).locator('.page-edit-mode-label').getByRole('status');
const modeDone = page => toolbar(page).locator('.page-mode-done');
// API probes preserve the complete normalized snapshot, including lock state,
// layout order and Markdown source formats. Output URLs never become authority.
const contentPayload = pageContentPayload;
// Nested page layouts (Family contains Memories) each own a hero; match only the
// hero whose closest owning page is the requested schema key.
const ownedBy = key => `ancestor::*[@data-panel-page][1][@data-panel-page="${key}"]`;
const primaryHero = (page, key) => page.locator(`xpath=//section[@data-panel-id="hero" and ${ownedBy(key)}]`);

async function check(name, run) {
  currentCheck = name;
  await run();
  results.push({check: name, status: 'passed'});
  console.log('PAGE CONTENT PASS:', name);
}
// Keep a bounded, body-free record of browser traffic and document lifecycle.
// APIRequestContext permission probes deliberately do not enter this stream.
function observeBrowser(page, label) {
  const trace = {sequence: 0, eventSequence: 0, lastDrained: 0, documentEpoch: 0, documentTimeOrigin: null, documentUrl: null, navigations: [], events: [], droppedEvents: 0, reads: [], pending: new Map()};
  const requests = new WeakMap();
  trace.log = (type, detail = {}) => {
    trace.events.push({eventSequence: ++trace.eventSequence, ms: Date.now() - traceStarted, check: currentCheck, document: page.url(), documentEpoch: trace.documentEpoch, type, ...detail});
    if (trace.events.length > 600) {trace.events.shift(); trace.droppedEvents++;}
  };
  trace.beginNavigation = target => {
    const navigation = {sourceEpoch: trace.documentEpoch, sourceTimeOrigin: trace.documentTimeOrigin, target, startedMs: Date.now() - traceStarted, startedEvent: trace.eventSequence + 1};
    trace.navigations.push(navigation);
    if (trace.navigations.length > 100) trace.navigations.shift();
    trace.log('navigation-start', {...navigation, pending: [...trace.pending.values()].map(read => ({...read}))});
  };
  const documentAddress = url => {const value = new URL(url); value.hash = ''; return value.href;};
  const snapshot = () => ({pending: [...trace.pending.values()].map(value => ({...value})), navigations: trace.navigations.slice(-3).map(value => ({...value})), recentEvents: trace.events.slice(-30)});
  page.on('request', request => {
    const url = new URL(request.url()), sameOriginApi = url.origin === base && url.pathname.startsWith('/api/');
    if (!sameOriginApi && !request.isNavigationRequest()) return;
    const navigation = trace.navigations.at(-1);
    let requestFrame;
    try {requestFrame = request.frame();} catch { /* Service-worker requests have no frame identity. */ }
    // A frame can commit before its init-script console event is delivered.
    // Do not attribute a request in that gap to the outgoing document.
    const knownDocument = requestFrame === page.mainFrame() && trace.documentEpoch > 0 && documentAddress(trace.documentUrl) === documentAddress(page.url()) && !(navigation?.sourceEpoch === trace.documentEpoch && navigation.frameNavigatedMs !== undefined && navigation.targetEpoch === undefined);
    const entry = {id: ++trace.sequence, url: url.href, path: url.pathname, method: request.method(), resource: request.resourceType(), navigation: request.isNavigationRequest(), startedMs: Date.now() - traceStarted, startedEvent: trace.eventSequence + 1, document: page.url(), documentEpoch: knownDocument ? trace.documentEpoch : null, documentTimeOrigin: knownDocument ? trace.documentTimeOrigin : null};
    requests.set(request, entry);
    if (sameOriginApi && entry.method === 'GET' && ['fetch', 'xhr'].includes(entry.resource)) {
      trace.reads.push(entry); trace.pending.set(entry.id, entry);
      // Requests are also recorded in events; retain only recent read contracts.
      if (trace.reads.length > 300) trace.reads.shift();
    }
    trace.log('request', {...entry});
  });
  page.on('response', response => {
    const entry = requests.get(response.request()); if (!entry) return;
    entry.status = response.status(); entry.responseMs = Date.now() - traceStarted;
    const headers = response.headers();
    trace.log('response', {id: entry.id, url: response.url(), status: entry.status, headers: Object.fromEntries(Object.entries(headers).filter(([name]) => ['content-type', 'cache-control', 'location', 'content-security-policy', 'access-control-allow-origin'].includes(name)))});
  });
  for (const event of ['requestfinished', 'requestfailed']) page.on(event, request => {
    const entry = requests.get(request); if (!entry) return;
    entry.finishedMs = Date.now() - traceStarted;
    entry.finishedEvent = trace.eventSequence + 1;
    if (event === 'requestfailed') entry.failure = request.failure()?.errorText || 'Unknown request failure';
    trace.pending.delete(entry.id);
    trace.log(event, {...entry});
  });
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return;
    const navigation = trace.navigations.at(-1);
    if (navigation && frame.url() === navigation.target && navigation.frameNavigatedMs === undefined) {
      navigation.frameNavigatedMs = Date.now() - traceStarted;
      navigation.frameNavigatedEvent = trace.eventSequence + 1;
    }
    trace.log('main-frame-navigated', {url: frame.url()});
  });
  page.on('domcontentloaded', () => trace.log('domcontentloaded'));
  page.on('load', () => trace.log('load'));
  page.on('console', message => {
    if (message.text().startsWith('__GW_CMS_LIFECYCLE__')) {
      try {
        const detail = JSON.parse(message.text().slice('__GW_CMS_LIFECYCLE__'.length));
        if (detail.event === 'new-document' && Number.isFinite(detail.timeOrigin) && typeof detail.url === 'string' && detail.timeOrigin !== trace.documentTimeOrigin) {
          const previousEpoch = trace.documentEpoch, previousTimeOrigin = trace.documentTimeOrigin;
          trace.documentEpoch++; trace.documentTimeOrigin = detail.timeOrigin; trace.documentUrl = detail.url;
          const navigation = trace.navigations.at(-1);
          if (navigation?.sourceEpoch === previousEpoch && navigation.sourceTimeOrigin === previousTimeOrigin && navigation.target === detail.url && navigation.targetEpoch === undefined) {
            navigation.targetEpoch = trace.documentEpoch;
            navigation.targetTimeOrigin = detail.timeOrigin;
            navigation.documentStartedMs = Date.now() - traceStarted;
            navigation.documentStartedEvent = trace.eventSequence + 1;
          }
        }
        // Only known, bounded lifecycle metadata enters the diagnostic stream.
        trace.log('document-lifecycle', {event: String(detail.event || '').slice(0, 80), url: String(detail.url || '').slice(0, 2000),
          timeOrigin: detail.timeOrigin, documentMs: detail.documentMs, readyState: String(detail.readyState || '').slice(0, 40),
          ...(Number.isSafeInteger(detail.request) ? {request: detail.request, aborted: detail.aborted === true} : {}),
          ...(detail.message === undefined ? {} : {message: String(detail.message).slice(0, 2000), filename: String(detail.filename || '').slice(0, 2000), line: detail.line, column: detail.column}),
          ...(detail.stack === undefined ? {} : {stack: String(detail.stack).slice(0, 4000)})});
      }
      catch {trace.log('unreadable-lifecycle-record');}
    } else if (message.type() === 'error') trace.log('console-error', {text: message.text().slice(0, 2000), location: message.location()});
  });
  page.on('pageerror', error => {
    const detail = {user: label, error: error.message, name: error.name, stack: error.stack, ms: Date.now() - traceStarted, check: currentCheck, document: page.url(), documentEpoch: trace.documentEpoch, documentTimeOrigin: trace.documentTimeOrigin, ...snapshot()};
    errors.push(detail); // No pageerror is filtered, including access-control errors.
    trace.log('pageerror', {error: error.message, stack: error.stack});
    console.error('CMS BROWSER ERROR', JSON.stringify(detail));
    console.log(cmsFailureAnnotation(detail, trace));
  });
  browserReads.set(page, trace);
  return trace;
}
function isSupersededDocumentCancellation(read, trace) {
  // Cancellation wording alone is never evidence of teardown. Require the
  // outgoing document's identity, an explicit navigation, a replacement init
  // script plus main-frame commit, and a failure observed after navigation began.
  // HTTP/auth failures and all pageerrors remain failures even during teardown.
  if (!['Load request cancelled', 'net::ERR_ABORTED'].includes(read.failure) || (read.status !== undefined && !(read.status >= 200 && read.status < 300))) return false;
  return read.documentEpoch > 0 && trace.navigations.some(navigation =>
    navigation.sourceEpoch === read.documentEpoch && navigation.sourceTimeOrigin === read.documentTimeOrigin &&
    navigation.targetEpoch > read.documentEpoch && navigation.targetEpoch <= trace.documentEpoch &&
    navigation.targetTimeOrigin !== read.documentTimeOrigin && navigation.frameNavigatedMs !== undefined &&
    read.startedEvent < navigation.documentStartedEvent && read.startedMs <= navigation.documentStartedMs &&
    read.finishedEvent > navigation.startedEvent && read.finishedMs >= navigation.startedMs);
}
async function settleBrowserReads(page, {since, required = []} = {}) {
  const trace = browserReads.get(page), after = since ?? trace.lastDrained;
  let drainedThrough = after;
  const assertSuccessfulReads = () => {
    const failed = trace.reads.filter(read => read.id > after && read.finishedMs !== undefined && (read.failure || !(read.status >= 200 && read.status < 300)) && !isSupersededDocumentCancellation(read, trace));
    assert.deepEqual(failed, [], 'Normal same-origin browser reads succeed; deliberate permission probes use APIRequestContext.');
  };
  await expect.poll(() => {
    assertSuccessfulReads();
    const readiness = {
      missing: required.filter(path => !trace.reads.some(read => read.id > after && read.documentEpoch === trace.documentEpoch && trace.documentEpoch > 0 && read.path === path && read.finishedMs !== undefined && !read.failure && read.status >= 200 && read.status < 300)),
      pending: [...trace.pending.values()].map(read => read.path),
    };
    // Requests can arrive while the assertion promise resolves. Only advance
    // through the sequence whose completed bodies this exact probe observed.
    if (!readiness.missing.length && !readiness.pending.length) drainedThrough = trace.sequence;
    return readiness;
  }, {message: 'Authenticated current-document reads succeed before the next document navigation.', timeout: 15000}).toEqual({missing: [], pending: []});
  assertSuccessfulReads();
  for (const read of trace.reads.filter(read => read.id > after && read.id <= drainedThrough && isSupersededDocumentCancellation(read, trace))) trace.log('superseded-document-read-cancelled', {...read});
  trace.lastDrained = drainedThrough;
}
async function person(id, {width = 390, height = 844, motion = 'reduce', active = true, label = id, platform = 'android', theme = 'dark'} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: motion});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const trace = observeBrowser(page, label);
  sessions.push({id: label, context, page, trace});
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/page-content/') && request.method() !== 'GET') {
      writes.push({user: label, path: new URL(request.url()).pathname, method: request.method(), body: request.postDataJSON()});
    }
  });
  await page.addInitScript(installCmsNotificationTrace);
  await page.addInitScript(({platform, theme}) => {
    const emit = (event, detail = {}) => {if (window === window.top) console.log('__GW_CMS_LIFECYCLE__' + JSON.stringify({event, url: location.href, timeOrigin: performance.timeOrigin, documentMs: performance.now(), readyState: document.readyState, ...detail}));};
    emit('new-document');
    for (const event of ['beforeunload', 'pagehide', 'pageshow']) addEventListener(event, () => emit(event));
    // Observe actual window exceptions/rejections without swallowing them.
    addEventListener('error', event => emit('window-error', {message: event.message, filename: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack}));
    addEventListener('unhandledrejection', event => emit('unhandledrejection', {message: String(event.reason?.message || event.reason), stack: event.reason?.stack}));
    localStorage.setItem('gw-install-dismissed', 'true');
    localStorage.setItem('gw-preview-notice:v1', 'seen');
    localStorage.setItem('gw-platform', platform);
    localStorage.setItem('gw-theme', theme);
  }, {platform, theme});
  trace.log('signin-start');
  const signinTarget = id ? `${base}/__test/signin?user=${encodeURIComponent(id)}` : base;
  trace.beginNavigation(signinTarget);
  await page.goto(signinTarget);
  if (active && id) {
    await page.getByRole('navigation', {name: 'Main navigation', exact: true}).waitFor();
    await settleBrowserReads(page, {required: ['/api/state', '/api/page-content/home', '/api/page-content/global', '/api/conversations', '/api/conversations/recipients']});
  } else await expect(page.locator('.onboard')).toBeVisible();
  trace.log('signin-ready');
  return page;
}
async function api(page, path, {method = 'GET', data} = {}) {
  const response = await page.request.fetch(base + path, {
    method, headers: {Origin: base, 'Content-Type': 'application/json'}, ...(data === undefined ? {} : {data}),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = {raw}; }
  return {status: response.status(), body, headers: response.headers()};
}
async function ok(page, path, options) {
  const result = await api(page, path, options);
  assert.ok(result.status >= 200 && result.status < 300, `${options?.method || 'GET'} ${path}: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}
const record = (page, key = 'home') => ok(page, '/api/page-content/' + key);
async function patch(page, key, content, expectedRevision) {
  return ok(page, '/api/page-content/' + key, {method: 'PATCH', data: {requestId: randomUUID(), expectedRevision, content: contentPayload(content)}});
}
function sharedPageRoute(route, id) {
  return route === 'memories' ? 'family?tab=memories' : route + (id ? '/' + encodeURIComponent(id) : '');
}
async function navigate(page, route, id) {
  const trace = browserReads.get(page);
  // A visible main also exists during onboarding. Previously the non-leader
  // absence assertions could pass there and immediately tear down new reads.
  await settleBrowserReads(page);
  const since = trace.lastDrained, target = `${base}/?qa=${randomUUID()}#/${sharedPageRoute(route, id)}`;
  trace.beginNavigation(target);
  await page.goto(target, {waitUntil: 'domcontentloaded'});
  await expect(page).toHaveURL(target);
  // The authenticated header also exists on detail pages without bottom nav.
  await expect(page.locator('.app:not(.is-onboarding) > header')).toBeVisible();
  await expect(page.locator('.onboard')).toHaveCount(0);
  if (Object.hasOwn(SHARED_PAGE_SCHEMA, route)) await expect(page.getByRole('navigation', {name: 'Main navigation', exact: true})).toBeVisible();
  const required = ['/api/state', '/api/conversations', '/api/conversations/recipients', '/api/page-content/global'];
  if (Object.hasOwn(SHARED_PAGE_SCHEMA, route)) required.push('/api/page-content/' + route);
  if (route === 'family') required.push('/api/directory', '/api/page-content/people');
  if (route === 'memories') {
    required.push('/api/page-content/family');
    await expect(page.getByRole('tab', {name: 'Memories', exact: true})).toHaveAttribute('aria-selected', 'true');
  }
  await settleBrowserReads(page, {since, required});
  trace.log('navigation-ready', {target});
}
async function edit(page) {
  await toolbar(page).getByRole('button', {name: /^(Edit page|Resume page edits)$/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-page-edit-mode', 'true');
  await expect(toolbar(page).getByText(/^Editing /)).toBeVisible();
}
async function assertSavePaint(page, {theme, platform, disabled}) {
  const button = modeDone(page);
  if (disabled) await expect(button).toBeDisabled(); else await expect(button).toBeEnabled();
  await expect.poll(async () => pageSaveContrast(await button.evaluate(readPageSavePaint)), {message: 'Save label contrast uses the actual painted tint and composited opacity.'}).toBeGreaterThanOrEqual(4.5);
  const paint = await button.evaluate(readPageSavePaint);
  assert.equal(paint.theme, theme); assert.equal(paint.platform, platform); assert.equal(paint.disabled, disabled);
  assert.equal(paint.text.trim(), 'Done'); assert.equal(paint.hostOpacity, 1);
  assert.deepEqual(parsePaintColor(paint.foreground), parsePaintColor(paint.hostForeground), 'The innermost label inherits the state foreground.');
  assert.equal(paint.tintBackground, null, 'Editor actions use a solid native control in either material.');
  if (paint.tintBackground !== null) {
    assert.equal(paint.tintOpacity, 1);
    assert.deepEqual(parsePaintColor(paint.tintBackground), parsePaintColor(paint.hostBackground), 'The opaque tint and host paint the same state surface.');
  }
  return {...paint, contrast: pageSaveContrast(paint)};
}
async function editText(page, key, value, {finish = true} = {}) {
  const [pageId, name] = key.split('.'), label = SHARED_PAGE_SCHEMA[pageId].fields[name].label;
  const root = field(page, key);
  const input = root.getByRole('textbox', {name: label, exact: true});
  const trigger = root.getByRole('button', {name: 'Edit ' + label, exact: true});
  try {
    if (!await input.count()) {
      if (key === 'global.footerTagline') await settlePointerTarget(trigger);
      await trigger.click();
    }
    await expect(input).toBeVisible();
    await input.fill(value);
    if (finish) {
      await root.getByRole('button', {name: 'Finish editing ' + label, exact: true}).click();
      await expect(input).toHaveCount(0);
      await expect(trigger).toBeFocused(); // Finish restores focus on the next animation frame.
    }
    return input;
  } catch (error) {
    const diagnostic=await root.evaluate(element=>({url:location.href,html:element.outerHTML.slice(0,6000),active:document.activeElement?.outerHTML.slice(0,1000),rect:element.getBoundingClientRect().toJSON(),hit:(()=>{const r=element.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,1000)})()}())).catch(()=>({url:page.url(),missing:true}));
    console.error('GW EDIT TRANSITION '+JSON.stringify({key,diagnostic}));
    throw error;
  }
}
async function save(page) {
  const retry=toolbar(page).getByRole('button',{name:'Try saving again',exact:true});
  if(await retry.isVisible())await retry.click();
  await expect(saveStatus(page)).toHaveText(/^(Saved for the family|Changes save automatically)$/);
  await expect(toolbar(page).locator('.page-editor-error')).toHaveCount(0);
}
async function openHistory(page){
 const tools=toolbar(page).locator('.page-edit-tools');
 if(!await tools.getAttribute('open'))await tools.locator('summary').click();
 await tools.getByRole('button',{name:'View page history',exact:true}).click();
 await expect(tools).not.toHaveAttribute('open','');
}
async function mediaPanel(page, key = 'home') {
  await unlockHero(page, key);
  await field(page, key + '.hero').getByRole('button', {name: 'Edit ' + SHARED_PAGE_SCHEMA[key].label + ' page media', exact: true}).click();
  const imageEditor = page.locator('.page-object-tools').getByRole('region', {name: 'Photo framing', exact: true});
  await expect(imageEditor.or(page.getByRole('region', {name: 'Page media', exact: true}))).toBeVisible();
  if (await imageEditor.count()) await imageEditor.getByRole('button', {name: 'Replace media', exact: true}).click();
  const panel = page.getByRole('region', {name: 'Page media', exact: true});
  await expect(panel).toBeVisible();
  await expect(page.locator('.page-object-tools'), 'Media has one image task outside the canvas.').toHaveCount(1);
  return panel;
}
async function togglePanelProtection(page, panel, locked) {
 await expect(panel,'Protection targets exactly one panel').toHaveCount(1);
 const name=locked?/^Lock /:/^Unlock /,inline=panel.getByRole('button',{name});
 if(await inline.count()){await inline.click();return}
 const title=await panel.getAttribute('data-panel-title');assert.ok(title,'Target panel declares its own title');
 await panel.getByRole('button',{name:'Panel options for '+title,exact:true}).click();
 const inspector=page.locator('.page-object-tools');
 await inspector.getByRole('button',{name}).click();
 await inspector.getByRole('button',{name:'Close object tools',exact:true}).click();
}
async function unlockHero(page, key) {
  const optional=page.locator(`xpath=//*[contains(concat(' ',normalize-space(@class),' '),' page-optional-media ') and ${ownedBy(key)}]`);
  if(await optional.count()&&!await optional.evaluate(node=>node.open))await optional.locator('summary').click();
  const hero = primaryHero(page, key);
  await expect(hero).toHaveCount(1);
  if (await hero.getAttribute('data-panel-locked') === 'true') {
    await expect(hero.getByRole('button', {name: /^Edit /})).toHaveCount(0);
    await expect(hero.locator('[data-page-field] .page-copy-input, [contenteditable="true"]')).toHaveCount(0);
    await togglePanelProtection(page,hero,false);
  }
  await expect(hero).not.toHaveAttribute('data-panel-locked', 'true');
  await expect(hero).not.toHaveAttribute('data-panel-locked','true');
}
async function uploadPageMedia(page, dialog, picker, files) {
  const uploadStatus = dialog.getByRole('status', {name: 'Page media upload', exact: true});
  const selected = Array.isArray(files) ? files : [files];
  let entered = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = async route => {if (route.request().method() === 'POST') {entered = true; await gate;} await route.continue();};
  await page.route('**/api/media', handler);
  try {
    await picker.setInputFiles(files);
    await expect.poll(() => entered).toBe(true);
    await expect(uploadStatus).toHaveText('Uploading 1 of ' + selected.length + '…');
    await expect(dialog.getByRole('status')).toHaveCount(1);
    await expect(dialog.getByText('Saving…', {exact: true})).toHaveCount(0);
    await expect(picker).toBeDisabled();
    await expect(dialog.getByRole('button', {name: 'Apply media', exact: true})).toBeDisabled();
    await expect(modeDone(page)).toBeDisabled();
    await expect(saveStatus(page)).toHaveText('Preparing media…');
    await expect(page.locator('.page-object-tools[open]')).toHaveCount(1);
    for (const name of ['Photo', 'Gallery', 'Video']) await expect(dialog.getByRole('button', {name, exact: true})).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(uploadStatus).toHaveText('Uploading 1 of ' + selected.length + '…');
    release();
    await expect(uploadStatus).toContainText('Uploaded privately.');
    await expect(uploadStatus).toContainText('Finish choosing media to use ' + (selected.length === 1 ? 'it.' : 'these files.'));
    await expect(dialog.getByRole('status')).toHaveCount(1);
    await expect(picker).toBeEnabled();
    await expect(dialog.getByRole('button', {name: 'Apply media', exact: true})).toBeEnabled();
    await expect(modeDone(page)).toBeEnabled();
    await expect(modeDone(page)).toBeEnabled();
  } finally {release(); await page.unrouteAll({behavior:'wait'});}
}
async function closeEditorPanel(page, name) {
  const panel = page.getByRole('region', {name, exact: true});
  await panel.getByRole('button', {name: name === 'Page media' ? 'Apply media' : 'Close history', exact: true}).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function editorPanelFits(page, panel) {
  await expect(panel).toBeVisible();
  const surface=await panel.evaluate(element=>({media:element.getAttribute('aria-label')==='Page media',inMain:!!element.closest('main'),tools:!!element.closest('dialog.page-object-tools')}));
  if(surface.media){assert.equal(surface.inMain,false,'Media edits stay outside the canvas.');assert.equal(surface.tools,true,'Media uses the shared object-tools surface.');const compact=await page.evaluate(()=>innerWidth<=700);await expect.poll(()=>panel.evaluate(element=>element.closest('dialog')?.matches(':modal')||false),{message:'Media uses a protected Mobile sheet and a movable Full pane.'}).toBe(compact)}
  else assert.equal(surface.inMain&&!surface.tools,true,'History retains its ordinary inline page surface.');
  const geometry = await panel.evaluate(element => ({box: element.getBoundingClientRect().toJSON(), width: innerWidth}));
  assert.ok(geometry.box.width > 0 && geometry.box.left >= -1 && geometry.box.right <= geometry.width + 1,
    'The inline editor fits the reading width: ' + JSON.stringify(geometry));
  // Long inline editors scroll with the page. Check every enabled control can
  // actually be brought fully into view, including on a short landscape screen.
  const controls = panel.locator('button:not([disabled]), input:not([disabled]):not(.sr-only), select:not([disabled])');
  assert.ok(await controls.count(), 'The inline editor has reachable controls.');
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    await control.scrollIntoViewIfNeeded();
    // A minimal scroll can leave a fractional pixel clipped at the viewport
    // edge. Center the ordinary page scroll, then retain the full-fit assertion.
    await control.evaluate(element => element.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}));
    try {
      await expect(control).toBeInViewport({ratio: 1});
    } catch (error) {
      console.error('Inline editor control geometry', JSON.stringify(await control.evaluate(element => {
        const ancestors = [];
        for (let node = element; node && ancestors.length < 8; node = node.parentElement) {
          const style = getComputedStyle(node);
          ancestors.push({tag: node.tagName, className: node.className, box: node.getBoundingClientRect().toJSON(),
            overflowX: style.overflowX, overflowY: style.overflowY, scrollTop: node.scrollTop, scrollLeft: node.scrollLeft});
        }
        return {label: element.getAttribute('aria-label') || element.textContent, viewport: {width: innerWidth, height: innerHeight}, ancestors};
      })));
      throw error;
    }
  }
  await noClip(page);
}
async function assertNoPageEditor(page) {
  await expect(page.locator('[data-page-field] .page-copy-input, .page-media-edit, .page-edit-entry-button, .page-edit-modebar')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-page-edit-mode', 'true');
}
async function noClip(page) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll('main input, main select, main textarea, main button, dialog, dialog input, dialog select, dialog button, .choice-popover[data-open="true"]')]
      .filter(element => element.getClientRects().length && !element.classList.contains('sr-only') && !element.closest('[inert]') && !element.closest('.profile-swatches-scroll'))
      .map(element => ({label: element.getAttribute('aria-label') || element.textContent?.slice(0, 100), box: element.getBoundingClientRect().toJSON()}))
      .filter(({box}) => box.left < -1 || box.right > innerWidth + 1),
  }));
  assert.ok(geometry.scroll <= geometry.width + 1 && !geometry.clipped.length, 'Controls fit the viewport: ' + JSON.stringify(geometry));
}
async function panelFits(page, selector) {
  const geometry = await page.locator(selector).evaluate(element => {
    const viewport = window.visualViewport, css = getComputedStyle(element);
    return {box: element.getBoundingClientRect().toJSON(), left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
      width: viewport?.width || innerWidth, height: viewport?.height || innerHeight,
      positioning: {left: css.left, right: css.right, top: css.top, transform: css.transform}};
  });
  assert.ok(geometry.box.left >= geometry.left - 1 && geometry.box.right <= geometry.left + geometry.width + 1 && geometry.box.top >= geometry.top - 1 && geometry.box.bottom <= geometry.top + geometry.height + 1,
    'The panel remains within the visible viewport: ' + JSON.stringify(geometry));
}
async function noImageDesaturation(page) {
  const styles = await page.locator('.page-editable-media img').evaluateAll(images => images.flatMap(image => {
    const result = [];
    for (let element = image; element; element = element.parentElement) {
      const css = getComputedStyle(element);
      result.push({element: element.tagName + '.' + element.className, filter: css.filter, opacity: css.opacity});
    }
    return result;
  }));
  assert.ok(styles.length, 'A real image is present for edit-mode color checks.');
  assert.ok(styles.every(style => style.filter === 'none' && style.opacity === '1'), 'Edit mode does not desaturate or fade image pixels: ' + JSON.stringify(styles));
}

let failure;
try {
  const alice = await person('alice');
  const bob = await person('bob', {width: 1280, motion: 'no-preference'});
  const owner = await person('owner', {width: 768, motion: 'no-preference'});
  const otherOwner = await person('owner', {width: 390, label: 'owner-second-device'});
  const anonymous = await person(null, {active: false, label: 'anonymous'});
  const pending = await person('pending', {active: false});
  let firstSaved, firstGallery, fixturePost;
  const initialMembers = (await ok(owner, '/api/state')).members;
  const firstText = 'Synthetic family page saved from one device';

  await check('authenticated family can read; anonymous and pending accounts cannot read shared content or history', async () => {
    for (const [page, id] of [[alice, 'alice'], [bob, 'bob'], [owner, 'owner']]) assert.equal((await ok(page, '/api/state')).selfId, id);
    for (const key of Object.keys(SHARED_PAGE_SCHEMA)) {
      const privateToLeaders = key === 'leader-calendar';
      if (privateToLeaders) for (const member of [alice, bob]) {
        assert.equal((await api(member, '/api/page-content/' + key)).status, 403);
        assert.equal((await api(member, '/api/page-content/' + key + '/revisions')).status, 403);
      }
      const value = await record(privateToLeaders ? owner : alice, key);
      assert.equal(value.canEdit, privateToLeaders, key);
      assert.deepEqual(value.content, sharedPageDefaults(key));
      assert.equal((await api(owner, '/api/page-content/' + key)).headers['cache-control'], 'no-store');
      for (const [page, status] of [[anonymous, 401], [pending, 403]]) {
        assert.equal((await api(page, '/api/page-content/' + key)).status, status);
        assert.equal((await api(page, '/api/page-content/' + key + '/revisions')).status, status);
      }
    }
    assert.equal((await record(owner)).canEdit, true);
  });

  await check('regular members have no editor UI and cannot write, inspect revisions or restore any shared page', async () => {
    for (const key of Object.keys(SHARED_PAGE_SCHEMA)) {
      const path = '/api/page-content/' + key;
      assert.equal((await api(alice, path, {method: 'PATCH', data: {requestId: randomUUID(), expectedRevision: 0, content: sharedPageDefaults(key)}})).status, 403);
      assert.equal((await api(alice, path + '/revisions')).status, 403);
      assert.equal((await api(alice, path + '/restore', {method: 'POST', data: {requestId: randomUUID(), expectedRevision: 0, revision: 0}})).status, 403);
    }
    for (const route of ['home', 'family', 'reunion', 'memories', 'birthdays', 'shop', 'inbox', 'you']) {
      await navigate(alice, route);
      await assertNoPageEditor(alice);
    }
    for (const key of ['welcome', 'profile', 'posts', 'menus', 'password']) assert.equal((await api(owner, '/api/page-content/' + key)).status, 404);
  });

  await check('Leaders enter per-page edit mode and navigation returns to ordinary viewing', async () => {
    for (const route of ['home', 'reunion', 'family', 'memories', 'birthdays', 'shop', 'inbox', 'you']) {
      await navigate(owner, route);
      await expect(toolbar(owner).getByRole('button', {name: 'Edit page', exact: true})).toBeVisible();
      await edit(owner);
      await expect(owner.locator('[data-page-field] .page-copy-target[role="button"]').first()).toBeVisible();
      await expect(owner.locator('header [data-page-field], nav [data-page-field], [role="tablist"] [data-page-field]')).toHaveCount(0);
      await modeDone(owner).click();
      await expect(owner.locator('html')).not.toHaveAttribute('data-page-edit-mode', 'true');
    }
    await navigate(owner, 'home');
    await edit(owner);
    await expect(owner.getByRole('navigation', {name:'Main navigation',exact:true})).toBeHidden();
    await owner.evaluate(()=>{location.hash='/family'});
    await expect(owner).toHaveURL(/#\/family/);
    await expect(owner.locator('html')).not.toHaveAttribute('data-page-edit-mode', 'true');
  });

  await check('Plan and Schedule sections edit independently, retain sidebars and save placement',async()=>{
    for(const [tab,key,panelId,titleField] of [['Plan','reunion-plans','native-rsvp','rsvpTitle'],['Schedule','reunion-calendar','native-events',null]]){
      await navigate(owner,'reunion');await owner.getByRole('tab',{name:tab,exact:true}).click();await edit(owner);
      const layout=owner.locator(`[data-panel-page="${key}"]`),panel=layout.locator(`[data-panel-id="${panelId}"]`);
      // Schedule birthdays moved to Family Calendar; create a real editable
      // sidebar card rather than require an obsolete native birthday panel.
      let customId=null;
      if(tab==='Schedule'){
        await expect(owner.locator('[data-page-field="reunion-calendar.heading"]')).toHaveCount(0);
        const originalIds=(await record(owner,key)).content.panelLayout.panels.map(row=>row.id);
        await owner.getByRole('button',{name:'Add Panel',exact:true}).click();
        const add=owner.getByRole('dialog',{name:'Add Panel',exact:true});await add.getByRole('radio',{name:'Side area',exact:true}).check();await add.getByRole('button',{name:'Add side panel',exact:true}).click();await save(owner);
        customId=(await record(owner,key)).content.panelLayout.panels.find(row=>!originalIds.includes(row.id)).id;
      }
      await expect(layout.locator('.page-panel-zone-side > .page-shared-panel')).not.toHaveCount(0);
      await expect(panel).toBeVisible();
      await expect(panel).not.toHaveAttribute('data-panel-locked','true');
      await togglePanelProtection(owner,panel,true);await save(owner);await expect(panel).toHaveAttribute('data-panel-locked','true');
      await togglePanelProtection(owner,panel,false);await save(owner);await expect(panel).not.toHaveAttribute('data-panel-locked','true');
      const before=titleField?(await record(owner,key)).content.text[titleField]:(await record(owner,key)).content.panelLayout.panels.find(row=>row.id===customId).title;
      const editTitle=async value=>{if(titleField)await editText(owner,key+'.'+titleField,value);else{const custom=layout.locator('[data-panel-id="'+customId+'"]');await custom.getByRole('button',{name:'Edit Panel heading',exact:true}).click();await custom.getByRole('textbox',{name:'Panel heading',exact:true}).fill(value);await custom.getByRole('button',{name:'Finish editing Panel heading',exact:true}).click()}await save(owner)};
      const readTitle=async()=>{const content=(await record(owner,key)).content;return titleField?content.text[titleField]:content.panelLayout.panels.find(row=>row.id===customId).title};
      await editTitle(before+' Synthetic edit');assert.equal(await readTitle(),before+' Synthetic edit');
      await toolbar(owner).locator('.page-edit-tools > summary').click();await toolbar(owner).getByRole('button',{name:'Arrange page',exact:true}).click();
      await panel.getByRole('button',{name:/^Side for /}).click();await save(owner);
      assert.equal((await record(owner,key)).content.panelLayout.panels.find(row=>row.id===panelId).zone,'side');
      await toolbar(owner).getByRole('button',{name:'Reorder panels',exact:true}).click();
      const reorder=owner.getByRole('dialog',{name:'Reorder panels',exact:true}),picker=reorder.getByRole('combobox',{name:'Reunion tab to reorder',exact:true});
      await reorder.getByRole('button',{name:'Mobile',exact:true}).click();await expect(picker).toHaveValue(key);
      if(tab==='Plan')await expect(reorder.locator(`[data-panel-id="${panelId}"] strong`)).toHaveText(before+' Synthetic edit');
      for(const [target,id] of [['reunion','native-plans'],['reunion-plans','native-rsvp'],['reunion-calendar','native-events']]){
        await picker.selectOption(target);await expect(reorder.locator(`[data-panel-id="${id}"]`)).toBeVisible();
      }
      await picker.selectOption(key);
      const originalMobile=(await record(owner,key)).content.panelLayout.mobileOrder;
      const row=reorder.locator(`[data-panel-id="${panelId}"]`);
      await row.focus();await owner.keyboard.press('ArrowDown');await save(owner);
      assert.notDeepEqual((await record(owner,key)).content.panelLayout.mobileOrder,originalMobile);
      await row.focus();await owner.keyboard.press('ArrowUp');await save(owner);
      assert.deepEqual((await record(owner,key)).content.panelLayout.mobileOrder,originalMobile);
      await reorder.getByRole('button',{name:'Done',exact:true}).click();
      await owner.screenshot({path:`${output}/${key}-editable-sidebar-${engineName}.png`});
      await panel.getByRole('button',{name:/^Main for /}).click();await save(owner);
      await toolbar(owner).locator('.page-edit-tools > summary').click();await toolbar(owner).getByRole('button',{name:'Finish arranging',exact:true}).click();await editTitle(before);await togglePanelProtection(owner,panel,true);await save(owner);await modeDone(owner).click();
      await owner.reload();await expect(owner.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');
      assert.equal(await readTitle(),before);
    }
  });

  await check('automatic save status and Done stay readable in both themes and materials', async () => {
    for (const theme of ['light','dark']) for (const platform of ['ios','android']) {
      const page=await person('owner',{theme,platform,label:`save-contrast-${theme}-${platform}`});
      await edit(page);const original=(await record(page)).content.text.heading,paints=[];
      for(const width of [390,768]){
        await page.setViewportSize({width,height:844});
        paints.push({width,...await assertSavePaint(page,{theme,platform,disabled:false})});
        await expect.poll(async()=>pageSaveContrast(await saveStatus(page).evaluate(readPageSavePaint))).toBeGreaterThanOrEqual(4.5);
        await toolbar(page).screenshot({path:`${output}/save-contrast-${theme}-${platform}-${width}-${engineName}.png`});
      }
      await editText(page,'home.heading',original+' Synthetic automatic-save check');await save(page);
      assert.equal((await record(page)).content.text.heading,original+' Synthetic automatic-save check');
      await editText(page,'home.heading',original);await save(page);
      await writeFile(`${output}/save-contrast-${theme}-${platform}-${engineName}.json`,JSON.stringify(paints,null,2));
      await modeDone(page).click();
    }
  });

  await check('edit preserves the authored palette and photos; the active surface uses a stable outline', async () => {
    await navigate(owner, 'home');
    await expect(toolbar(owner).getByRole('button', {name: 'Edit page', exact: true})).toBeVisible();
    await owner.evaluate(() => Promise.all(document.body.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    const original = await owner.evaluate(() => ({theme: document.documentElement.dataset.theme, palette: document.documentElement.style.cssText, personal: localStorage.getItem('gw-personal-themes'), tokenBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), bg: getComputedStyle(document.body).backgroundColor}));
    await edit(owner);
    await expect(owner.locator('.page-active-edit-card')).toHaveCount(0);
    const colors = await owner.evaluate(() => {
      const css = getComputedStyle(document.documentElement), body = getComputedStyle(document.body);
      return {bg: css.getPropertyValue('--bg').trim(), neutral: css.getPropertyValue('--page-edit-bg').trim(), duration: body.transitionDuration, property: body.transitionProperty};
    });
    assert.equal(colors.bg, original.tokenBg);
    assert.ok(colors.property.includes('background-color') && colors.duration.split(',').some(value => parseFloat(value) > 0), 'Edit mode has a short color fade.');
    await noImageDesaturation(owner);
    await field(owner, 'home.heading').getByRole('button', {name: 'Edit Page heading', exact: true}).click();
    await expect(owner.locator('.page-active-edit-card')).toHaveCount(1);
    await expect(owner.locator('.page-active-edit-card')).toContainText('Hey, family!');
    const active = await owner.locator('.page-active-edit-card').evaluate(element => ({animation: getComputedStyle(element).animationName, keyframes: element.getAnimations().flatMap(animation => animation.effect.getKeyframes())}));
    assert.equal(active.animation, 'none');
    assert.ok(active.keyframes.every(frame => !frame.transform || frame.transform === 'none'), 'Selection does not move content.');
    const unwanted = await owner.locator('main').evaluate(root => root.getAnimations({subtree: true}).filter(animation => animation.effect?.getTiming().iterations === Infinity && animation.playState === 'running').map(animation => animation.animationName));
    assert.deepEqual(unwanted, []);
    await field(owner, 'home.heading').getByRole('button', {name: 'Finish editing Page heading', exact: true}).click();
    const homeHero = primaryHero(owner, 'home');
    await expect(homeHero).toHaveAttribute('data-panel-locked', 'true');
    await expect(homeHero.getByRole('heading', {name: 'More time with our people.', exact: true})).toBeVisible();
    await expect(field(owner, 'home.heroTitle')).toHaveCount(0);
    await expect(homeHero.getByRole('button', {name: 'Edit Hero heading', exact: true})).toHaveCount(0);
    await expect(homeHero.getByRole('button', {name: 'Edit Home page media', exact: true})).toHaveCount(0);
    await unlockHero(owner, 'home');
    const heroEdit = field(owner, 'home.heroTitle').getByRole('button', {name: 'Edit Hero heading', exact: true});
    await heroEdit.focus();
    await expect(heroEdit).toBeFocused();
    await heroEdit.press('Enter');
    const heroInput = field(owner, 'home.heroTitle').getByRole('textbox', {name: 'Hero heading', exact: true});
    await expect(heroInput).toBeFocused();
    await expect(heroInput).toHaveValue('More time\nwith our people.');
    await expect(owner.locator('.page-active-edit-card')).toHaveCount(1);
    await expect(owner.locator('.home-hero')).toHaveClass(/page-active-edit-card/);
    await owner.screenshot({path: `${output}/active-copy-${engineName}.png`});
    await field(owner, 'home.heroTitle').getByRole('button', {name: 'Finish editing Hero heading', exact: true}).click();
    await expect(heroEdit).toBeFocused();
    // Opening a target changed no copy. Restore its original lock before Done,
    // so this color/focus check leaves no unsaved layout draft for later checks.
    await togglePanelProtection(owner,homeHero,true);
    await expect(homeHero).toHaveAttribute('data-panel-locked', 'true');
    await expect(homeHero.getByRole('button', {name: 'Edit Hero heading', exact: true})).toHaveCount(0);
    await save(owner);
    await modeDone(owner).click();
    await expect(owner.locator('.page-active-edit-card')).toHaveCount(0);
    const after = await owner.evaluate(() => ({theme: document.documentElement.dataset.theme, palette: document.documentElement.style.cssText, personal: localStorage.getItem('gw-personal-themes')}));
    assert.deepEqual(after, {theme: original.theme, palette: original.palette, personal: original.personal});
    await expect.poll(() => owner.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(original.bg);
  });

  await check('in-place fields keep compact Done inside the editor without covering text and pending saves never claim persistence', async () => {
    await edit(owner);
    let entered = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    const handler = async route => {if (route.request().method() === 'PATCH') {entered = true; await gate;} await route.continue();};
    await owner.route('**/api/page-content/home', handler);
    try {
    await editText(owner, 'home.heading', firstText, {finish: false});
    const boxes = await field(owner, 'home.heading').evaluate(element => ({editor: element.querySelector('.page-copy-input-wrap').getBoundingClientRect().toJSON(), input: element.querySelector('.page-copy-input').getBoundingClientRect().toJSON(), done: element.querySelector('.page-field-done').getBoundingClientRect().toJSON(), glyph: element.querySelector('.page-field-done .glyph').getBoundingClientRect().toJSON()}));
    assert.ok(boxes.done.left >= boxes.editor.left && boxes.done.right <= boxes.editor.right + 1 && boxes.done.top >= boxes.editor.top && boxes.done.bottom <= boxes.editor.bottom + 1,
      'The Done checkmark remains inside the shared editor surface: ' + JSON.stringify(boxes));
    assert.ok(boxes.input.right <= boxes.done.left && boxes.input.width > 0, 'Done has its own column and never covers editable text.');
    assert.ok(boxes.done.width >= 44 && boxes.done.width <= 45 && boxes.done.height >= 44 && boxes.done.height <= 45 && boxes.glyph.width <= 18.5 && boxes.glyph.height <= 18.5, 'Done keeps a compact glyph within a usable 44px target.');
    assert.equal(await owner.getByRole('dialog').count(), 0, 'Text editing is in place.');
    await field(owner, 'home.heading').getByRole('button', {name: 'Finish editing Page heading', exact: true}).click();
      await expect.poll(() => entered).toBe(true);
      await expect(saveStatus(owner)).toHaveText('Saving…');
      await expect(modeDone(owner)).toBeDisabled();
      assert.notEqual((await record(bob)).content.text.heading, firstText, 'Held saves have not reached another member.');
      assert.ok(!(await toolbar(owner).innerText()).includes('Saved for the family'));
      await owner.screenshot({path: `${output}/pending-save-${engineName}.png`});
      release();
      await expect(toolbar(owner)).toContainText('Saved for the family');
      firstSaved = await record(bob);
      assert.equal(firstSaved.content.text.heading, firstText);
    } finally {release(); await owner.unroute('**/api/page-content/home', handler);}
  });

  await check('typing during an autosave stays editable and saves the newest value without a stale overwrite', async () => {
    const first = 'Synthetic first value in a delayed autosave', newest = 'Synthetic newer typing while the save is pending';
    let entered = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    const handler = async route => {if (route.request().method() === 'PATCH' && !entered) {entered = true; await gate;} await route.continue();};
    await owner.route('**/api/page-content/home', handler);
    try {
      const input = await editText(owner, 'home.heading', first, {finish:false});
      await expect.poll(() => entered).toBe(true);
      await expect(input).toBeEnabled();
      await input.fill(newest);
      assert.equal((await record(bob)).content.text.heading, firstText, 'A held request has not changed shared content.');
      release();
      await expect.poll(async () => (await record(bob)).content.text.heading).toBe(newest);
      await expect(input).toHaveValue(newest);
      await save(owner);
      await editText(owner, 'home.heading', firstText);
      await save(owner);
    } finally {release(); await owner.unroute('**/api/page-content/home', handler);}
  });

  await check('failed saves retain drafts through navigation and same-tab reload, then retry successfully', async () => {
    const draft = 'Synthetic recoverable page draft after a failed save';
    const handler = route => route.request().method() === 'PATCH' ? route.fulfill({status: 503, json: {error: 'Synthetic shared-page save failure'}}) : route.continue();
    await owner.route('**/api/page-content/home', handler);
    try {
      await editText(owner, 'home.heading', draft);

      await expect(owner.getByRole('alert').filter({hasText: 'Synthetic shared-page save failure'})).toBeVisible();
      assert.equal((await record(bob)).content.text.heading, firstText);
      await expect(owner.getByRole('navigation', {name:'Main navigation',exact:true})).toBeHidden();
    await owner.evaluate(()=>{location.hash='/family'});
      await owner.getByRole('navigation', {name: 'Main navigation', exact: true}).getByRole('button', {name: 'Home', exact: true}).click();
      await expect(toolbar(owner).getByRole('button', {name: 'Resume page edits', exact: true})).toBeVisible();
      browserReads.get(owner).beginNavigation(owner.url());
      await owner.reload({waitUntil: 'domcontentloaded'});
      await expect(toolbar(owner).getByRole('button', {name: 'Resume page edits', exact: true})).toBeVisible();
      await edit(owner);
      await expect(field(owner, 'home.heading')).toContainText(draft);
      await owner.screenshot({path: `${output}/recovered-draft-${engineName}.png`});
    } finally {await owner.unroute('**/api/page-content/home', handler);}
    await save(owner);
    assert.equal((await record(bob)).content.text.heading, draft);
  });

  await check('a second member and a fresh browser context see server-saved copy without edit controls', async () => {
    const saved = (await record(owner)).content.text.heading;
    await navigate(alice, 'home');
    await expect(alice.locator('.intro h1')).toHaveText(saved);
    await assertNoPageEditor(alice);
    const freshBob = await person('bob', {label: 'bob-fresh-device'});
    await expect(freshBob.locator('.intro h1')).toHaveText(saved);
    await assertNoPageEditor(freshBob);
  });

  await check('optimistic conflicts retain the draft, show both values, and require deliberate review before resaving', async () => {
    const mine = 'Synthetic local Leader conflict draft', theirs = 'Synthetic other-device Leader heading';
    await editText(owner, 'home.heading', mine);
    const latest = await record(otherOwner), changed = structuredClone(latest.content);
    changed.text.heading = theirs;
    await patch(otherOwner, 'home', changed, latest.revision);

    await expect(owner.locator('.page-editor-error[role="alert"]')).toContainText('Your draft is kept');
    await expect(field(owner, 'home.heading')).toContainText(mine);
    await expect(saveStatus(owner)).toContainText('Couldn’t save');
    assert.equal((await record(bob)).content.text.heading, theirs);
    await owner.getByRole('button', {name: 'Review latest changes', exact: true}).click();
    await expect(owner.locator('.page-conflict-values')).toContainText('Yours: ' + mine);
    await expect(owner.locator('.page-conflict-values')).toContainText('Latest: ' + theirs);
    await owner.screenshot({path: `${output}/conflict-review-${engineName}.png`});
    await owner.getByRole('button', {name: 'Keep my edits', exact: true}).click();
    await expect(modeDone(owner)).toBeEnabled();
    await save(owner);
    assert.equal((await record(bob)).content.text.heading, mine);
  });

  await check('history restoration appends a new revision and keeps the replaced version available for rollback', async () => {
    const before = await record(owner);
    await openHistory(owner);
    const dialog = owner.getByRole('region', {name: 'Page history', exact: true});
    await expect(owner.getByRole('dialog')).toHaveCount(0);
    const row = dialog.locator('.page-revision-list > li').filter({has: owner.locator('strong', {hasText: new RegExp('^Version ' + firstSaved.revision + '$')})});
    await row.getByRole('button', {name: 'Restore', exact: true}).click();
    await expect(dialog.getByRole('alert')).toContainText('Restore version ' + firstSaved.revision + '?');
    await dialog.getByRole('button', {name: 'Restore version', exact: true}).click();
    await expect(dialog.locator('.page-revision-list')).toContainText('Restored from version ' + firstSaved.revision);
    const restored = await record(bob);
    assert.equal(restored.content.text.heading, firstText);
    assert.equal(restored.revision, before.revision + 1);
    const history = await ok(owner, '/api/page-content/home/revisions');
    assert.ok(history.revisions.some(row => row.revision === before.revision && row.content.text.heading === before.content.text.heading));
    await closeEditorPanel(owner, 'Page history');
    await expect(field(owner, 'home.heading')).toContainText(firstText);
  });

  await check('multiple gallery uploads stay private until saving, preserve order and descriptions, and then render for other members', async () => {
    const dialog = await mediaPanel(owner);
    await dialog.getByRole('button', {name: 'Gallery', exact: true}).click();
    const picker = dialog.getByLabel('Choose page photos', {exact: true});
    await expect(picker).toHaveAttribute('multiple', '');
    await uploadPageMedia(owner, dialog, picker, [uploadPhoto('synthetic-first.png'), uploadPhoto('synthetic-second.png', 40)]);
    await expect(dialog.locator('.page-media-files > li')).toHaveCount(2);
    await expect(dialog.getByRole('status', {name: 'Page media upload', exact: true})).toContainText('Uploaded privately.');
    await dialog.getByLabel('Photo or video description', {exact: true}).nth(0).fill('Synthetic green color fixture one');
    await dialog.getByLabel('Photo or video description', {exact: true}).nth(1).fill('Synthetic green color fixture two');
    await dialog.getByRole('button', {name: 'Move photo 2 earlier', exact: true}).click();
    await expect(dialog.locator('.page-media-files > li').first()).toContainText('synthetic-second.png');
    const unpublished = await dialog.locator('.page-media-files img').evaluateAll(images => images.map(image => new URL(image.src).pathname));
    for (const url of unpublished) assert.equal((await api(bob, url)).status, 404);
    await dialog.getByRole('button', {name: 'Apply media', exact: true}).click();
    await save(owner);
    firstGallery = await record(owner);
    assert.equal(firstGallery.content.hero.mode, 'gallery');
    assert.equal(firstGallery.content.hero.media.length, 2);
    assert.equal(firstGallery.content.hero.media[0].alt, 'Synthetic green color fixture two');
    for (const file of firstGallery.content.hero.media) {
      assert.equal((await api(bob, file.url)).status, 200);
      assert.equal((await api(anonymous, file.url)).status, 401);
      assert.equal((await api(pending, file.url)).status, 403);
    }
    await navigate(bob, 'home');
    await expect(bob.getByRole('region', {name: 'Family page photos', exact: true})).toBeVisible();
    await expect(bob.locator('.page-hero-asset')).toHaveAttribute('alt', 'Synthetic green color fixture two');
    await expect.poll(() => bob.locator('img.page-hero-asset').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  });

  await check('gallery controls are keyboard accessible and explicit pause stops the slideshow', async () => {
    const gallery = bob.getByRole('region', {name: 'Family page photos', exact: true});
    await gallery.getByRole('button', {name: 'Next page photo', exact: true}).click();
    await expect(gallery).toContainText('2 / 2');
    await gallery.getByRole('button', {name: 'Next page photo', exact: true}).press('ArrowLeft');
    await expect(gallery).toContainText('1 / 2');
    await gallery.getByRole('button', {name: 'Play page photos', exact: true}).click();
    await expect(gallery.getByRole('button', {name: 'Pause page photos', exact: true})).toHaveAttribute('aria-pressed', 'true');
    const beforeAdvance = await gallery.locator('img').getAttribute('src');
    await bob.locator('.intro h1').click();
    await bob.mouse.move(1, 1);
    await expect.poll(() => gallery.locator('img').getAttribute('src'), {timeout: 8500}).not.toBe(beforeAdvance);
    await gallery.getByRole('button', {name: 'Pause page photos', exact: true}).click();
    const paused = await gallery.locator('img').getAttribute('src');
    await bob.locator('.intro h1').click();
    await bob.mouse.move(1, 1);
    await bob.waitForTimeout(6200); // One complete 6-second slideshow interval.
    assert.equal(await gallery.locator('img').getAttribute('src'), paused);
    await expect(gallery.getByRole('button', {name: 'Play page photos', exact: true})).toHaveAttribute('aria-pressed', 'false');
    await navigate(alice, 'home');
    await expect(alice.getByRole('button', {name: 'Play page photos', exact: true})).toBeDisabled();
  });

  await check('Photo mode selects one existing gallery image and unpublished historical media loses shared access', async () => {
    const dialog = await mediaPanel(owner);
    await dialog.getByRole('button', {name: 'Photo', exact: true}).click();
    await expect(dialog.getByLabel('Choose page photos', {exact: true})).not.toHaveAttribute('multiple', '');
    await expect(dialog.locator('.page-media-files > li')).toHaveCount(1);
    await dialog.getByRole('button', {name: 'Apply media', exact: true}).click();
    await save(owner);
    const current = await record(bob);
    assert.equal(current.content.hero.mode, 'image');
    assert.equal(current.content.hero.media.length, 1);
    assert.equal((await api(bob, firstGallery.content.hero.media[1].url)).status, 404);
    await navigate(bob, 'home');
    await expect(bob.locator('img.page-hero-asset')).toHaveCount(1);
    const photoHero = primaryHero(bob, 'home');
    await expect(photoHero).toHaveCount(1);
    await expect(photoHero.locator('img.page-hero-asset')).toHaveCount(1);
    await expect(photoHero.locator('.gw-carousel-controls, .page-gallery-status')).toHaveCount(0);
    for (const name of ['Previous page photo', 'Next page photo', 'Play page photos', 'Pause page photos']) {
      await expect(photoHero.getByRole('button', {name, exact: true})).toHaveCount(0);
    }
    await noImageDesaturation(owner);
  });

  await check('Video uploads render muted inline with a poster and native pause controls; reduced motion prevents autoplay', async () => {
    const dialog = await mediaPanel(owner);
    await dialog.getByRole('button', {name: 'Video', exact: true}).click();
    await uploadPageMedia(owner, dialog, dialog.getByLabel('Choose page video', {exact: true}), {name: 'synthetic-green-clip.mp4', mimeType: 'video/mp4', buffer: videoBytes});
    await expect(dialog.getByRole('status', {name: 'Page media upload', exact: true})).toContainText('Uploaded privately.');
    await dialog.getByLabel('Photo or video description', {exact: true}).fill('Synthetic muted green video fixture');
    await dialog.getByRole('button', {name: 'Apply media', exact: true}).click();
    await save(owner);
    await navigate(bob, 'home');
    const video = bob.locator('video.page-hero-asset');
    await expect(video).toHaveAttribute('aria-label', 'Synthetic muted green video fixture');
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(1);
    const properties = await video.evaluate(element => ({muted: element.muted, inline: element.playsInline, controls: element.controls, loop: element.loop, autoplay: element.autoplay, poster: element.getAttribute('poster')}));
    assert.deepEqual({...properties, poster: true}, {muted: true, inline: true, controls: true, loop: true, autoplay: true, poster: true});
    assert.ok(properties.poster, 'A video has a static poster before playback.');
    assert.equal((await bob.request.get(new URL(properties.poster, base).href)).status(), 200);
    // Native browser controls are asserted present. The media API verifies
    // pause persistence; this is deliberately not a physical touch-gesture claim.
    await video.evaluate(async element => {await element.play(); element.pause();});
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
    await bob.waitForTimeout(350);
    assert.equal(await video.evaluate(element => element.paused), true);
    await navigate(alice, 'home');
    const reduced = alice.locator('video.page-hero-asset');
    await expect(reduced).toBeVisible();
    assert.deepEqual(await reduced.evaluate(element => ({autoplay: element.autoplay, paused: element.paused})), {autoplay: false, paused: true});
    await owner.screenshot({path: `${output}/video-edit-${engineName}.png`});
  });

  await check('public welcome never fetches or renders saved family copy, footer overrides or private photos', async () => {
    const global = await record(owner, 'global'), updated = structuredClone(global.content);
    updated.text.footerTagline = 'Synthetic private footer visible only to approved family';
    await patch(owner, 'global', updated, global.revision);
    const requests = [];
    anonymous.on('request', request => requests.push(new URL(request.url()).pathname));
    browserReads.get(anonymous).beginNavigation(anonymous.url());
    await anonymous.reload({waitUntil: 'domcontentloaded'});
    await expect(anonymous.locator('.onboard')).toBeVisible();
    // This isolated fixture deliberately enables no email or social providers.
    await expect(anonymous.locator('.onboard .welcome-tagline')).toHaveText('Same roots. New memories.');
    await expect(anonymous.locator('.welcome-actions').getByRole('button', {name: 'Continue', exact: true})).toBeVisible();
    await expect(anonymous.getByRole('button', {name: 'Set up your profile', exact: true})).toBeVisible();
    await expect(anonymous.locator('.sign-in-form')).toHaveCount(0);
    await expect(anonymous.locator('footer')).toContainText('Green & White. Same roots. New memories.');
    await expect(anonymous.getByText(updated.text.footerTagline, {exact: true})).toHaveCount(0);
    await expect(anonymous.getByText((await record(owner)).content.text.heading, {exact: true})).toHaveCount(0);
    await expect(anonymous.locator('img[src^="/api/media/"], video[src^="/api/media/"], [data-page-field]')).toHaveCount(0);
    assert.ok(!requests.some(path => path.startsWith('/api/page-content/') || path.startsWith('/api/media/')), 'Welcome sends no private-page or private-media requests.');
  });

  await check('Family edit mode includes related tab copy and the shared footer, and saves each affected page independently', async () => {
    await navigate(owner, 'family');
    await edit(owner);
    await editText(owner, 'family.heading', 'Synthetic family landing heading');
    await editText(owner, 'people.heading', 'Synthetic shared address book heading');
    await owner.getByRole('tab', {name: 'Memories', exact: true}).click();
    await unlockHero(owner, 'memories');
    await editText(owner, 'memories.heroTitle', 'Synthetic memories heading\nWith a second line');
    await owner.getByRole('tab', {name: 'Family tree', exact: true}).click();
    await unlockHero(owner, 'tree');
    await editText(owner, 'tree.heroTitle', 'Synthetic family roots heading');
    await editText(owner, 'global.footerTagline', 'Synthetic shared footer from the Family editor');
    await save(owner);
    for (const [key, name, text] of [
      ['family', 'heading', 'Synthetic family landing heading'], ['people', 'heading', 'Synthetic shared address book heading'],
      ['memories', 'heroTitle', 'Synthetic memories heading\nWith a second line'], ['tree', 'heroTitle', 'Synthetic family roots heading'],
      ['global', 'footerTagline', 'Synthetic shared footer from the Family editor'],
    ]) assert.equal((await record(bob, key)).content.text[name], text);
    await navigate(alice, 'family');
    await expect(alice.locator('.intro h1')).toHaveText('Synthetic family landing heading');
    await expect(alice.getByText('Synthetic shared address book heading', {exact: true})).toBeVisible();
    await alice.getByRole('tab', {name: 'Memories', exact: true}).click();
    await expect(alice.getByText('Synthetic memories heading\nWith a second line', {exact: true})).toBeVisible();
    await expect(alice.locator('footer')).toContainText('Synthetic shared footer from the Family editor');
    await assertNoPageEditor(alice);
  });

  await check('menus, individual profiles and user posts are never shared-page edit targets or altered by page saves', async () => {
    fixturePost = await ok(alice, '/api/posts', {method: 'POST', data: {body: 'Synthetic member post, outside shared-page editing'}});
    await navigate(owner, 'home');
    const navCopy = await owner.getByRole('navigation', {name: 'Main navigation', exact: true}).textContent();
    await edit(owner);
    await expect(owner.locator('header [data-page-field], nav [data-page-field], .post-card [data-page-field]')).toHaveCount(0);
    await expect(owner.getByText('Synthetic member post, outside shared-page editing', {exact: true})).toBeVisible();
    const postIsEditable = await owner.getByText('Synthetic member post, outside shared-page editing', {exact: true}).evaluate(element => !!element.closest('[data-page-field], [contenteditable="true"]'));
    assert.equal(postIsEditable, false);
    await owner.getByRole('button', {name: 'Profile and appearance', exact: true}).click();
    await expect(owner.locator('.profile-menu [data-page-field]')).toHaveCount(0);
    await owner.getByRole('button', {name: 'Profile and appearance', exact: true}).click();
    await expect(owner.getByRole('navigation', {name: 'Main navigation', exact: true})).toBeHidden();
    assert.equal(await owner.getByRole('navigation', {name: 'Main navigation', exact: true,includeHidden:true}).textContent(), navCopy);
    await navigate(owner, 'profile', 'alice');
    await assertNoPageEditor(owner);
    await expect(owner.locator('[data-page-field]')).toHaveCount(0);
    await navigate(owner, 'post', fixturePost.id);
    await assertNoPageEditor(owner);
    await expect(owner.getByText('Synthetic member post, outside shared-page editing', {exact: true})).toBeVisible();
    const state = await ok(owner, '/api/state');
    assert.deepEqual(state.members, initialMembers, 'Page editing never changes member profiles.');
    assert.equal(state.posts.find(post => post.id === fixturePost.id)?.text, 'Synthetic member post, outside shared-page editing');
  });

  await check('reduced-motion editing stays steady; media, history, choices and text Done fit phone, tablet and landscape widths', async () => {
    await otherOwner.emulateMedia({reducedMotion: 'reduce'});
    for (const viewport of [{width: 390, height: 844}, {width: 768, height: 1024}, {width: 844, height: 390}]) {
      await otherOwner.setViewportSize(viewport);
      await expect.poll(()=>otherOwner.evaluate(()=>Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vv-width'))))).toBe(viewport.width);
      await navigate(otherOwner, 'family');
      await edit(otherOwner);
      await field(otherOwner, 'family.heading').getByRole('button', {name: 'Edit Page heading', exact: true}).click();
      const active = otherOwner.locator('.page-active-edit-card');
      await expect(active).toHaveCount(1);
      assert.equal(await active.evaluate(element => getComputedStyle(element).animationName), 'none');
      const selectedField=field(otherOwner,'family.heading').locator('.page-copy-input-wrap');
      await expect(selectedField).toBeVisible();
      const selection=await selectedField.evaluate(element=>{const style=getComputedStyle(element);return {width:parseFloat(style.borderTopWidth),style:style.borderTopStyle,color:style.borderTopColor,control:getComputedStyle(document.documentElement).getPropertyValue('--control').trim()}});
      assert.equal(selection.width,1);assert.equal(selection.style,'solid');assert.notEqual(selection.color,'rgba(0, 0, 0, 0)','Reduced motion retains the field selection edge.');
      assert.equal(await active.evaluate(element=>getComputedStyle(element).outlineStyle),'none','Field focus owns one edge without a stacked parent outline.');
      await noClip(otherOwner);
      await field(otherOwner, 'family.heading').getByRole('button', {name: 'Finish editing Page heading', exact: true}).click();
      const dialog = await mediaPanel(otherOwner, 'family');
      await editorPanelFits(otherOwner, dialog);
      for (const label of ['Photo', 'Gallery', 'Video']) {
        await dialog.getByRole('button', {name: label, exact: true}).scrollIntoViewIfNeeded();
        await expect(dialog.getByRole('button', {name: label, exact: true})).toBeInViewport({ratio: 1});
        await dialog.getByRole('button', {name: label, exact: true}).focus();
        await expect(dialog.getByRole('button', {name: label, exact: true})).toBeFocused();
        await dialog.getByRole('button', {name: label, exact: true}).click();
        await expect(dialog.getByRole('button', {name: label, exact: true})).toHaveAttribute('aria-pressed', 'true');
        await noClip(otherOwner);
        await editorPanelFits(otherOwner, dialog);
      }
      if (viewport.height < 500) {
        await dialog.getByRole('button', {name: 'Gallery', exact: true}).click();
        await uploadPageMedia(otherOwner, dialog, dialog.getByLabel('Choose page photos', {exact: true}), [uploadPhoto('synthetic-landscape-first.png'), uploadPhoto('synthetic-landscape-second.png')]);
        await expect(dialog.locator('.page-media-files > li')).toHaveCount(2);
        await editorPanelFits(otherOwner, dialog);
        assert.ok(await otherOwner.locator('.page-object-tools').evaluate(element => element.scrollHeight > element.clientHeight),
          'A short landscape viewport scrolls the protected media task.');
        await dialog.getByRole('button', {name: 'Use original media', exact: true}).click();
        await expect(dialog.locator('.page-media-files > li')).toHaveCount(0);
        await dialog.getByRole('button', {name: 'Apply media', exact: true}).scrollIntoViewIfNeeded();
        await expect(dialog.getByRole('button', {name: 'Apply media', exact: true})).toBeInViewport({ratio: 1});
        await editorPanelFits(otherOwner, dialog);
      }
      await otherOwner.screenshot({path: `${output}/media-panel-${viewport.width}x${viewport.height}-${engineName}.png`});
      await closeEditorPanel(otherOwner, 'Page media');
      await openHistory(otherOwner);
      const historyPanel = otherOwner.getByRole('region', {name: 'Page history', exact: true});
      await expect(historyPanel).toBeVisible();
      await expect(otherOwner.getByRole('dialog')).toHaveCount(0);
      await noClip(otherOwner);
      await editorPanelFits(otherOwner, historyPanel);
      const history = historyPanel.getByRole('combobox', {name: 'History for', exact: true});
      for (const key of ['family', 'people', 'memories', 'tree', 'global']) {
        const label = SHARED_PAGE_SCHEMA[key].label + (key === 'global' ? '' : ' page');
        await history.scrollIntoViewIfNeeded();
        await history.focus();
        await expect(history).toBeFocused();
        await expect(history.getByRole('option', {name: label, exact: true})).toHaveAttribute('value', key);
        await history.selectOption(key);
        await expect(history).toHaveValue(key);
        await expect.poll(() => history.evaluate(select => select.selectedOptions[0]?.textContent)).toBe(label);
      }
      await closeEditorPanel(otherOwner, 'Page history');
      await otherOwner.getByRole('tab', {name: 'Memories', exact: true}).click();
      const memoryControls=otherOwner.getByRole('region',{name:'Memory',exact:true});
      await memoryControls.getByRole('button',{name:'Filter & sort',exact:true}).click();
      await expect(memoryControls.getByRole('button',{name:'Filter & sort',exact:true})).toHaveAttribute('aria-expanded','true');
      await expect(otherOwner.getByRole('dialog')).toHaveCount(0);
      const category = otherOwner.getByRole('combobox', {name: 'Category', exact: true});
      await memoryControls.getByRole('button', {name: 'Show choices for Category', exact: true}).click();
      await expect(category).toBeFocused();
      await expect(otherOwner.getByRole('listbox', {name: 'Category', exact: true})).toBeVisible();
      await noClip(otherOwner);
      await panelFits(otherOwner, '.choice-popover[data-open="true"]');
      await category.press('Escape');
      await expect(category).toHaveAttribute('aria-expanded', 'false');
      await otherOwner.screenshot({path: `${output}/family-editor-${viewport.width}x${viewport.height}-${engineName}.png`});
      await memoryControls.locator('[data-control-menu="filters"] .work-controls-done').click();
      await expect(memoryControls.getByRole('button',{name:'Filter & sort',exact:true})).toHaveAttribute('aria-expanded','false');
      // Media choices returned to the original content. Restore the original
      // family hero lock so each viewport starts from a clean saved snapshot.
      await togglePanelProtection(otherOwner,primaryHero(otherOwner,'family'),true);
      await expect(primaryHero(otherOwner, 'family')).toHaveAttribute('data-panel-locked', 'true');
      await save(otherOwner);
      await modeDone(otherOwner).click();
    }
  });

  await check('shared-page writes use only the bounded snapshot contract and the browser reports no unhandled exceptions', async () => {
    assert.ok(writes.some(write => write.method === 'PATCH'), 'The suite exercised actual UI save requests.');
    for (const write of writes.filter(write => write.method === 'PATCH')) {
      assert.deepEqual(Object.keys(write.body).sort(), ['content', 'expectedRevision', 'requestId']);
      assert.deepEqual(Object.keys(write.body.content).sort(), ['bodyFormats', 'cardLayouts', 'hero', 'panelLayout', 'text']);
      const key = decodeURIComponent(write.path.split('/').at(-1));
      assert.deepEqual(Object.keys(write.body.content.text).sort(), Object.keys(SHARED_PAGE_SCHEMA[key].fields).sort(), 'Only this shared page’s declared copy enters the snapshot.');
      for (const [field, format] of Object.entries(write.body.content.bodyFormats)) {
        assert.equal(SHARED_PAGE_SCHEMA[key].fields[field]?.format, 'markdown');
        assert.equal(format, 'markdown');
      }
      assert.deepEqual(Object.keys(write.body.content.hero).sort(), write.body.content.hero.frame?['frame','media','mode']:['media','mode']);
      if(write.body.content.hero.frame)validatePhotoFrame(write.body.content.hero.frame);
      for (const file of write.body.content.hero.media) assert.deepEqual(Object.keys(file).sort(), file.frame?['alt','frame','id']:['alt','id'], 'Client URLs and file metadata never become write authority.');
      const layout = write.body.content.panelLayout;
      assert.deepEqual(validateCardLayouts(key, layout, write.body.content.cardLayouts), write.body.content.cardLayouts);
      assert.deepEqual(Object.keys(layout).sort(), ['desktopOrder', 'mobileOrder', 'panels', 'version']);
      assert.equal(layout.version, 2);
      const visible = layout.panels.filter(panel => !panel.removed).map(panel => panel.id).sort();
      assert.deepEqual([...layout.desktopOrder].sort(), visible); assert.deepEqual([...layout.mobileOrder].sort(), visible);
      for (const panel of layout.panels) {
        assert.deepEqual(Object.keys(panel).sort(), panel.kind !== 'content' ? ['id', 'kind', 'locked', 'removed', 'zone'] :
          ['body', 'id', 'kind', 'layout', 'locked', 'media', 'removed', 'secondary', 'title', 'zone']);
        assert.equal(typeof panel.locked, 'boolean'); assert.equal(typeof panel.removed, 'boolean');
        assert.ok(['main', 'side'].includes(panel.zone));
        for (const file of panel.media || []) assert.deepEqual(Object.keys(file).sort(), file.frame?['alt','frame','id']:['alt','id'], 'Panel media also carries only bounded IDs and descriptions.');
      }
    }
    for (const {id, page} of sessions) if (id !== 'anonymous' && id !== 'pending') await settleBrowserReads(page);
    assert.deepEqual(errors, [], 'No unhandled browser exceptions.');
  });
} catch (error) {
  failure = error.stack || error.message;
  console.error('GW PAGE CONTENT FAILURE', failure);
  console.log('::error title=GW shared-page browser::' + String(failure).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D'));
  for (const {id, page} of sessions) {
    console.error('Failed-page fixture identity', id, 'URL', page.url());
    console.error((await page.locator('body').innerText({timeout: 3000}).catch(() => '<unavailable>')).slice(-2500));
    await page.screenshot({path: `${output}/failure-${id}-${engineName}.png`, timeout: 5000}).catch(() => {});
  }
  throw error;
} finally {
  await writeFile(`${output}/network-${engineName}.json`, JSON.stringify({browser: engineName, startedAt: new Date(traceStarted).toISOString(), sessions: sessions.map(({id, trace}) => ({user: id, documentEpoch: trace.documentEpoch, documentTimeOrigin: trace.documentTimeOrigin, navigations: trace.navigations, droppedEvents: trace.droppedEvents, events: trace.events, pending: [...trace.pending.values()]}))}, null, 2));
  await writeFile(`${output}/results-${engineName}.json`, JSON.stringify({browser: engineName, results, errors, networkTrace: `network-${engineName}.json`, ...(failure ? {failure} : {}), limitations: [
    'Hosted synthetic fixture only; no production data, messages, payments, invitations or external writes.',
    'Viewport checks do not establish physical-device keyboard, installed-PWA or touch behavior.',
    'Video controls and media-API pause are verified; native physical pause gestures require device QA.',
  ]}, null, 2));
  await browser.close();
}
