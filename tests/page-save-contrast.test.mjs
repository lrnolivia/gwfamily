import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePaintColor, pageSaveContrast} from './page-save-contrast.mjs';
const css = readFileSync(new URL('../src/page-content.css', import.meta.url), 'utf8');
const sharedCss = readFileSync(new URL('../dist/react-ui.css', import.meta.url), 'utf8');
const tokens = selector => Object.fromEntries([...css.match(new RegExp(selector + '\\{([^}]+)\\}'))[1].matchAll(/(--[\w-]+):([^;]+);/g)].map(([, key, value]) => [key, value]));
const defaults = tokens(':root'), light = {...defaults, ...tokens('html\\[data-theme=light\\]')};
const paint = theme => ({foreground: theme['--page-edit-muted'], hostBackground: theme['--page-edit-raised'], backdrop: theme['--page-edit-raised'], tintBackground: theme['--page-edit-raised'], hostOpacity: 1, tintOpacity: 1, labelOpacity: 1, ancestors: [1, 1]});

test('disabled page Save uses its state fill on the actual tint and keeps text opaque', () => {
  assert.match(css, /html\[data-theme\]\[data-platform\] \.page-save-button\.button:disabled\{opacity:1\}/);
  assert.match(css, /html\[data-theme\]\[data-platform\] \.page-save-button\.button:disabled>\.liquid-glass-tint\{background:var\(--gw-control-color\)!important\}/);
  assert.match(sharedCss, /\.button:disabled\{[^}]*--gw-control-color:var\(--raised\)/);
  assert.match(css, /\.page-save-button\.button:not\(:disabled\)\{[^}]*--gw-control-color:var\(--page-save-bg\)!important/);
  for (const theme of [defaults, light]) {
    assert.ok(pageSaveContrast(paint(theme)) >= 4.5, 'Both disabled edit palettes remain readable.');
    assert.ok(pageSaveContrast({...paint(theme), tintBackground: null}) >= 4.5, 'Android has no tint layer.');
  }
});

test('paint contrast detects the bad tint even when the button host looks readable', () => {
  for (const theme of [defaults, light]) {
    const broken = {...paint(theme), tintBackground: theme['--page-edit-control'], hostOpacity: .45};
    assert.ok(pageSaveContrast(broken) < 1.1, 'Opaque active tint hides the disabled label.');
    assert.ok(pageSaveContrast({...broken, tintBackground: null, hostOpacity: 1}) >= 4.5, 'A host-only assertion would miss this bug.');
    assert.ok(pageSaveContrast({...paint(theme), hostOpacity: .45}) < 3, 'Fixing tint alone still fades the label.');
    assert.ok(pageSaveContrast({...paint(theme), labelOpacity: .1}) < 2, 'Descendant label opacity is included.');
  }
});

test('paint color parsing covers browser RGB and sRGB with explicit alpha', () => {
  assert.deepEqual(parsePaintColor('rgb(255, 0, 128)'), [1, 0, 128 / 255, 1]);
  assert.deepEqual(parsePaintColor('rgb(100% 0% 50% / 25%)'), [1, 0, .5, .25]);
  assert.deepEqual(parsePaintColor('color(srgb 1 0 .5 / .25)'), [1, 0, .5, .25]);
  assert.throws(() => parsePaintColor('color(display-p3 1 0 0)'), /Unsupported/);
  assert.throws(() => pageSaveContrast({...paint(light), ancestors: [.5]}), /translucent/);
  assert.throws(() => pageSaveContrast({...paint(light), backdrop: 'transparent'}), /opaque/);
});
