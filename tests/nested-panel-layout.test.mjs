import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('an empty outer sidebar cannot hide nested page sidebars',()=>{
 const css=readFileSync(new URL('../src/page-panels.css',import.meta.url),'utf8');
 assert.match(css,/\.page-panel-layout:not\(\.has-side\)>\.page-panel-columns>\.page-panel-zone-side\{display:none\}/);
 assert.doesNotMatch(css,/\.page-panel-layout:not\(\.has-side\)\s+\.page-panel-zone-side/);
});
