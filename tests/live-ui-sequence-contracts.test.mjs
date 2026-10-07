// Node-only contracts for the actual hosted Live sequence. These never launch
// a browser and are not evidence of a hosted Chromium or WebKit pass.
import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('./live-browser.mjs');
const manage = read('../src/manage-family.jsx');
const app = read('../src/react-app.jsx');
const sheet = read('../src/ui-core.jsx');
const memories = read('../src/memories.jsx');
const imageControl = read('../src/image-upload-control.jsx');
const choice = read('../src/choice-control.jsx');
const adapter = read('../src/live-adapter.js');
const start = source.indexOf('async function approvePendingMembership(');
const end = source.indexOf('\ntry{', start);
assert.ok(start >= 0 && end > start, 'Extract the actual hosted membership helper.');
const helper = source.slice(start, end);
const email = 'pending@example.test';

function membershipHarness({count = 1, status = 'pending', reviewedEmail = email, saved = true, readback = 'active'} = {}) {
  const events = [], state = {count, status, dialog: false, reviewedEmail};
  const pending = {
    kind: 'pending',
    getByRole(role, options) {
      assert.equal(role, 'button'); assert.equal(options.name, 'Review membership'); assert.equal(options.exact, true);
      return {async click() {events.push('open-review'); state.dialog = true;}};
    },
  };
  const review = {
    kind: 'review',
    getByRole(role, options) {
      assert.equal(role, 'button'); assert.equal(options.name, 'Approve membership'); assert.equal(options.exact, true);
      return {async click() {events.push('approve'); if (saved) {state.status = readback; state.dialog = false;}}};
    },
  };
  const page = {getByRole(role, options) {
    if (role === 'article') return {filter(filter) {assert.equal(filter.hasText, email); return pending;}};
    assert.equal(role, 'dialog'); assert.equal(options.name, 'Review membership'); assert.equal(options.exact, true);
    return review;
  }};
  const expect = locator => ({
    async toHaveCount(wanted) {
      events.push(locator.kind + '-count-' + wanted);
      assert.equal(locator === pending ? state.count : Number(state.dialog), wanted);
    },
    async toBeVisible() {events.push('review-visible'); assert.equal(locator, review); assert.equal(state.dialog, true);},
    async toContainText(wanted) {
      const text = (locator === pending ? email : state.reviewedEmail) + ' · ' + (locator === pending ? state.status : 'pending');
      events.push(locator.kind + '-text-' + wanted);
      assert.ok(text.includes(wanted), 'The actual target and status must match: ' + text);
    },
  });
  const approve = vm.runInNewContext('(' + helper + ')', {expect});
  return {events, state, run: () => approve(page, email)};
}

test('Live approval follows the actual shared focused review and awaits active read-back', async () => {
  const h = membershipHarness(); await h.run();
  assert.deepEqual(h.events, [
    'pending-count-1', 'pending-text-' + email + ' · pending', 'open-review', 'review-visible',
    'review-text-' + email + ' · pending', 'approve', 'review-count-0', 'pending-text-' + email + ' · active',
  ]);
  const row = manage.slice(manage.indexOf("{active==='members'"), manage.indexOf("{active==='rsvp'"));
  assert.match(row, /openSheet\(\{type:'leader-member-review'/);
  assert.match(row, />Review membership<\/Button>/);
  assert.doesNotMatch(row, /Approve membership|APPROVE_MEMBER/);
  assert.match(manage, /onSave\(\{type:'APPROVE_MEMBER',id:m\.id,status,roles,canPost:post\}\)/);
  assert.match(app, /'leader-member-review':'Review membership'/);
  assert.match(app, /case'leader-member-review':return <MemberReview[^;]*onSaved=\{\(\)=>openSheet\(null\)\}/);
  assert.match(sheet, /<dialog[^>]*aria-labelledby=\{titleId\}/);
  assert.match(sheet, /<h2 id=\{titleId\}>\{title\}<\/h2>/);
  assert.match(source, /await approvePendingMembership\(owner, 'pending@example\.test'\)/);
});

test('Live approval rejects duplicate or non-pending rows before any mutation', async () => {
  for (const options of [{count: 0}, {count: 2}, {status: 'active'}]) {
    const h = membershipHarness(options); await assert.rejects(h.run());
    assert.equal(h.events.includes('open-review'), false); assert.equal(h.events.includes('approve'), false);
  }
});

test('Live approval rejects a mismatched focused target before submitting', async () => {
  const h = membershipHarness({reviewedEmail: 'someone-else@example.test'});
  await assert.rejects(h.run()); assert.equal(h.events.includes('approve'), false);
});

test('Live approval cannot pass an unsuccessful save or missing active read-back', async () => {
  for (const options of [{saved: false}, {readback: 'pending'}, {readback: 'suspended'}]) {
    const h = membershipHarness(options); await assert.rejects(h.run()); assert.equal(h.events.includes('approve'), true);
  }
  assert.doesNotMatch(helper, /getByRole\('checkbox'|\.check\(|\.uncheck\(|force|dispatch|evaluate|catch/);
});

test('Live RSVP first opens a visible real choice popup and retains persisted three-person assertions', () => {
  const sequence = source.slice(source.indexOf("currentCheck='member RSVP persistence"), source.indexOf("currentCheck='membership approval"));
  for (const step of [
    'await rsvpCount.scrollIntoViewIfNeeded()', 'await rsvpCount.click()',
    "await expect(rsvpCount).toHaveAttribute('aria-expanded','true')", "await rsvpCount.fill('3')",
    "getByRole('listbox',{name:'How many people?',exact:true})", 'await expect(rsvpChoices).toBeVisible()',
    "rsvpChoices.getByRole('option',{name:'3',exact:true})", 'await expect(threePeople).toBeVisible()', 'await threePeople.click()',
  ]) assert.ok(sequence.includes(step), step);
  assert.ok(sequence.indexOf('scrollIntoViewIfNeeded()') < sequence.indexOf("fill('3')"));
  assert.match(choice, /if\(!anchor\.isConnected\|\|rect\.bottom<top\|\|rect\.top>top\+height\)\{close\(\);return\}/);
  assert.match(choice, /role="listbox" aria-label=\{accessibleName\|\|label\}/);
  assert.match(sequence, /assert\.equal\(await rsvpCount\.inputValue\(\),'3'/);
  assert.match(sequence, /assert\.equal\(await rsvpCount\.getAttribute\('aria-expanded'\),'false'/);
  assert.match(sequence, /name:'Save RSVP',exact:true/);
  assert.match(sequence, /await reloadRoute\(alice\)/);
  assert.match(source, /getByText\('Planning to come · 3 people',\{exact:true\}\)/);
});

test('Live memory retry targets the current photo in its named editor and still requires decoded pixels', () => {
  const sequence = source.slice(source.indexOf("currentCheck='memory upload"), source.indexOf("currentCheck='featured photo approval'"));
  assert.match(app, /'memory-edit':'Memory details'/);
  assert.match(memories, /<ImageUploadControl label="Memory photo" src=\{m\.image\|\|''\} alt=\{m\.title\|\|'Current memory photo'\}/);
  assert.match(imageControl, /hasImage\?<img src=\{src\} alt=\{alt\} style=\{photoFrameStyle\(frame\)\} onError=\{previewError\}/);
  assert.match(sequence, /alice\.getByRole\('dialog',\{name:'Memory details',exact:true\}\)/);
  assert.match(sequence, /memoryDetails\.getByRole\('img',\{name:'Current memory photo',exact:true\}\)/);
  assert.match(sequence, /expect\.poll\(\(\)=>memoryPhoto\.evaluate\(img=>img\.complete&&img\.naturalWidth>0\)/);
  assert.match(sequence, /status:503,json:\{error:'Synthetic transient storage failure'\}/);
  assert.match(sequence, /assert\.equal\(failedMediaOnce,true,'private media transient failure was exercised'\)/);
  assert.match(sequence, /memoryDetails\.getByRole\('button',\{name:'Close dialog',exact:true\}\)\.click\(\)/);
  assert.match(sequence, /await expect\(memoryDetails\)\.toHaveCount\(0\)/);
  assert.match(sequence, /await reloadRoute\(alice\)/);
  assert.match(sequence, /assert\.equal\(await alice\.locator\('\.field-memory-open'\)\.count\(\),1\)/);
  assert.doesNotMatch(sequence, /memory-edit-media|force\s*:\s*true|waitForTimeout|route\.abort|\.catch\(/);
});

test('Live cross-account featured approval reads fresh data through the existing route readiness gate', () => {
  const sequence = source.slice(source.indexOf("currentCheck='featured photo approval'"), source.indexOf('for (const {page} of sessions)'));
  assert.match(adapter, /setInterval\(tick,15000\)/);
  assert.match(sequence, /^currentCheck='featured photo approval';await reloadRoute\(owner\);/);
  for (const name of ['Family', 'Memories', 'Featured photos', 'Approve photo', 'Use as main photo', 'Main photo']) {
    assert.ok(sequence.includes("name:'" + name + "',exact:true") || sequence.includes("getByText('" + name + "',{exact:true})"), name);
  }
  for (const name of ['Featured photos', 'Approve photo', 'Use as main photo', 'Main photo']) assert.ok(memories.includes(name), name);
  assert.match(sequence, /assert\.ok\(await owner\.locator\('\.featured-photo-row img'\)\.evaluate\(img=>img\.complete&&img\.naturalWidth>0\)/);
  const reload = source.slice(source.indexOf('async function reloadRoute('), source.indexOf('async function closePerson('));
  assert.ok(reload.indexOf('settleBrowserReads(page)') < reload.indexOf('page.reload('));
  assert.match(reload, /await authenticatedRouteReady\(page, \{since\}\)/);
});

test('Live retains role boundaries and strict unhandled-error checks through complete cleanup', () => {
  assert.match(source, /assert\.equal\(await alice\.getByRole\('heading',\{name:'Leader Tools',exact:true\}\)\.count\(\),0\)/);
  assert.match(source, /assert\.equal\(await alice\.getByRole\('tab',\{name:'Featured photos',exact:true\}\)\.count\(\),0\)/);
  assert.match(source, /if \(!scenarioFailed\) assertBrowserErrors\('No unhandled browser exceptions, including browser cleanup\.'\)/);
  assert.doesNotMatch(source, /force\s*:\s*true|waitForTimeout|networkidle|\.selectOption\(|ignoreHTTPSErrors|disable-web-security/);
});
