import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sheet=fs.readFileSync(new URL('../src/ui-core.jsx',import.meta.url),'utf8'),cms=fs.readFileSync(new URL('../src/page-content.jsx',import.meta.url),'utf8');
test('sheets retain generic pending feedback unless an explicitly scoped child owns it',()=>{
 assert.match(sheet,/suppressGlobalPending=false,busy=false/);
 assert.match(sheet,/locked&&!suppressGlobalPending&&<p role="status"/);
 assert.match(cms,/<section className="page-inline-editor" aria-label="Page media" aria-busy=\{uploading\}/);
 assert.match(cms,/role="status" aria-label="Page media upload"/);
});
test('busy panels disable close and preserve keyboard/backdrop dismissal locks',()=>{
 assert.match(sheet,/close=\(\)=>\{if\(locked\)return;if\(form\?\.dirty\)/);
 assert.match(sheet,/aria-label="Close dialog" disabled=\{locked\} onClick=\{close\}/);
 assert.match(sheet,/onCancel=\{e=>\{e.preventDefault\(\);close\(\)\}\}/);
 assert.match(sheet,/if\(e.target===ref.current\)close\(\)/);
});

test('all unanchored sheets center on both visible viewport axes with safe internal scrolling',()=>{
 const css=fs.readFileSync(new URL('../src/sheet-geometry.css',import.meta.url),'utf8');
 assert.match(css,/html\[data-platform\] #sheet\[open\]\{/);
 assert.match(css,/top:calc\(var\(--vv-top,0px\) \+ var\(--vv-height,100dvh\)\/2\)/);
 assert.match(css,/left:calc\(var\(--vv-left,0px\) \+ var\(--vv-width,100vw\)\/2\)/);
 assert.match(css,/right:auto;bottom:auto;transform:translate\(-50%,-50%\)/);
 assert.match(css,/height:auto;min-height:0;max-height:var\(--sheet-max-height\)/);
 assert.match(css,/display:flex;flex-direction:column;overflow:hidden/);
 assert.match(css,/overflow-x:hidden;overflow-y:auto/);
 assert.match(css,/safe-area-inset-top/);assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/@keyframes gw-centered-sheet-enter\{from\{opacity:0\}to\{opacity:1\}\}/);
 assert.doesNotMatch(css,/\.(?:gw-glass-menu|gw-material-menu|choice-popover)[^{]*\{/);
});
