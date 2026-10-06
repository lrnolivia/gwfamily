import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/react-app.jsx',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../src/messaging.css',import.meta.url),'utf8');
test('update notice lives in document flow below header and offers a recoverable Later choice',()=>{assert.match(source,/<BuildUpdateNotice\/><main id="main" tabIndex=\{-1\}>/);assert.doesNotMatch(source,/<\/div><BuildUpdateNotice\/>\{sheetNode\}/);assert.match(css,/\.app>\.build-update-notice\{position:static;inset:auto;transform:none/);assert.match(source,/setDeferred\(ready\)\}>Later/);assert.match(source,/setDeferred\(null\)\}>Update ready/)});
test('all three header controls retain the approved twelve-pixel breathing room',()=>{assert.match(css,/header-actions\{margin-left:auto;flex:none;gap:12px!important\}/);assert.match(css,/header:has\(\.messages-entry\)\{flex-wrap:wrap/)});
