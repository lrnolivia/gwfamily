import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/member-picker.jsx',import.meta.url),'utf8');
test('multi-member selection closes results while keeping the selected IDs',()=>{
 assert.match(source,/selected\.includes\(person.id\)\?selected.filter/);
 assert.match(source,/setQuery\(''\);setActive\(0\);setOpen\(false\)/);
 assert.doesNotMatch(source,/if\(!multiple\)setOpen\(false\)/);
 assert.match(source,/onClick=\{\(\)=>setOpen\(true\)\}/);
});
test('pointer blur cannot move the form submit button before its click is dispatched',()=>{
 assert.match(source,/if\(!pointerDown.current&&!e.currentTarget.contains\(e.relatedTarget\)\)setOpen\(false\)/);
 assert.match(source,/document.addEventListener\('click',click\)/);
 assert.match(source,/if\(e.key==='Tab'\)\{setOpen\(false\)\}/);
 assert.match(source,/removeEventListener\('pointerdown',down,true\)/);
});
