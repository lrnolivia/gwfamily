import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// WebKit pins bottom:0 sticky rows above the scroller's bottom padding; the
// surface must be painted below the row so scrolled content never shows there.
test('sticky sheet footers paint the surface below themselves',()=>{
 const css=readFileSync(new URL('../src/sheet-standard.css',import.meta.url),'utf8');
 const rule=css.match(/\.sheet-footer::after\{([^}]*)\}/)?.[1]||'';
 for(const part of ['position:absolute','top:100%','left:0','right:0','background:var(--surface)','pointer-events:none','safe-area-inset-bottom'])assert.ok(rule.includes(part),part);
 assert.match(css,/\.sheet-footer\{position:sticky;bottom:0/);
});
