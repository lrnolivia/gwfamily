// Node-only contracts for hosted browser diagnostics. No browser is launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {routeFromHash} from '../src/navigation.js';
const source = readFileSync(new URL('./page-content-browser.mjs', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function observeBrowser('), source.indexOf('async function person('));
const navigation = source.slice(source.indexOf('async function navigate('), source.indexOf('async function edit('));
const base = 'http://127.0.0.1:4176';
class Page extends EventEmitter {url() {return base + '/#/family';} mainFrame() {return null;}}
function observed() {
  const context = vm.createContext({Date, URL, Object, Map, WeakMap, JSON, assert, base, currentCheck: 'synthetic contract', traceStarted: Date.now(), browserReads: new WeakMap(), errors: [], console: {error() {}},
    // Immediate probes make these pure event contracts, not timing simulations.
    expect: {poll: probe => ({async toEqual(wanted) {assert.equal(JSON.stringify(probe()), JSON.stringify(wanted));}})},
  });
  vm.runInContext(helpers, context);
  const page = new Page(), trace = context.observeBrowser(page, 'alice');
  return {page, trace, errors: context.errors, settle: options => context.settleBrowserReads(page, options)};
}
function request(path, failure) {
  return {url: () => base + path, method: () => 'GET', resourceType: () => 'fetch', isNavigationRequest: () => false, failure: () => failure ? {errorText: failure} : null};
}
function finish(page, req, status = 200) {
  page.emit('response', {request: () => req, status: () => status, url: req.url, headers: () => ({'content-type': 'application/json', 'set-cookie': 'never-log-this', 'access-control-allow-origin': base})});
  page.emit('requestfinished', req);
}
test('shared-page navigation waits for authenticated content and successful initial reads on both sides of hard navigation', () => {
  assert.match(navigation, /\.app:not\(\.is-onboarding\) > header/);
  assert.match(navigation, /locator\('\.onboard'\)\)\.toHaveCount\(0\)/);
  assert.match(navigation, /getByRole\('navigation', \{name: 'Main navigation', exact: true\}\)\)\.toBeVisible\(\)/);
  assert.match(navigation, /expect\(page\)\.toHaveURL\(target\)/);
  assert.ok(navigation.indexOf('await settleBrowserReads(page);') < navigation.indexOf('await page.goto('));
  assert.ok(navigation.indexOf('await settleBrowserReads(page, {since, required});') > navigation.indexOf('await page.goto('));
  for (const path of ['/api/state', '/api/conversations', '/api/conversations/recipients', '/api/page-content/global', '/api/directory', '/api/page-content/people']) assert.ok(navigation.includes(path));
  assert.match(navigation, /required\.push\('\/api\/page-content\/' \+ route\)/);
  assert.doesNotMatch(navigation, /waitForTimeout|networkidle|route\.abort/);
});
test('Memories checks reach the real Family tab rather than the unknown-route Home fallback', () => {
  const routeSource = source.slice(source.indexOf('function sharedPageRoute('), source.indexOf('async function navigate('));
  const sharedPageRoute = vm.runInNewContext(routeSource + '; sharedPageRoute;');
  assert.deepEqual(routeFromHash('#/' + sharedPageRoute('memories')), {type: 'family', tab: 'memories'});
  assert.deepEqual(routeFromHash('#/' + sharedPageRoute('profile', 'member/1')), {type: 'profile', id: 'member/1'});
  assert.match(navigation, /required\.push\('\/api\/page-content\/family'\)/);
  assert.match(navigation, /name: 'Memories', exact: true.*toHaveAttribute\('aria-selected', 'true'\)/);
});
test('read readiness requires observed requested endpoints and completed network bodies', async () => {
  const {page, trace, settle} = observed(), req = request('/api/page-content/family');
  await assert.rejects(settle({required: ['/api/page-content/family']}));
  page.emit('request', req);
  await assert.rejects(settle({required: ['/api/page-content/family']}));
  finish(page, req);
  await settle({required: ['/api/page-content/family']});
  assert.equal(trace.pending.size, 0);
  assert.equal(trace.lastDrained, trace.sequence);
});
test('normal browser 401, 403, 503 and cancelled reads all fail readiness', async () => {
  for (const status of [401, 403, 503]) {
    const {page, settle} = observed(), req = request('/api/directory');
    page.emit('request', req); finish(page, req, status);
    await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
  }
  const {page, settle} = observed(), req = request('/api/conversations', 'cancelled');
  page.emit('request', req); page.emit('requestfailed', req);
  await assert.rejects(settle(), /Normal same-origin browser reads succeed/);
});
test('access-control pageerrors retain error, URL, request status/failure, and strict final assertion', () => {
  const {page, errors} = observed(), req = request('/api/conversations', 'cancelled');
  page.emit('request', req); page.emit('requestfailed', req);
  const message = 'Fetch API cannot load ' + req.url() + ' due to access control checks.';
  page.emit('pageerror', new Error(message));
  assert.equal(errors.length, 1); assert.equal(errors[0].error, message);
  assert.equal(errors[0].document, page.url());
  assert.equal(errors[0].recentEvents.at(-1).failure, 'cancelled');
  assert.match(source, /assert\.deepEqual\(errors, \[\], 'No unhandled browser exceptions\.'\)/);
  assert.match(source, /if \(id !== 'anonymous' && id !== 'pending'\) await settleBrowserReads\(page\)/);
  assert.doesNotMatch(source, /errors\.filter\(|preventDefault\(\).*emit\(|ignoreHTTPSErrors|disable-web-security/);
});
test('diagnostic history stays bounded and never captures cookies or response bodies', () => {
  const {page, trace} = observed(), req = request('/api/page-content/family');
  page.emit('request', req); finish(page, req);
  assert.ok(!JSON.stringify(trace.events).includes('never-log-this'));
  assert.equal(trace.events.find(event => event.type === 'response').headers['access-control-allow-origin'], base);
  for (let i = 0; i < 700; i++) trace.log('synthetic-event');
  assert.equal(trace.events.length, 600); assert.ok(trace.droppedEvents > 0);
  assert.match(source, /network-\$\{engineName\}\.json/);
  assert.match(source, /addEventListener\('unhandledrejection'/);
  assert.match(source, /\['beforeunload', 'pagehide', 'pageshow'\]/);
});
