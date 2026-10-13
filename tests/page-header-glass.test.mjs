import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertPageHeaderGlass} from './page-header-glass-browser-check.mjs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const selector = 'html[data-platform=ios]:not([data-page-edit-mode=true]) .app:not([data-compact=true]):has(> #main > .page-navigation-header.has-inline-title)>.app-header::after';

test('expanded inline page titles are not painted beneath the glass scroll-edge overlay', () => {
  const css = source('src/page-navigation.css');
  assert.ok(css.includes(selector + '{display:none}'), 'Only the expanded zero-height title-row state suppresses the overlaid edge.');
  assert.ok(css.lastIndexOf(selector) > css.lastIndexOf('mask-image:linear-gradient'), 'The targeted rule wins over the shared edge display rule.');
});

test('header glass, back-button glass and compact scroll-edge blur remain intact', () => {
  const css = source('src/page-navigation.css');
  assert.match(css, /\.app>\.app-header::before\{inset:0 -16px calc\(-1 \* var\(--gw-page-title-height,0px\)\);[^}]*backdrop-filter:blur\(18px\)/);
  assert.match(css, /\.page-back\.page-back\{[^}]*backdrop-filter:blur\(14px\)/);
  assert.match(css, /\.app>\.app-header::after\{display:block;top:calc\(100% \+ var\(--gw-page-title-height,0px\)\)\}/);
  assert.match(css, /\.app>\.app-header::after\{backdrop-filter:blur\(18px\);[^}]*mask-image:linear-gradient/);
  const override = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)) + 1);
  assert.doesNotMatch(override, /backdrop-filter|box-shadow|text-shadow|z-index|h1/);
});

test('hosted navigation checks cover expanded, compact and returned inline-title glass states', () => {
  const harness = source('tests/navigation-insets-browser.mjs');
  assert.match(harness, /verifyPageHeaderGlass\(page,\{material,inline:true,label\}\)/);
  assert.match(harness, /verifyPageHeaderGlass\(page,\{material,inline:false,label\}\)/);
  assert.equal(harness.match(/verifyPageHeaderGlass\(page,\{material,inline:true,label\}\)/g)?.length, 2);
});

test('paint assertions reject the reported overlaid-title state and loss of glass', () => {
  const paint = {inline: true, titleRowHeight: 0, hasAnchoredHeading: true,
    headerBlur: 'blur(18px)', edgeDisplay: 'none', edgeBlur: 'blur(18px)', edgeMask: 'linear-gradient(rgb(0, 0, 0), transparent)'};
  const options = {material: 'ios', inline: true, label: 'fixture'};
  assert.doesNotThrow(() => assertPageHeaderGlass(paint, options));
  assert.throws(() => assertPageHeaderGlass({...paint, edgeDisplay: 'block'}, options), /edge never blurs/);
  assert.throws(() => assertPageHeaderGlass({...paint, headerBlur: 'none'}, options), /main glass remains/);
  assert.throws(() => assertPageHeaderGlass({...paint, hasAnchoredHeading: false}, options), /heading is still anchored/);
  const compact = {...paint, inline: false, edgeDisplay: 'block', titleRowHeight: 52, hasAnchoredHeading: false};
  assert.doesNotThrow(() => assertPageHeaderGlass(compact, {...options, inline: false}));
  assert.throws(() => assertPageHeaderGlass({...compact, edgeDisplay: 'none'}, {...options, inline: false}), /edge never blurs/);
  assert.throws(() => assertPageHeaderGlass({...compact, edgeBlur: 'none'}, {...options, inline: false}), /edge retains its blur/);
  assert.doesNotThrow(() => assertPageHeaderGlass({...paint, headerBlur: 'none'}, {...options, material: 'android'}));
});
