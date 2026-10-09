import assert from 'node:assert/strict';

// Read-only paint checks, called by the authorized hosted navigation runner.
// These establish layer/state contracts; captured pixels still need review.
export function assertPageHeaderGlass(paint, {material, inline, label}) {
  assert.equal(paint.inline, inline, `${label}: expected inline-title state`);
  if (material !== 'ios') return;
  assert.match(paint.headerBlur, /blur\(18px\)/, `${label}: main glass remains`);
  assert.equal(paint.edgeDisplay, inline ? 'none' : 'block', `${label}: edge never blurs an expanded inline title`);
  assert.match(paint.edgeBlur, /blur\(18px\)/, `${label}: scrolled edge retains its blur`);
  assert.match(paint.edgeMask, /linear-gradient/, `${label}: scrolled edge retains its fade`);
  if (inline) {
    assert.ok(paint.titleRowHeight <= 1, `${label}: inline title uses the zero-height navigation row`);
    assert.equal(paint.hasAnchoredHeading, true, `${label}: source-owned heading is still anchored`);
  }
}

export async function verifyPageHeaderGlass(page, options) {
  // Wait for the real hook/resize-observer work rather than editing classes or
  // styles to manufacture an expected result.
  await page.waitForFunction(inline => {
    const nav = document.querySelector('.page-navigation-header');
    return nav?.classList.contains('has-inline-title') === inline &&
      (!inline || Boolean(document.querySelector('#main [data-page-back-anchor=true]')));
  }, options.inline);
  const paint = await page.evaluate(() => {
    const header = document.querySelector('.app>.app-header'), nav = document.querySelector('.page-navigation-header');
    const glass = getComputedStyle(header, '::before'), edge = getComputedStyle(header, '::after');
    return {inline: nav.classList.contains('has-inline-title'), titleRowHeight: nav.getBoundingClientRect().height,
      hasAnchoredHeading: Boolean(document.querySelector('#main [data-page-back-anchor=true]')),
      headerBlur: glass.backdropFilter || glass.webkitBackdropFilter,
      edgeDisplay: edge.display, edgeBlur: edge.backdropFilter || edge.webkitBackdropFilter,
      edgeMask: edge.maskImage || edge.webkitMaskImage};
  });
  assertPageHeaderGlass(paint, options);
  return paint;
}
