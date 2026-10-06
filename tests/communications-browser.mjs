// Hosted-only authenticated communications checks. Start the isolated fixture on
// port 4175 first. Never substitute these checks for physical-device keyboard QA.
import {chromium, webkit, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';

if (!process.env.CI && process.env.GW_HOSTED_BROWSER_QA !== '1') {
  throw new Error('Communications browser QA runs only in the authorized hosted CI environment.');
}
const base = process.env.GW_COMMUNICATIONS_URL || 'http://127.0.0.1:4175';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), 'Fixture origin must remain local to hosted CI.');
const output = 'docs/communications-qa';
const results = [], errors = [], sessions = [], typingRequests = [];
const engineName = process.env.GW_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch({headless: true});
await mkdir(output, {recursive: true});

async function check(name, run) {
  await run();
  results.push({check: name, status: 'passed'});
  console.log('COMMUNICATIONS PASS:', name);
}
async function person(id, width = 390) {
  const context = await browser.newContext({viewport: {width, height: 844}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  sessions.push({id, context, page});
  page.on('pageerror', error => errors.push({user: id, error: error.message}));
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/typing') && request.method() === 'POST') {
      typingRequests.push({user: id, url: request.url(), body: request.postDataJSON()});
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('gw-install-dismissed', 'true');
    localStorage.setItem('gw-preview-notice:v1', 'seen');
  });
  await page.goto(`${base}/__test/signin?user=${id}`);
  await page.getByRole('navigation', {name: 'Main navigation', exact: true}).waitFor();
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
  await page.goto(`${base}/?qa=${randomUUID()}#/${type}${id ? '/' + encodeURIComponent(id) : ''}`, {waitUntil: 'domcontentloaded'});
  await expect(page.locator('main')).toBeVisible();
}
async function inbox(page) {
  await page.locator('header').getByRole('button', {name: /^Messages(?:\b|$)/}).click();
  await expect(page).toHaveURL(/#\/inbox$/);
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
    await navigate(bob, 'chat', directId);
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
    await bob.reload({waitUntil: 'domcontentloaded'});
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
      await alice.getByRole('button', {name: 'Reload updated app', exact: true}).click();
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
    await alice.getByRole('textbox', {name: 'Group name', exact: true}).fill('Fixture cousins planning');
    await alice.getByRole('button', {name: 'Save group name', exact: true}).click();
    await expect(alice.getByRole('heading', {name: 'Fixture cousins planning', exact: true})).toBeVisible();
    await denied(bob, `/api/conversations/${groupId}`, {method: 'PATCH', data: {name: 'Not authorized'}});
    const bobRow = alice.locator('.conversation-member').filter({has: alice.getByText('Bob', {exact: true})});
    await bobRow.getByRole('button', {name: 'Make manager', exact: true}).click();
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
      await alice.getByRole('button', {name: 'Reload updated app', exact: true}).click();
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

  await check('text-only mobile composer fits reduced-height keyboard simulation and respects reduced motion', async () => {
    await navigate(alice, 'chat', directId);
    await expect(composer(alice)).toBeVisible();
    assert.equal(await alice.locator('main input[type="file"]').count(), 0, 'Private messaging is text-only.');
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

  await check('profile placeholder initials stay centered and age consent remains a horizontal checkbox row', async () => {
    await navigate(alice, 'edit-profile');
    const placeholder = alice.locator('.avatar.profile-style-avatar');
    await expect(placeholder).toBeVisible();
    const style = await placeholder.evaluate(element => {
      const css = getComputedStyle(element);
      return {tag: element.tagName, display: css.display, alignItems: css.alignItems, justifyItems: css.justifyItems};
    });
    assert.notEqual(style.tag, 'IMG', 'Fixture deliberately tests an account with no profile photo.');
    assert.deepEqual({display: style.display, alignItems: style.alignItems, justifyItems: style.justifyItems},
      {display: 'grid', alignItems: 'center', justifyItems: 'center'});
    const checkbox = alice.getByRole('checkbox', {name: 'Show my age on my family profile', exact: true});
    for (const width of [320, 390, 768]) {
      await alice.setViewportSize({width, height: 844});
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
  });

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
  await writeFile(`${output}/results-${engineName}.json`, JSON.stringify({
    browser: engineName, results, errors, ...(failure ? {failure} : {}),
    limitations: ['Reduced-height viewport is a keyboard layout simulation. No physical-device keyboard or installed-PWA claim.'],
  }, null, 2));
  await browser.close();
}
