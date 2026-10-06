import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sheet=fs.readFileSync(new URL('../src/ui-core.jsx',import.meta.url),'utf8'),cms=fs.readFileSync(new URL('../src/page-content.jsx',import.meta.url),'utf8');
test('sheets retain generic pending feedback unless an explicitly scoped child owns it',()=>{
 assert.match(sheet,/suppressGlobalPending=false,busy=false/);
 assert.match(sheet,/app\?\.data\?\.pending&&!suppressGlobalPending&&<p role="status"/);
 assert.match(cms,/<section className="page-inline-editor" aria-label="Page media" aria-busy=\{uploading\}/);
 assert.match(cms,/role="status" aria-label="Page media upload"/);
});
test('busy panels disable close and preserve keyboard/backdrop dismissal locks',()=>{
 assert.match(sheet,/close=\(\)=>\{if\(!busy\)onClose\?\.\(\)\}/);
 assert.match(sheet,/aria-label="Close dialog" disabled=\{busy\} onClick=\{close\}/);
 assert.match(sheet,/onCancel=\{e=>\{e.preventDefault\(\);close\(\)\}\}/);
 assert.match(sheet,/if\(e.target===ref.current\)close\(\)/);
});

test('filter sheet geometry cannot mix right-docked placement with a centered transform',()=>{
 const css=fs.readFileSync(new URL('../src/sheet-geometry.css',import.meta.url),'utf8');
 assert.match(css,/html\[data-platform\] #sheet\.filter-surface\[open\]\{/);
 assert.match(css,/left:calc\(var\(--vv-left\) \+ var\(--vv-width\)\/2\)/);
 assert.match(css,/right:auto;bottom:auto;transform:translateX\(-50%\)/);
 assert.match(css,/height:auto;min-height:0;max-height:calc\(var\(--vv-height\) - 24px\)/);
 assert.match(css,/display:flex;flex-direction:column;overflow:hidden/);
 assert.match(css,/overflow-x:hidden;overflow-y:auto/);
});
