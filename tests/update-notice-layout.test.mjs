import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/react-app.jsx',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../src/messaging.css',import.meta.url),'utf8');
test('update notice portals below navigation and preserves safe reload conditions',()=>{
 const notice=fs.readFileSync(new URL('../src/update-toast.jsx',import.meta.url),'utf8'),styles=fs.readFileSync(new URL('../src/update-toast.css',import.meta.url),'utf8');
 assert.match(source,/<BuildUpdateNotice\/>/);assert.match(notice,/createPortal\(/);assert.match(notice,/document.body/);assert.match(notice,/controller.current.manual\(\)/);assert.match(notice,/Save or close your draft before reloading/);assert.match(styles,/\.gw-update-toast\{position:fixed/);assert.match(styles,/--gw-nav-height,72px/);assert.match(notice,/getClientRects\(\).length>0/);
});
test('all three header controls retain the approved twelve-pixel breathing room',()=>{assert.match(css,/header-actions\{margin-left:auto;flex:none;gap:12px!important\}/);assert.match(css,/header:has\(\.messages-entry\)\{flex-wrap:wrap/)});
