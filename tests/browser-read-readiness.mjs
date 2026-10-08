import {expect} from '@playwright/test';

// Wait for the real authenticated bootstrap, not the gap before React starts
// its effects. Keep every browser error fatal; never filter navigation errors.
export function authenticatedReadNavigation(page, base) {
  const pending = new Set(), completed = new Set();
  let documentStarted = false, lastActivity = 0;
  const path = request => new URL(request.url()).pathname;
  const tracked = request => request.method() === 'GET' && request.url().startsWith(base + '/') &&
    (path(request).startsWith('/api/') || path(request) === '/build.json');
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentStarted = true; completed.clear();
    }
    if (tracked(request)) { pending.add(request); lastActivity = Date.now(); }
  });
  page.on('requestfinished', async request => {
    if (!tracked(request)) return;
    const response = await request.response();
    if (response?.ok()) completed.add(path(request));
    pending.delete(request); lastActivity = Date.now();
  });
  page.on('requestfailed', request => { pending.delete(request); lastActivity = Date.now(); });
  const settle = async () => {
    if (!documentStarted) return;
    await expect(page.getByRole('navigation', {name: 'Main navigation', exact: true})).toBeVisible();
    const route = new URL(page.url()).hash.replace(/^#\//, '').split(/[/?]/)[0] || 'home';
    const required = ['/build.json', '/api/config', '/api/session', '/api/state', '/api/conversations',
      '/api/conversations/recipients', '/api/notifications', '/api/page-content/global'];
    if (['home', 'family', 'you', 'reunion'].includes(route)) required.push('/api/page-content/' + route);
    await expect.poll(() => ({missing: required.filter(value => !completed.has(value)),
      pending: pending.size, settled: Date.now() - lastActivity >= 100}),
    {timeout: 20000, message: 'Successful current-document bootstrap and pending reads settle before navigation.'})
      .toEqual({missing: [], pending: 0, settled: true});
  };
  return {
    settle,
    navigate: async url => { await settle(); await page.goto(url); await settle(); },
    reload: async () => { await settle(); await page.reload(); await settle(); },
  };
}
