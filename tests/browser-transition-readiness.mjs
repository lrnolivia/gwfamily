import {expect} from '@playwright/test';

// WebKit can finish scrollIntoView before React's deferred compact-header
// update changes the page geometry. Settle that transition before the normal
// pointer click; never force, retry, or substitute an activation.
export async function settlePointerTarget(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect.poll(() => locator.evaluate(async element => {
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const sample = () => {
      const rect = element.getBoundingClientRect(), app = element.closest('.app');
      const header = app?.querySelector('.page-navigation-header');
      const compact = scrollY > 96;
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        connected: element.isConnected,
        compactReady: Boolean(app) && (app.dataset.compact === 'true') === compact &&
          (!header || (header.dataset.compact === 'true') === compact),
        hit: Boolean(hit && (hit === element || element.contains(hit))),
        rect: [rect.x, rect.y, rect.width, rect.height, scrollX, scrollY],
      };
    };
    await frame();
    const before = sample();
    await frame();
    const after = sample();
    return {
      connected: before.connected && after.connected,
      compactReady: before.compactReady && after.compactReady,
      hit: before.hit && after.hit,
      stable: before.rect.every((value, index) => Math.abs(value - after.rect[index]) <= .5),
    };
  }), {message: 'Pointer target settles after the compact-header scroll transition.'})
    .toEqual({connected: true, compactReady: true, hit: true, stable: true});
}
