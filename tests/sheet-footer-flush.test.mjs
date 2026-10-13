import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Chromium and WebKit pin bottom:0 sticky rows above the scroller's bottom padding; the
// surface must be painted below the row so scrolled content never shows there.
test('sticky sheet footers paint the surface below themselves, even when they clip overflow',()=>{
 const css=readFileSync(new URL('../src/sheet-standard.css',import.meta.url),'utf8');
 const rule=css.match(/html \.sheet-footer\{([^}]*)\}/)?.[1]||'';
 for(const part of ['box-shadow:0 40px 0 0 var(--surface)','0 80px 0 0 var(--surface)'])assert.ok(rule.includes(part),part);
 assert.doesNotMatch(css,/\.sheet-footer::after/,'a pseudo-element cover is clipped by footers that hide overflow');
 assert.match(css,/\.sheet-footer\{position:sticky;bottom:0/);
});
