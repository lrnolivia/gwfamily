import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
test('custom choice tests operate through real combobox selection rather than native select APIs',()=>{
 for(const name of ['choice-control-browser.mjs','communications-browser.mjs','recovery-browser.mjs','live-browser.mjs'])assert.doesNotMatch(read(name),/\.selectOption\(/,name);
 const cms=read('page-content-browser.mjs');
 assert.equal((cms.match(/\.selectOption\(/g)||[]).length,1,'Only the actual native History for selector uses selectOption');
 assert.match(cms,/history\.selectOption\(key\)/);assert.match(cms,/getByRole\('combobox', \{name: 'History for', exact: true\}\)/);assert.match(cms,/expect\(history\)\.toHaveValue\(key\)/);
 const page=fs.readFileSync(new URL('../src/page-content.jsx',import.meta.url),'utf8');assert.match(page,/<select[^>]*aria-label="History for"/);
});
test('empty-choice status and conversation identity locators disambiguate their targets',()=>{
 assert.match(read('choice-control-browser.mjs'),/getByRole\('listbox',\{name:'New owner',exact:true\}\)\.locator\('\.\.'\)\.getByRole\('status'\)/);
 const comms=read('communications-browser.mjs');assert.doesNotMatch(comms,/conversation-member'\)\.filter\(\{hasText:/);assert.match(comms,/has: alice\.getByText\('Owner', \{exact: true\}\)/);
});

test('active choice labels use whitespace-normalized semantic matching and still verify disabled-option skipping',()=>{const source=read('choice-control-browser.mjs');assert.match(source,/expect\(activeOption\)\.toHaveText\('Alex Green'\)/);assert.match(source,/expect\(activeOption\)\.toBeEnabled\(\)/);assert.doesNotMatch(source,/assert.equal\(await page.locator\([^;]*innerText\(\),'Alex Green'\)/)});
