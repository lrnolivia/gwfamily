// Hosted-only authenticated communications checks. Start the isolated fixture on
// port 4175 first. Never substitute these checks for physical-device keyboard QA.
import {chromium, webkit, expect} from '@playwright/test';
import {settlePointerTarget} from './browser-transition-readiness.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {createTestPng} from './png-fixtures.mjs';
import {diagnosticUrl, installCommunicationsLifecycle, observeCommunicationsPage} from './communications-browser-diagnostics.mjs';

if (!process.env.CI && process.env.GW_HOSTED_BROWSER_QA !== '1') {
  throw new Error('Communications browser QA runs only in the authorized hosted CI environment.');
}
const base = process.env.GW_COMMUNICATIONS_URL || 'http://127.0.0.1:4175';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), 'Fixture origin must remain local to hosted CI.');
const output = 'docs/communications-qa';
const results = [], errors = [], sessions = [], typingRequests = [];
const browserReads = new WeakMap(), traceStarted = Date.now();
let currentCheck = 'fixture setup';
const engineName = process.env.GW_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch({headless: true});
await mkdir(output, {recursive: true});

async function check(name, run) {
  currentCheck = name;
  await run();
  results.push({check: name, status: 'passed'});
  console.log('COMMUNICATIONS PASS:', name);
}
async function settleBrowserReads(page, {since, required = []} = {}) {
  const trace = browserReads.get(page), options = {since: since ?? trace.lastDrained, required};
  let drainedThrough = options.since;
  // Completion, rather than a delay or networkidle, keeps real polling enabled.
  // This suite deliberately exercises denied reads and failed sends, so only
  // explicitly required normal-route reads carry a successful-status contract.
  try {
  await expect.poll(() => {
    const readiness = trace.readiness(options);
    if (!readiness.missing.length && !readiness.pending.length) drainedThrough = trace.sequence;
    return readiness;
  }, {
    message: 'Current communications route requests finish before document navigation.', timeout: 15000,
  }).toEqual({missing: [], pending: []});
  assert.deepEqual(trace.requiredReadFailures(options), [], 'Required authenticated route reads succeed.');
  } catch (error) {
    trace.reportRequiredReadFailures(options);
    throw error;
  }
  trace.recordReadCancellations(options, drainedThrough);
  trace.lastDrained = drainedThrough;
  trace.log('route-reads-settled', {since: options.since, through: drainedThrough, required, pending: trace.snapshot().pending});
}
async function authenticatedRouteReady(page, {since, type, id} = {}) {
  await expect(page.locator('.app:not(.is-onboarding) > header')).toBeVisible();
  await expect(page.locator('.onboard')).toHaveCount(0);
  const required = ['/api/state', '/api/conversations', '/api/conversations/recipients', '/api/notifications', '/api/page-content/global'];
  if (type === 'chat') {
    required.push(`/api/conversations/${encodeURIComponent(id)}`, `/api/conversations/${encodeURIComponent(id)}/messages`);
    await expect(composer(page)).toBeVisible();
  }
  if (type === 'home') required.push('/api/page-content/home');
  await settleBrowserReads(page, {since, required});
}
async function person(id, width = 390) {
  const context = await browser.newContext({viewport: {width, height: 844}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const trace = observeCommunicationsPage({page, context, label: id, base, errors, getCheck: () => currentCheck, started: traceStarted});
  browserReads.set(page, trace);
  sessions.push({id, context, page, trace});
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/typing') && request.method() === 'POST') {
      typingRequests.push({user: id, url: request.url(), body: request.postDataJSON()});
    }
  });
  await page.addInitScript(installCommunicationsLifecycle);
  await page.addInitScript(() => {
    localStorage.setItem('gw-install-dismissed', 'true');
    localStorage.setItem('gw-preview-notice:v1', 'seen');
  });
  trace.beginTransition('signin', `${base}/__test/signin?user=${id}`);
  await page.goto(`${base}/__test/signin?user=${id}`);
  await page.getByRole('navigation', {name: 'Main navigation', exact: true}).waitFor();
  await authenticatedRouteReady(page, {since: 0, type: 'home'});
  trace.log('signin-ready');
  return page;
}
async function api(page, path, {method = 'GET', data} = {}) {
  const response = await page.request.fetch(base + path, {
    method,
    headers: {Origin: base, 'Content-Type': 'application/json'},
    ...(data === undefined ? {} : {data}),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = {raw}; }
  return {status: response.status(), body};
}
async function ok(page, path, options) {
  const result = await api(page, path, options);
  assert.ok(result.status >= 200 && result.status < 300,
    `${options?.method || 'GET'} ${path}: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}
async function denied(page, path, options) {
  const result = await api(page, path, options);
  assert.ok([403, 404].includes(result.status), `${options?.method || 'GET'} ${path} must deny access, got ${result.status}`);
  return result.body;
}
async function createConversation(page, type, memberIds, name) {
  const result = await ok(page, '/api/conversations', {
    method: 'POST', data: {requestId: randomUUID(), type, memberIds, ...(name ? {name} : {})},
  });
  assert.equal(typeof result.id, 'string');
  return result.id;
}
async function accept(page, id) {
  return ok(page, `/api/conversations/${id}/invitation`, {method: 'POST', data: {action: 'accept'}});
}
async function serverSend(page, id, body, requestId = randomUUID()) {
  const result = await ok(page, `/api/conversations/${id}/messages`, {method: 'POST', data: {requestId, body}});
  assert.ok(result.message?.id, 'Server returns the persisted message identity.');
  return result.message;
}
async function messages(page, id) {
  return (await ok(page, `/api/conversations/${id}/messages`)).messages;
}
async function summary(page, id) {
  return (await ok(page, '/api/conversations')).conversations.find(conversation => conversation.id === id);
}
async function navigate(page, type, id) {
  const trace = browserReads.get(page);
  await settleBrowserReads(page);
  const since = trace.lastDrained, target = `${base}/?qa=${randomUUID()}#/${type}${id ? '/' + encodeURIComponent(id) : ''}`;
  trace.beginTransition('navigation', target);
  await page.goto(target, {waitUntil: 'domcontentloaded'});
  await expect(page).toHaveURL(target);
  // main also exists during onboarding and cannot prove route readiness.
  await authenticatedRouteReady(page, {since, type, id});
  trace.log('navigation-ready', {target: diagnosticUrl(target), pending: trace.snapshot().pending});
}
async function reloadRoute(page, type, id, control) {
  const trace = browserReads.get(page);
  await settleBrowserReads(page);
  const since = trace.lastDrained, target = page.url();
  trace.beginTransition('reload', target);
  trace.log('reload-control', {source: control ? 'update-control' : 'page-reload'});
  if (control) await Promise.all([page.waitForEvent('domcontentloaded'), control.click()]);
  else await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page).toHaveURL(target);
  await authenticatedRouteReady(page, {since, type, id});
  trace.log('reload-ready', {target: diagnosticUrl(target), pending: trace.snapshot().pending});
}
async function inbox(page) {
  browserReads.get(page).log('inbox-navigation-start');
  await page.locator('header').getByRole('button', {name: /^Messages(?:\b|$)/}).click();
  await expect(page).toHaveURL(/#\/inbox$/);
  await expect(page.getByRole('heading', {name: 'Messages', exact: true})).toBeVisible();
  browserReads.get(page).log('inbox-navigation-ready');
}
const composer = page => page.getByRole('textbox', {name: 'Write a message', exact: true});
const sendButton = page => page.getByRole('button', {name: 'Send message', exact: true});
const messageRow = (page, text) => page.locator('[data-message-id]').filter({hasText: text});
async function send(page, text) {
  await composer(page).fill(text);
  await sendButton(page).click();
  await expect(messageRow(page, text)).toHaveCount(1);
  await expect(composer(page)).toHaveValue('');
}
async function assertAccessDenied(page, id) {
  await denied(page, `/api/conversations/${id}`);
  await denied(page, `/api/conversations/${id}/messages`);
  await denied(page, `/api/conversations/${id}/typing`);
  await denied(page, `/api/conversations/${id}/typing`, {method: 'POST', data: {typing: true}});
  await denied(page, `/api/conversations/${id}/read`, {method: 'POST', data: {sequence: 999999}});
  await denied(page, `/api/conversations/${id}/messages`, {method: 'POST', data: {requestId: randomUUID(), body: 'Forbidden test send'}});
}
async function noClip(page) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('main input,main select,main textarea,main button')]
      .filter(element => element.getClientRects().length && !element.classList.contains('sr-only') && !element.closest('[inert]')
        // Profile swatches intentionally scroll inside a bounded horizontal rail.
        && !element.closest('.profile-swatches-scroll'))
      .map(element => ({label: element.getAttribute('aria-label') || element.textContent, box: element.getBoundingClientRect().toJSON()}))
      .filter(({box}) => box.left < -1 || box.right > innerWidth + 1),
  }));
  assert.ok(geometry.scroll <= geometry.width + 1 && !geometry.controls.length,
    'Communications controls fit the viewport: ' + JSON.stringify(geometry));
}
async function composerFits(page, bounds, staleSample) {
  const geometry = await page.evaluate(({bounds, staleSample}) => {
    const root = document.documentElement;
    const keys = ['left', 'top', 'width', 'height'];
    const previous = keys.map(key => [key, root.style.getPropertyValue('--vv-' + key), root.style.getPropertyPriority('--vv-' + key)]);
    try {
      // Read geometry in the same task as these stale values are injected, so
      // no resize handler/frame can hide an unsafe CSS-only intermediate state.
      if (staleSample) for (const key of keys) root.style.setProperty('--vv-' + key, staleSample[key] + 'px');
      const viewport = window.visualViewport;
      const width = Math.min(root.clientWidth, viewport?.width || innerWidth);
      const height = Math.min(root.clientHeight, viewport?.height || innerHeight);
      const visible = bounds || {width, height,
        left: Math.max(0, Math.min(viewport?.offsetLeft || 0, root.clientWidth - width)),
        top: Math.max(0, Math.min(viewport?.offsetTop || 0, root.clientHeight - height))};
      const controls = ['.message-compose-area', '.message-writing textarea', '.message-writing > .send-button']
        .map(selector => ({selector, box: document.querySelector(selector)?.getBoundingClientRect().toJSON()}));
      return {visible, controls, css: Object.fromEntries(keys.map(key => [key, root.style.getPropertyValue('--vv-' + key)]))};
    } finally {
      if (staleSample) for (const [key, value, priority] of previous) {
        if (value) root.style.setProperty('--vv-' + key, value, priority);
        else root.style.removeProperty('--vv-' + key);
      }
    }
  }, {bounds, staleSample});
  const {visible} = geometry;
  assert.ok(geometry.controls.every(({box}) => box && box.width > 0 && box.height > 0
    && box.left >= visible.left - 1 && box.right <= visible.left + visible.width + 1
    && box.top >= visible.top - 1 && box.bottom <= visible.top + visible.height + 1),
  'Composer, textbox and Send stay inside the visible rectangle: ' + JSON.stringify(geometry));
}
async function viewportSampleApplied(page) {
  // setViewportSize changes layout before WebKit necessarily delivers its
  // resize events. Immediate bounds are checked separately; only convergence
  // of the published sample waits for the actual browser event/render cycle.
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement, viewport = window.visualViewport;
    const width = Math.min(root.clientWidth, viewport?.width || innerWidth);
    const height = Math.min(root.clientHeight, viewport?.height || innerHeight);
    const expected = {width, height,
      left: Math.max(0, Math.min(viewport?.offsetLeft || 0, root.clientWidth - width)),
      top: Math.max(0, Math.min(viewport?.offsetTop || 0, root.clientHeight - height))};
    return Object.entries(expected).every(([key, value]) => Math.abs(parseFloat(root.style.getPropertyValue('--vv-' + key)) - value) < 0.75);
  }), {message: 'Published viewport bounds converge to the current clamped browser sample.'}).toBe(true);
  await composerFits(page);
}
async function noTypingDrafts(secret) {
  assert.ok(typingRequests.length, 'At least one real typing request was observed.');
  for (const entry of typingRequests) {
    assert.deepEqual(Object.keys(entry.body).sort(), ['typing'], 'Typing requests contain only the boolean presence state.');
    assert.equal(typeof entry.body.typing, 'boolean');
    assert.ok(!JSON.stringify(entry).includes(secret), 'Typing transport never includes a draft.');
  }
}

let failure;
try {
  const alice = await person('alice', 390);
  const bob = await person('bob', 1280);
  const owner = await person('owner', 768);
  let directId, outsiderId, groupId, commentPostId;

  await check('authenticated sessions are isolated; unauthenticated messaging is denied', async () => {
    for (const [page, id] of [[alice, 'alice'], [bob, 'bob'], [owner, 'owner']]) {
      assert.equal((await ok(page, '/api/state')).selfId, id);
    }
    const anonymous = await browser.newContext();
    try {
      const response = await anonymous.request.get(base + '/api/conversations');
      assert.equal(response.status(), 401);
    } finally { await anonymous.close(); }
  });

  await check('Messages has one clear action row without a redundant options panel', async () => {
    await bob.goto(base + '/#/inbox');
    const empty=bob.locator('.messages-empty');await expect(empty).toBeVisible();
    await expect(bob.getByRole('complementary',{name:'Messaging options'})).toHaveCount(0);
    await expect(bob.locator('[data-panel-id="native-invitations"]')).toHaveCount(0);
    for(const width of [390,768,1280]){
      await bob.setViewportSize({width,height:950});
      await expect(bob.locator('[data-panel-page="inbox"]')).toHaveClass(width<700?/is-mobile/:/is-wide/);
      const heading=bob.locator('.messages-heading'),primary=heading.getByRole('button',{name:'New message',exact:true}),secondary=heading.getByRole('button',{name:'New group',exact:true});
      await expect(primary).toBeVisible();await expect(secondary).toBeVisible();await expect(primary).toHaveAttribute('data-button-level','primary');await expect(secondary).toHaveAttribute('data-button-level','secondary');
      assert.notEqual(await primary.evaluate(e=>getComputedStyle(e).backgroundColor),await secondary.evaluate(e=>getComputedStyle(e).backgroundColor));
      const a=await empty.boundingBox(),h=await heading.boundingBox();assert.ok(a&&h&&a.y>=h.y+h.height,'Inbox follows its heading and actions');
      assert.ok(await bob.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
    }
    await bob.setViewportSize({width:1280,height:950});
  });

  await check('DM invitation consent gates detail, message, read and typing access', async () => {
    directId = await createConversation(alice, 'direct', ['bob']);
    const secret = 'Private fixture DM before Bob accepts';
    await serverSend(alice, directId, secret);
    await assertAccessDenied(bob, directId);
    const pending = await ok(bob, '/api/conversations');
    assert.ok(pending.invitations.some(invitation => invitation.id === directId), 'Recipient sees the invitation.');
    assert.ok(!JSON.stringify(pending).includes(secret), 'Pending inbox does not leak message previews.');
    assert.ok(!JSON.stringify(await ok(bob, '/api/state')).includes(secret), 'Family state excludes private messages.');
    await inbox(bob);
    await expect(bob.getByRole('button', {name: 'Accept invitation', exact: true})).toHaveCount(1);
    assert.equal(await bob.getByText(secret, {exact: true}).count(), 0);
    await bob.getByRole('button', {name: 'Accept invitation', exact: true}).click();
    await expect.poll(async () => (await api(bob, `/api/conversations/${directId}`)).status).toBe(200);
    // Acceptance already navigates into chat. An independent API 200 does not
    // establish that its paired browser detail/messages reads have finished.
    await expect(bob).toHaveURL(new RegExp('#/chat/' + directId + '$'));
    await expect(messageRow(bob, secret)).toHaveCount(1);
    // Acceptance already opened this document's chat. Wait for its read
    // acknowledgement and resulting inbox refresh before any later navigation;
    // forcing a second document load here can interrupt that refresh in WebKit.
    await expect.poll(async () => (await summary(bob, directId))?.unreadCount).toBe(0);
    await settleBrowserReads(bob);
    await expect(messageRow(bob, secret)).toHaveCount(1);
  });

  await check('ordinary outsiders and nonparticipant family admins cannot read private conversations', async () => {
    outsiderId = await createConversation(alice, 'direct', ['owner']);
    await accept(owner, outsiderId);
    await serverSend(alice, outsiderId, 'Private fixture message to owner');
    await assertAccessDenied(bob, outsiderId);
    await assertAccessDenied(owner, directId);
    assert.ok(!(await ok(owner, '/api/conversations')).conversations.some(conversation => conversation.id === directId));
    assert.ok(!JSON.stringify(await ok(owner, '/api/state')).includes('Private fixture DM before Bob accepts'));
  });

  await check('cross-device messages, unread counts and read markers follow server acknowledgement', async () => {
    await inbox(bob);
    await navigate(alice, 'chat', directId);
    await expect(composer(alice)).toBeVisible();
    const text = 'Cross-device fixture message from Alice';
    await send(alice, text);
    await expect.poll(async () => (await summary(bob, directId))?.unreadCount || 0).toBeGreaterThan(0);
    await navigate(bob, 'chat', directId);
    await expect(messageRow(bob, text)).toHaveCount(1);
    await expect.poll(async () => (await summary(bob, directId))?.unreadCount).toBe(0);
    await expect(messageRow(alice, text)).toContainText(/read/i, {timeout: 20000});
    await send(bob, 'Cross-device fixture reply from Bob');
    await expect(messageRow(alice, 'Cross-device fixture reply from Bob')).toHaveCount(1, {timeout: 20000});
    await reloadRoute(bob, 'chat', directId);
    await expect(messageRow(bob, text)).toHaveCount(1);
    await expect(messageRow(bob, 'Cross-device fixture reply from Bob')).toHaveCount(1);
  });

  await check('profile Message entry reuses the direct conversation and Back returns to the profile', async () => {
    await navigate(alice, 'profile', 'bob');
    await alice.getByRole('button', {name: 'Message', exact: true}).click();
    await expect(alice).toHaveURL(/#\/chat-new\/bob$/);
    await alice.getByRole('button', {name: 'Start conversation', exact: true}).click();
    await expect(alice).toHaveURL(new RegExp('#/chat/' + directId + '$'));
    await expect(composer(alice)).toBeVisible();
    await alice.locator('.page-back').click();
    await expect(alice).toHaveURL(/#\/chat-new\/bob$/);
    await alice.locator('.page-back').click();
    await expect(alice).toHaveURL(/#\/profile\/bob$/);
    const duplicates = (await ok(alice, '/api/conversations')).conversations.filter(conversation => conversation.id === directId);
    assert.equal(duplicates.length, 1);
  });

  // Additional UI interruption, group and typing scenarios follow below.
  await check('pending send keeps the draft and never presents unacknowledged text as delivered', async () => {
    await navigate(alice, 'chat', directId);
    await expect(composer(alice)).toBeVisible();
    const text = 'Pending fixture message held before persistence';
    let entered = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    const handler = async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.body === text) {
        entered = true;
        await gate;
      }
      await route.continue();
    };
    await alice.route(`**/api/conversations/${directId}/messages`, handler);
    try {
      await composer(alice).fill(text);
      await sendButton(alice).click();
      await expect.poll(() => entered).toBe(true);
      await expect(alice.getByRole('button', {name: 'Sending message', exact: true})).toBeDisabled();
      await expect(alice.locator('.message-outbox')).toContainText(text);
      await expect(alice.locator('.message-outbox')).toContainText(/sending/i);
      await expect(composer(alice)).toHaveValue('');
      await composer(alice).fill('The next fixture draft while sending');
      assert.ok(!(await messages(bob, directId)).some(message => message.body === text), 'The held message is not on the server.');
      if (await messageRow(alice, text).count()) {
        await expect(messageRow(alice, text)).toContainText(/sending|pending/i);
        assert.ok(!/\b(sent|delivered|read)\b/i.test(await messageRow(alice, text).innerText()), 'Pending message cannot claim delivery.');
      }
      await alice.screenshot({path: `${output}/pending-send-mobile.png`});
      release();
      await expect(messageRow(alice, text)).toHaveCount(1);
      await expect(composer(alice)).toHaveValue('The next fixture draft while sending');
      await composer(alice).fill('');
    } finally {
      release();
      await alice.unroute(`**/api/conversations/${directId}/messages`, handler);
    }
  });

  await check('failed sends keep drafts through Back, update notices and same-tab reload', async () => {
    const text = 'Recover this private fixture draft after interruption';
    const nextDraft = 'Keep this independently typed next fixture draft';
    const handler = route => route.request().method() === 'POST'
      ? route.fulfill({status: 503, json: {error: 'Synthetic fixture send failure'}})
      : route.continue();
    await alice.route(`**/api/conversations/${directId}/messages`, handler);
    try {
      await composer(alice).fill(text);
      await sendButton(alice).click();
      await expect(alice.getByRole('button', {name: 'Retry sending', exact: true})).toBeVisible();
      await expect(alice.locator('.message-outbox')).toContainText(text);
      await composer(alice).fill(nextDraft);
      assert.ok(!(await messages(bob, directId)).some(message => message.body === text));
      await alice.getByRole('button', {name: 'Conversation details', exact: true}).click();
      await expect(alice).toHaveURL(new RegExp('#/chat-settings/' + directId + '$'));
      await alice.locator('.page-back').click();
      await expect(composer(alice)).toHaveValue(nextDraft);
      await expect(alice.locator('.message-outbox')).toContainText(text);
      await alice.route('**/build.json', route => route.fulfill({json: {version: 'ffffffffffffffffffff'}}));
      await alice.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(alice.getByRole('button', {name: 'Reload updated app', exact: true})).toBeVisible();
      await expect(composer(alice)).toHaveValue(nextDraft);
      await reloadRoute(alice, 'chat', directId, alice.getByRole('button', {name: 'Reload updated app', exact: true}));
      await expect(composer(alice)).toHaveValue(nextDraft);
      await expect(alice.locator('.message-outbox')).toContainText(text);
      assert.equal(await messageRow(alice, text).count(), 0, 'The preserved draft is still unsent after reload.');
      await alice.screenshot({path: `${output}/recovered-draft-mobile.png`});
    } finally {
      await alice.unroute(`**/api/conversations/${directId}/messages`, handler);
      await alice.unroute('**/build.json');
    }
    const retry = alice.getByRole('button', {name: 'Retry sending', exact: true});
    if (await retry.count()) await retry.click();
    else await sendButton(alice).click();
    await expect(messageRow(alice, text)).toHaveCount(1);
    await expect(composer(alice)).toHaveValue(nextDraft);
    await composer(alice).fill('');
  });

  await check('lost response retry reuses the request identity and creates one persisted message', async () => {
    const text = 'Idempotent fixture message with a lost response';
    let first = true, holdReads = true;
    const requests = [];
    const handler = async route => {
      const request = route.request();
      if (request.method() === 'GET' && holdReads) {
        await route.fulfill({status: 503, json: {error: 'Synthetic fixture polling interruption'}});
      } else if (request.method() === 'POST' && request.postDataJSON()?.body === text) {
        requests.push(request.postDataJSON());
        if (first) {
          first = false;
          const committed = await route.fetch();
          assert.ok(committed.ok(), 'The first attempt reached persistent storage before the response was lost.');
          await route.abort('connectionfailed');
        } else {
          await route.continue();
        }
      } else await route.continue();
    };
    await alice.route(`**/api/conversations/${directId}/messages*`, handler);
    try {
      await composer(alice).fill(text);
      await sendButton(alice).click();
      await expect(alice.getByRole('button', {name: 'Retry sending', exact: true})).toBeVisible();
      await expect(alice.locator('.message-outbox')).toContainText(text);
      assert.equal((await messages(bob, directId)).filter(message => message.body === text).length, 1);
      holdReads = false;
      await alice.getByRole('button', {name: 'Retry sending', exact: true}).click();
      await expect(composer(alice)).toHaveValue('');
      assert.equal(requests.length, 2, 'The retry performs exactly one additional send request.');
      assert.equal(requests[0].requestId, requests[1].requestId, 'A retry keeps the original request identity.');
      assert.equal((await messages(bob, directId)).filter(message => message.body === text).length, 1);
      const replay = await serverSend(alice, directId, text, requests[0].requestId);
      assert.equal((await messages(bob, directId)).filter(message => message.id === replay.id).length, 1);
      await expect(messageRow(alice, text)).toHaveCount(1);
    } finally { await alice.unroute(`**/api/conversations/${directId}/messages*`, handler); }
  });

  await check('direct typing is visible cross-device, expires and never contains draft text', async () => {
    await navigate(bob, 'chat', directId);
    await expect(composer(bob)).toBeVisible();
    const secret = 'Never broadcast this private unsent fixture text';
    await composer(alice).fill(secret);
    await expect(bob.getByRole('status').filter({hasText: /Alice.*typing/i})).toBeVisible({timeout: 15000});
    const presence = await ok(bob, `/api/conversations/${directId}/typing`);
    assert.ok(presence.typing.some(member => member.memberId === 'alice'));
    assert.ok(!JSON.stringify(presence).includes(secret));
    await noTypingDrafts(secret);
    // With no further keystrokes, idle presence must disappear on both devices.
    await expect.poll(async () => (await ok(bob, `/api/conversations/${directId}/typing`)).typing.some(member => member.memberId === 'alice'), {timeout: 15000}).toBe(false);
    await expect(bob.getByRole('status').filter({hasText: /Alice.*typing/i})).toHaveCount(0, {timeout: 15000});
    await composer(alice).fill('');
    await composer(alice).blur();
    await expect.poll(async () => (await ok(bob, `/api/conversations/${directId}/typing`)).typing.some(member => member.memberId === 'alice')).toBe(false);
    // Simulate an abruptly disconnected writer: establish presence through the
    // authenticated API, then send no stop or renewal while the server TTL ends.
    await ok(alice, `/api/conversations/${directId}/typing`, {method: 'POST', data: {typing: true}});
    const orphaned = await ok(bob, `/api/conversations/${directId}/typing`);
    const record = orphaned.typing.find(member => member.memberId === 'alice');
    assert.ok(record, 'Disconnected-writer presence exists before expiration.');
    assert.equal(orphaned.ttlMs, 8000);
    await expect.poll(async () => (await ok(bob, `/api/conversations/${directId}/typing`)).typing.some(member => member.memberId === 'alice'), {timeout: 12000}).toBe(false);
  });

  await check('group creation and invitation acceptance are explicit and keep history private', async () => {
    await inbox(alice);
    await alice.getByRole('button', {name: 'New group', exact: true}).click();
    await alice.getByRole('textbox', {name: 'Group name', exact: true}).fill('Fixture family planning');
    const picker = alice.getByRole('combobox', {name: /^Invite family members/});
    await expect(picker).toBeEnabled();
    await picker.fill('Bob');
    await alice.getByRole('option', {name: 'Bob', exact: true}).click();
    await expect(alice.getByRole('button', {name: 'Remove Bob', exact: true})).toBeVisible();
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    const createdResponse = alice.waitForResponse(response => response.url() === base + '/api/conversations' && response.request().method() === 'POST');
    await alice.getByRole('button', {name: 'Create group and invite', exact: true}).click();
    const creation = await createdResponse;
    assert.ok(creation.ok(), 'Group creation reaches the server once and succeeds: ' + creation.status());
    await expect(alice).toHaveURL(/#\/chat\/[^/?]+$/);
    groupId = decodeURIComponent(new URL(alice.url()).hash.split('/').at(-1));
    const group = (await ok(alice, `/api/conversations/${groupId}`)).conversation;
    assert.equal(group.type, 'group');
    assert.equal(group.myRole, 'owner');
    assert.equal(group.members.find(member => member.memberId === 'bob').status, 'pending');
    await send(alice, 'Group fixture secret before acceptance');
    await assertAccessDenied(bob, groupId);
    const invitations = await ok(bob, '/api/conversations');
    assert.ok(invitations.invitations.some(invitation => invitation.id === groupId));
    assert.ok(!JSON.stringify(invitations).includes('Group fixture secret before acceptance'));
    await inbox(bob);
    const invitation = bob.locator('.conversation-invite').filter({hasText: 'Fixture family planning'});
    await expect(invitation).toBeVisible();
    await invitation.getByRole('button', {name: 'Accept invitation', exact: true}).click();
    await expect(messageRow(bob, 'Group fixture secret before acceptance')).toHaveCount(1);
    await assertAccessDenied(owner, groupId);
    assert.ok(!JSON.stringify(await ok(owner, '/api/state')).includes('Group fixture secret before acceptance'));
  });

  await check('group settings enforce roles, support Back, and explain pending and declined invitations', async () => {
    await alice.getByRole('button', {name: 'Conversation details', exact: true}).click();
    await expect(alice).toHaveURL(new RegExp('#/chat-settings/' + groupId + '$'));
    // The route commits before the conversation detail and its form-value
    // effect finish hydrating. Prove the initial value before typing a change.
    await expect(alice.getByRole('heading', {name: 'Fixture family planning', exact: true})).toBeVisible();
    const groupName = alice.getByRole('textbox', {name: 'Group name', exact: true});
    const rename = alice.getByRole('button', {name: 'Save group name', exact: true});
    await expect(groupName).toHaveValue('Fixture family planning');
    await expect(rename).toBeDisabled();
    await groupName.fill('Fixture cousins planning');
    await expect(groupName).toHaveValue('Fixture cousins planning');
    await expect(rename).toBeEnabled();
    // An authenticated fixture API write stands for a second-device rename.
    // The arriving server name may refresh the heading, never the local draft.
    const remoteName = 'Fixture remote rename while Alice is editing';
    await ok(alice, `/api/conversations/${groupId}`, {method: 'PATCH', data: {name: remoteName}});
    await expect(alice.getByRole('heading', {name: remoteName, exact: true})).toBeVisible();
    await expect(groupName).toHaveValue('Fixture cousins planning');
    await expect(rename).toBeEnabled();
    const renamedResponse = alice.waitForResponse(response => response.url() === base + `/api/conversations/${groupId}` && response.request().method() === 'PATCH');
    const [renamed] = await Promise.all([renamedResponse, rename.click()]);
    assert.deepEqual(renamed.request().postDataJSON(), {name: 'Fixture cousins planning'}, 'The UI submits the deliberate renamed value, never an incompletely hydrated value.');
    assert.ok(renamed.ok(), 'The group rename is acknowledged by the server: ' + renamed.status());
    assert.equal((await ok(alice, `/api/conversations/${groupId}`)).conversation.name, 'Fixture cousins planning');
    await expect(alice.getByRole('heading', {name: 'Fixture cousins planning', exact: true})).toBeVisible();
    await denied(bob, `/api/conversations/${groupId}`, {method: 'PATCH', data: {name: 'Not authorized'}});
    const bobRow = alice.locator('.conversation-member').filter({has: alice.getByText('Bob', {exact: true})});
    const promotedResponse = alice.waitForResponse(response => response.url().startsWith(base + `/api/conversations/${groupId}/members/`) && response.request().method() === 'PATCH');
    await bobRow.getByRole('button', {name: 'Make manager', exact: true}).click();
    const promoted = await promotedResponse;
    assert.ok(promoted.ok(), 'Manager change is acknowledged: ' + promoted.status());
    await expect.poll(async () => (await ok(bob, `/api/conversations/${groupId}`)).conversation.myRole).toBe('manager');
    await bobRow.getByRole('button', {name: 'Remove manager role', exact: true}).click();
    await expect.poll(async () => (await ok(bob, `/api/conversations/${groupId}`)).conversation.myRole).toBe('member');
    await alice.locator('.page-back').click();
    await expect(alice).toHaveURL(new RegExp('#/chat/' + groupId + '$'));
    await expect(alice.getByRole('heading', {name: 'Fixture cousins planning', exact: true})).toBeVisible();
    await alice.getByRole('button', {name: 'Conversation details', exact: true}).click();
    const picker = alice.getByRole('combobox', {name: /^Invite family members/});
    await picker.fill('Owner');
    await alice.getByRole('option', {name: 'Owner', exact: true}).click();
    await alice.getByRole('button', {name: 'Send invitations', exact: true}).click();
    await expect(alice.locator('.conversation-member').filter({has: alice.getByText('Owner', {exact: true})})).toContainText('Invited');
    await assertAccessDenied(owner, groupId);
    await inbox(owner);
    const invitation = owner.locator('.conversation-invite').filter({hasText: 'Fixture cousins planning'});
    await invitation.getByRole('button', {name: 'Decline invitation', exact: true}).click();
    await expect(invitation).toHaveCount(0);
    await assertAccessDenied(owner, groupId);
  });

  await check('removed participants lose API access and already-open UI history', async () => {
    await navigate(bob, 'chat', groupId);
    await expect(messageRow(bob, 'Group fixture secret before acceptance')).toHaveCount(1);
    const bobRow = alice.locator('.conversation-member').filter({has: alice.getByText('Bob', {exact: true})});
    await bobRow.getByRole('button', {name: 'Remove', exact: true}).click();
    await expect(alice.getByRole('heading', {name: 'Remove Bob?', exact: true})).toBeVisible();
    await alice.getByRole('button', {name: 'Confirm removal', exact: true}).click();
    await expect(bobRow).toHaveCount(0);
    await assertAccessDenied(bob, groupId);
    await expect(bob.getByRole('heading', {name: 'Conversation unavailable', exact: true})).toBeVisible({timeout: 20000});
    assert.equal(await messageRow(bob, 'Group fixture secret before acceptance').count(), 0);
    assert.ok(!(await ok(bob, '/api/conversations')).conversations.some(conversation => conversation.id === groupId));
    await bob.screenshot({path: `${output}/removed-access-desktop.png`});
  });

  await check('comment typing expires without broadcasting text and inherits private-post visibility', async () => {
    const created = await ok(alice, '/api/posts', {method: 'POST', data: {body: 'Fixture public post for comment presence'}});
    commentPostId = created.id;
    const privatePost = await ok(alice, '/api/posts', {method: 'POST', data: {body: 'Fixture private post for comment presence', groupId: 'private-group'}});
    await denied(bob, `/api/posts/${privatePost.id}/typing`);
    await denied(bob, `/api/posts/${privatePost.id}/typing`, {method: 'POST', data: {typing: true}});
    await denied(owner, `/api/posts/${privatePost.id}/typing`);
    await navigate(alice, 'post', created.id);
    await navigate(bob, 'post', created.id);
    const field = alice.getByRole('textbox', {name: 'Write a comment…', exact: true});
    await expect(field).toBeVisible();
    const secret = 'Do not transmit this unsent comment fixture draft';
    await field.fill('');
    await field.pressSequentially(secret);
    await expect(bob.getByRole('status').filter({hasText: /Alice.*typing/i})).toBeVisible({timeout: 15000});
    const presence = await ok(bob, `/api/posts/${created.id}/typing`);
    assert.ok(presence.typing.some(member => member.memberId === 'alice'));
    assert.ok(!JSON.stringify(presence).includes(secret));
    assert.equal((await ok(bob, `/api/posts/${created.id}/comments`)).comments.length, 0);
    await noTypingDrafts(secret);
    await expect.poll(async () => (await ok(bob, `/api/posts/${created.id}/typing`)).typing.some(member => member.memberId === 'alice'), {timeout: 15000}).toBe(false);
    await expect(bob.getByRole('status').filter({hasText: /Alice.*typing/i})).toHaveCount(0, {timeout: 15000});
    await field.fill('');
  });

  await check('comment send stays pending honestly and failed draft survives the update reload flow', async () => {
    const text = 'Preserve this failed fixture comment until it is saved';
    const field = alice.getByRole('textbox', {name: 'Write a comment…', exact: true});
    let entered = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    const handler = async route => {
      const request = route.request();
      if (request.method() === 'POST' && request.postDataJSON()?.type === 'ADD_COMMENT') {
        entered = true;
        await gate;
        await route.fulfill({status: 503, json: {error: 'Synthetic fixture comment failure'}});
      } else await route.continue();
    };
    await alice.route('**/api/commands', handler);
    await alice.route('**/build.json', route => route.fulfill({json: {version: 'eeeeeeeeeeeeeeeeeeee'}}));
    try {
      await field.fill(text);
      await alice.getByRole('button', {name: 'Send', exact: true}).click();
      await expect.poll(() => entered).toBe(true);
      await expect(alice.getByRole('button', {name: 'Sending', exact: true})).toBeDisabled();
      await expect(field).toHaveValue(text);
      assert.equal((await ok(bob, `/api/posts/${commentPostId}/comments`)).comments.length, 0);
      await alice.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(alice.getByRole('button', {name: 'Reload updated app', exact: true})).toBeDisabled();
      release();
      await expect(alice.getByRole('button', {name: 'Send', exact: true})).toBeEnabled();
      await expect(alice.getByRole('alert').filter({hasText: 'Synthetic fixture comment failure'})).toBeVisible();
      await expect(field).toHaveValue(text);
      await expect(alice.getByRole('button', {name: 'Reload updated app', exact: true})).toBeEnabled();
      await reloadRoute(alice, 'post', commentPostId, alice.getByRole('button', {name: 'Reload updated app', exact: true}));
      await expect(field).toHaveValue(text);
      await alice.screenshot({path: `${output}/comment-draft-reload-${engineName}.png`});
    } finally {
      release();
      await alice.unroute('**/api/commands', handler);
      await alice.unroute('**/build.json');
    }
    await alice.getByRole('button', {name: 'Send', exact: true}).click();
    await expect(alice.locator('.chat-bubble p').filter({hasText: text})).toHaveCount(1);
    await expect(field).toHaveValue('');
    await expect.poll(async () => (await ok(bob, `/api/posts/${commentPostId}/comments`)).comments.filter(comment => comment.body === text).length).toBe(1);
  });

  await check('private attachment upload, removal, send and download retain participant boundaries', async () => {
    await navigate(alice, 'chat', directId);
    const picker = alice.getByLabel('Choose private attachments', {exact: true});
    const file = {name: 'synthetic-private.png', mimeType: 'image/png', buffer: createTestPng()};
    await picker.setInputFiles(file);
    const draftFiles = alice.getByRole('list', {name: 'Uploaded attachments', exact: true});
    await expect(draftFiles).toContainText(file.name);
    await draftFiles.getByRole('button', {name: 'Remove ' + file.name, exact: true}).click();
    await expect(draftFiles).toHaveCount(0);
    await picker.setInputFiles(file);
    await expect(draftFiles).toContainText(file.name);
    const body = 'Synthetic private attachment message';
    await composer(alice).fill(body);
    await sendButton(alice).click();
    await expect(alice.locator('.message-outbox[aria-label="Unconfirmed message"]')).toHaveCount(0);
    await expect(alice.locator('.private-message-files').getByRole('link', {name: /synthetic-private\.png/})).toBeVisible();
    const sent = (await messages(alice, directId)).find(message => message.body === body);
    assert.equal(sent.files.length, 1);
    const path = sent.files[0].url;
    assert.match(path, /^\/api\/conversations\/[^/]+\/attachments\/[^/]+$/);
    for (const [page, account] of [[alice, 'alice'], [bob, 'bob']]) {
      const response = await page.request.get(base + path + '?account=' + account);
      assert.equal(response.status(), 200);
      assert.equal(response.headers()['cache-control'], 'private, no-store');
      assert.deepEqual(await response.body(), file.buffer);
    }
    await denied(owner, path + '?account=owner');
    const anonymous = await browser.newContext();
    try { assert.equal((await anonymous.request.get(base + path + '?account=alice')).status(), 401); }
    finally { await anonymous.close(); }
    assert.equal((await alice.request.get(base + path + '?account=bob')).status(), 409);
  });

  await check('app and conversation headers share a connected themed background in Glass and Flat',async()=>{
    for(const material of ['ios','android']) for(const theme of ['light','dark']) for(const width of [390,768]){
      await alice.setViewportSize({width,height:844});
      await alice.evaluate(({material,theme})=>{localStorage.setItem('gw-platform',material);localStorage.setItem('gw-theme',theme)},{material,theme});
      await navigate(alice,'chat',directId);await expect(composer(alice)).toBeVisible();
      await expect(alice.locator('html')).toHaveAttribute('data-platform',material);await expect(alice.locator('html')).toHaveAttribute('data-theme',theme);
      await composer(alice).scrollIntoViewIfNeeded();
      await expect.poll(()=>alice.evaluate(()=>{
        const header=document.querySelector('.app>.app-header'),nav=document.querySelector('.page-navigation-header');
        return Math.abs(nav.getBoundingClientRect().top-header.getBoundingClientRect().bottom);
      })).toBeLessThanOrEqual(1);
      const surfaces=await alice.evaluate(()=>{
        const h=document.querySelector('.app>.app-header'),n=document.querySelector('.page-navigation-header');
        const a=getComputedStyle(h,'::before'),b=getComputedStyle(n,'::before'),fade=getComputedStyle(h,'::after');
        return {titleHeight:n.getBoundingClientRect().height,pageLayerDisplay:b.display,header:{background:a.backgroundColor,image:a.backgroundImage,blur:a.backdropFilter||a.webkitBackdropFilter,bottom:a.bottom,left:a.left,right:a.right},page:{background:b.backgroundColor,image:b.backgroundImage,blur:b.backdropFilter||b.webkitBackdropFilter,top:b.top,left:b.left,right:b.right},pageBackground:getComputedStyle(n).backgroundColor,fade:{height:fade.height,image:fade.backgroundImage,blur:fade.backdropFilter||fade.webkitBackdropFilter,mask:fade.maskImage||fade.webkitMaskImage},clip:b.clipPath,bottom:b.bottom};
      });
      assert.equal(surfaces.page.top,'-1px');
      assert.equal(surfaces.header.left,surfaces.page.left);assert.equal(surfaces.header.right,surfaces.page.right);
      if(material==='ios'){
        assert.match(surfaces.header.blur,/blur\(18px\)/);assert.equal(surfaces.pageLayerDisplay,'none');assert.ok(Math.abs(parseFloat(surfaces.header.bottom)+Math.ceil(surfaces.titleHeight))<=1,'One upper backdrop covers the entire title row');
        assert.equal(surfaces.page.image,'none');assert.equal(surfaces.pageBackground,'rgba(0, 0, 0, 0)');assert.equal(surfaces.bottom,'0px');assert.equal(surfaces.clip,'inset(0px)');assert.equal(surfaces.fade.height,'24px');assert.match(surfaces.fade.image,/linear-gradient/);assert.match(surfaces.fade.blur,/blur\(18px\)/);assert.match(surfaces.fade.mask,/linear-gradient/);
      }else{assert.equal(surfaces.header.bottom,'-1px');assert.equal(surfaces.header.background,surfaces.page.background);assert.equal(surfaces.page.image,'none');assert.equal(surfaces.page.blur,'none');}
      await noClip(alice);await alice.screenshot({path:`${output}/connected-header-${width}-${theme}-${material}-${engineName}.png`});
    }
    await alice.evaluate(()=>{localStorage.setItem('gw-platform','ios');localStorage.setItem('gw-theme','dark')});await navigate(alice,'chat',directId);
  });

  await check('attachment-capable mobile composer fits reduced-height keyboard simulation and respects reduced motion', async () => {
    await navigate(alice, 'chat', directId);
    await expect(composer(alice)).toBeVisible();
    const picker = alice.getByLabel('Choose private attachments', {exact: true});
    await expect(picker).toHaveCount(1);
    await expect(picker).toBeEnabled();
    await expect(alice.getByRole('button', {name: 'Attach a private file', exact: true})).toBeEnabled();
    for (const material of ['ios', 'android']) {
      await alice.evaluate(material => localStorage.setItem('gw-platform', material), material);
      await navigate(alice, 'chat', directId);
      await expect(composer(alice)).toBeVisible();
      await expect(alice.locator('html')).toHaveAttribute('data-platform', material);
      for (const {width, height} of [{width: 320, height: 844}, {width: 390, height: 844},
        {width: 768, height: 844}, {width: 844, height: 390}, {width: 390, height: 844}]) {
        await alice.setViewportSize({width, height});
        await noClip(alice);
        await composerFits(alice, {left: 0, top: 0, width, height});
        await composerFits(alice, {left: 0, top: 0, width, height}, {left: 100, top: 160, width: 1024, height: 1024});
        await viewportSampleApplied(alice);
        await noClip(alice);
        await alice.screenshot({path: `${output}/conversation-${width}x${height}-${material}-${engineName}.png`});
      }
      // Deterministic visual-only keyboard and pinch/pan geometry simulations.
      // These assert real DOM bounds, without claiming physical-device coverage.
      for (const visible of [{left: 0, top: 140, width: 390, height: 430}, {left: 70, top: 140, width: 240, height: 380}]) {
        await composerFits(alice, visible, visible);
      }
    }
    await alice.evaluate(() => localStorage.setItem('gw-platform', 'ios'));
    await navigate(alice, 'chat', directId);
    await expect(composer(alice)).toBeVisible();
    await alice.setViewportSize({width: 390, height: 430});
    await navigate(bob, 'chat', directId);
    await expect(composer(bob)).toBeVisible();
    await composer(bob).fill('Fixture remote typing for reduced-motion visibility');
    await expect(alice.locator('.remote-typing .activity-dots-visual')).toBeVisible({timeout: 15000});
    const dotAnimations = await alice.locator('.remote-typing .activity-dots-visual > span').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
    assert.deepEqual(dotAnimations, ['none', 'none', 'none'], 'Visible typing dots respect reduced motion.');
    await composer(alice).fill('Fixture keyboard visibility draft');
    for (const width of [320, 390, 768]) {
      await alice.setViewportSize({width, height: 430});
      await noClip(alice);
      await composerFits(alice, {left: 0, top: 0, width, height: 430});
      await composer(alice).focus();
      await composer(alice).scrollIntoViewIfNeeded();
      await viewportSampleApplied(alice);
      await noClip(alice);
      const box = await sendButton(alice).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 431,
        'Send stays inside the reduced-height viewport while composing: ' + JSON.stringify(box));
    }
    await alice.setViewportSize({width: 390, height: 430});
    await viewportSampleApplied(alice);
    assert.equal(await alice.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    const animated = await alice.locator('main').evaluate(root => root.getAnimations({subtree: true})
      .filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity)
      .map(animation => ({duration: animation.effect.getTiming().duration, target: animation.effect.target?.className})));
    assert.deepEqual(animated, [], 'Reduced-motion mode has no perpetual activity animation.');
    await alice.screenshot({path: `${output}/keyboard-height-simulation-${engineName}.png`});
    await composer(alice).fill('');
    await composer(bob).fill('');
    await alice.setViewportSize({width: 390, height: 844});
  });

  await check('shared profile photo control stays centered, keyboard accessible and honest; age consent remains a horizontal checkbox row', async () => {
    await navigate(alice, 'edit-profile');
    const initialProfile = (await ok(alice, '/api/state')).members.find(member => member.id === 'alice');
    assert.ok(!initialProfile.photo, 'Fixture deliberately tests an account with no profile photo.');
    const photoControl = alice.getByRole('region', {name: 'Profile appearance', exact: true}).locator('.image-upload-control');
    const placeholder = photoControl.locator('.image-upload-placeholder');
    const choose = photoControl.locator('button.image-upload-choose').and(photoControl.getByRole('button', {name: 'Choose profile photo', exact: true}));
    const picker = photoControl.locator('input[type="file"]');
    await expect(placeholder).toHaveText('No photo chosen');
    await expect(photoControl.locator('.image-upload-preview > img')).toHaveCount(0);
    await expect(picker).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif');
    await expect(picker).toHaveAttribute('aria-label', 'Profile photo file picker');
    await expect(picker).toHaveAttribute('tabindex', '-1');
    const checkbox = alice.getByRole('checkbox', {name: 'Show my age on my family profile', exact: true});
    for (const width of [320, 390, 768]) {
      await alice.setViewportSize({width, height: 844});
      await choose.scrollIntoViewIfNeeded();
      await choose.focus();
      await expect(choose).toBeFocused();
      const actionGeometry = await choose.evaluate(element => {
        const css = getComputedStyle(element), box = element.getBoundingClientRect(), action = element.querySelector('.image-upload-action').getBoundingClientRect();
        return {display: css.display, alignItems: css.alignItems, justifyItems: css.justifyItems, width: box.width, height: box.height,
          x: Math.abs((action.left + action.right - box.left - box.right) / 2), y: Math.abs((action.top + action.bottom - box.top - box.bottom) / 2)};
      });
      assert.deepEqual({display: actionGeometry.display, alignItems: actionGeometry.alignItems, justifyItems: actionGeometry.justifyItems},
        {display: 'grid', alignItems: 'center', justifyItems: 'center'});
      assert.ok(actionGeometry.x < 3 && actionGeometry.y < 3 && actionGeometry.width >= 44 && actionGeometry.height >= 44,
        'The one-tap photo action stays centered and comfortably sized: ' + JSON.stringify(actionGeometry));
      await checkbox.scrollIntoViewIfNeeded();
      const geometry = await checkbox.evaluate(input => {
        const label = input.closest('label'), css = getComputedStyle(label);
        const textNode = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const range = document.createRange();
        range.selectNode(textNode);
        const text = range.getClientRects()[0], box = input.getBoundingClientRect();
        return {display: css.display, input: box.toJSON(), text: {left: text.left, top: text.top}};
      });
      assert.equal(geometry.display, 'flex');
      assert.ok(geometry.input.right <= geometry.text.left && Math.abs(geometry.input.top - geometry.text.top) < 12,
        'Checkbox remains beside the first text line: ' + JSON.stringify(geometry));
      await noClip(alice);
      await alice.screenshot({path: `${output}/profile-checkbox-${width}-${engineName}.png`});
    }
    await picker.setInputFiles({name: 'synthetic-invalid-profile.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic invalid profile file')});
    await expect(photoControl.getByRole('alert')).toHaveText('Choose a JPEG, PNG, WebP or GIF profile photo.');
    await expect(placeholder).toHaveText('No photo chosen');
    await expect(choose).toBeEnabled();
    await picker.setInputFiles({name: 'synthetic-profile.png', mimeType: 'image/png', buffer: createTestPng()});
    const photo = photoControl.getByRole('img', {name: 'Alice profile photo', exact: true});
    await expect(photo).toHaveAttribute('src', /^\/api\/media\/[A-Za-z0-9_-]+$/);
    await expect.poll(() => photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(photoControl.getByRole('alert')).toHaveCount(0);
    const editPhoto = photoControl.getByRole('button', {name: 'Edit profile photo', exact: true});
    await editPhoto.focus();
    await expect(editPhoto).toBeFocused();
    await alice.getByRole('button', {name: 'Remove photo', exact: true}).click();
    await expect(placeholder).toHaveText('No photo chosen');
    await expect(photoControl.locator('img')).toHaveCount(0);
    await expect(choose).toBeEnabled();
    await expect(checkbox).toBeChecked({checked: !!initialProfile.shareAge});
    await expect(alice.getByLabel('Custom profile color', {exact: true})).toHaveValue(initialProfile.profileColor || '#4f996c');
    assert.deepEqual((await ok(alice, '/api/state')).members.find(member => member.id === 'alice'), initialProfile,
      'Choosing and removing a draft photo does not silently save appearance or birthday privacy.');
  });

  await check('profile contacts and photo discussions preserve audience, export consent and cross-account saves',async()=>{
    await navigate(alice,'edit-profile');
    const picker=alice.getByRole('region',{name:'Profile appearance',exact:true}).locator('input[type="file"]');
    await picker.setInputFiles({name:'photo-discussion.png',mimeType:'image/png',buffer:createTestPng()});
    await expect(alice.getByRole('img',{name:'Alice profile photo',exact:true})).toHaveAttribute('src',/^\/api\/media\//);
    await alice.getByRole('button',{name:'Save profile',exact:true}).click();
    await expect(alice).toHaveURL(/#\/profile\/alice$/);
    const savedPhoto=(await ok(alice,'/api/state')).members.find(member=>member.id==='alice').photo;assert.match(savedPhoto,/^\/api\/media\//,'Profile photo is committed before the second account reads it');
    await navigate(bob,'profile','alice');
    await expect(bob.locator('.profile-overview .profile-photo-open img')).toHaveAttribute('src',savedPhoto);
    await bob.locator('.profile-overview').getByRole('button',{name:'View Alice profile photo',exact:true}).click();
    await expect(bob.locator('.photo-viewer-image')).toBeVisible();
    const photoViewport=bob.viewportSize();
    for(const width of [390,1280]){
      await bob.setViewportSize({width,height:844});
      const edge=await bob.locator('.app>.app-header').evaluate(node=>{const style=getComputedStyle(node,'::after');return {display:style.display,blur:style.backdropFilter||style.webkitBackdropFilter,mask:style.maskImage||style.webkitMaskImage}});
      assert.notEqual(edge.display,'none');assert.match(edge.blur,/blur\(18px\)/);assert.match(edge.mask,/linear-gradient/);
      await noClip(bob);await bob.screenshot({path:`${output}/photo-glass-edge-${width}-${engineName}.png`});
    }
    await bob.setViewportSize(photoViewport);
    const comment=bob.getByRole('textbox',{name:'Write a comment…',exact:true});
    await comment.fill('A synthetic comment on this profile photo');await bob.getByRole('button',{name:'Send',exact:true}).click();
    await expect(bob.locator('.chat-bubble').filter({hasText:'A synthetic comment on this profile photo'})).toHaveCount(1);await expect(comment).toHaveValue('');
    await bob.locator('.photo-viewer-actions').getByRole('button',{name:'Add reaction',exact:true}).click();await bob.getByRole('button',{name:'React ❤️',exact:true}).click();
    await expect(bob.getByRole('button',{name:'Remove your ❤️ reaction',exact:true})).toBeVisible();
    await navigate(alice,'photo','alice');await expect(alice.locator('.chat-bubble').filter({hasText:'A synthetic comment on this profile photo'})).toHaveCount(1);
    const photo=await ok(alice,'/api/photo-discussions/profile/alice');assert.equal(photo.comments.length,1);assert.equal(photo.reactions.length,1);
    const bytes=await alice.request.get(base+'/api/photo-discussions/profile/alice/download');assert.equal(bytes.status(),200);assert.match(bytes.headers()['content-disposition'],/^attachment;/);assert.deepEqual(await bytes.body(),createTestPng());
    await navigate(alice,'edit-profile');const allowPhotoSave=alice.getByRole('checkbox',{name:'Let family save my profile photo',exact:true});await settlePointerTarget(allowPhotoSave);await allowPhotoSave.uncheck();await expect(allowPhotoSave).not.toBeChecked();await alice.getByRole('button',{name:'Save profile',exact:true}).click();
    await expect(alice).toHaveURL(/#\/profile\/alice$/);
    assert.equal((await ok(alice,'/api/state')).members.find(member=>member.id==='alice').allowPhotoSave,false,'Photo-save preference is committed before cross-account enforcement');
    await navigate(bob,'photo','alice');await expect(bob.getByRole('button',{name:'Save photo',exact:true})).toHaveCount(0);await expect(bob.getByText('Photo saving is turned off for this profile.',{exact:true})).toBeVisible();assert.equal((await bob.request.get(base+'/api/photo-discussions/profile/alice/download')).status(),403);
    await ok(alice,'/api/commands',{method:'POST',data:{type:'SAVE_CONTACT',requestId:randomUUID(),contact:{name:'Alice',phone:'+1 555 0100',email:'alice@example.test',address:'1 Example Lane',website:'https://example.test',optIn:true,visibility:'Selected family members',selectedIds:['bob'],useProfile:true}}});
    await navigate(bob,'profile','alice');await expect(bob.getByRole('link',{name:'Phone: +1 555 0100',exact:true})).toBeVisible();await expect(bob.getByRole('link',{name:'Email: alice@example.test',exact:true})).toHaveAttribute('href','mailto:alice%40example.test');
    await bob.getByRole('button',{name:'Add to Contacts',exact:true}).click();const guide=bob.getByRole('dialog',{name:'Add to your contacts',exact:true});await expect(guide).toBeVisible();
    const downloading=bob.waitForEvent('download');await guide.getByRole('button',{name:'Download contact card',exact:true}).click();const downloaded=await downloading,stream=await downloaded.createReadStream();assert.ok(stream);const chunks=[];for await(const chunk of stream)chunks.push(chunk);const card=Buffer.concat(chunks).toString('utf8');assert.match(card,/BEGIN:VCARD/);assert.match(card,/FN:Alice/);assert.match(card,/TEL;TYPE=CELL:\+1 555 0100/);assert.doesNotMatch(card,/PHOTO;/,'Photo optout applies to contact export too');
    await guide.getByRole('button',{name:/^Close/}).click();await navigate(owner,'profile','alice');await expect(owner.getByRole('link',{name:'Phone: +1 555 0100',exact:true})).toHaveCount(0);await expect(owner.getByText('Contact details are private or haven’t been shared.',{exact:true})).toBeVisible();
    await bob.screenshot({path:`${output}/profile-contact-${engineName}.png`});await alice.screenshot({path:`${output}/profile-photo-permission-${engineName}.png`});
  });

  for (const {page} of sessions) await settleBrowserReads(page);
  assert.deepEqual(errors, [], 'No unhandled browser exceptions.');
} catch (error) {
  failure = error.stack || error.message;
  console.error('GW COMMUNICATIONS FAILURE', failure);
  console.log('::error title=GW communications browser::' + String(failure).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D'));
  for (const {id, page} of sessions) {
    console.error('Failed-page fixture identity', id, 'URL', page.url());
    console.error((await page.locator('body').innerText({timeout: 3000}).catch(() => '<unavailable>')).slice(-2500));
    await page.screenshot({path: `${output}/failure-${id}-${engineName}.png`, timeout: 5000}).catch(() => {});
  }
  throw error;
} finally {
  const persist = () => Promise.all([
    writeFile(`${output}/results-${engineName}.json`, JSON.stringify({
      browser: engineName, results, errors, ...(failure ? {failure} : {}),
      classifiedReadCancellations: sessions.flatMap(({id, trace}) => trace.classifiedReadCancellations.map(value => ({user: id, ...value}))),
      limitations: ['Reduced-height viewport is a keyboard layout simulation. No physical-device keyboard or installed-PWA claim.'],
    }, null, 2)),
    writeFile(`${output}/network-${engineName}.json`, JSON.stringify({browser: engineName, pages: sessions.map(({id, trace}) => ({
      user: id, documentEpoch: trace.documentEpoch, documentTimeOrigin: trace.documentTimeOrigin,
      reads: trace.reads, transitions: trace.transitions, classifiedReadCancellations: trace.classifiedReadCancellations,
      droppedEvents: trace.droppedEvents, pending: trace.snapshot().pending, events: trace.events,
    }))}, null, 2)),
  ]);
  await persist();
  currentCheck = 'browser cleanup';
  for (const {trace} of sessions) trace.log('browser-close-start', {pending: trace.snapshot().pending});
  try {await browser.close();} finally {await persist();}
}


