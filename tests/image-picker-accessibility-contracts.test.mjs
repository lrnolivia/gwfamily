import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('shared image chooser and native file picker have distinct truthful accessible names',async()=>{
 const ui=await source('src/image-upload-control.jsx');
 assert.match(ui,/aria-label=\{\(hasImage\?'Edit ':'Choose '\)\+label\.toLowerCase\(\)\}/);
 assert.match(ui,/type="file"[^>]*aria-label=\{label\+' file picker'\}/);
 assert.doesNotMatch(ui,/type="file"[^>]*aria-hidden=/);
 assert.match(ui,/onClick=\{\(\)=>picker\.current\?\.click\(\)\}/);
});
test('profile browser checks target the actual shared action while retaining keyboard and geometry checks',async()=>{
 const recovery=await source('tests/recovery-browser.mjs'),communications=await source('tests/communications-browser.mjs');
 assert.match(recovery,/locator\('button\.image-upload-choose'\)\.and\(page\.getByRole/);
 assert.match(communications,/locator\('button\.image-upload-choose'\)\.and\(photoControl\.getByRole/);
 assert.match(communications,/toHaveAttribute\('aria-label', 'Profile photo file picker'\)/);
 assert.match(recovery,/expect\(photoAction\)\.toBeFocused\(\)/);
 assert.match(communications,/expect\(choose\)\.toBeFocused\(\)/);
 assert.match(recovery,/photoAlignment\.width>=44&&photoAlignment\.height>=44/);
 assert.match(communications,/setInputFiles/);
});
test('page conflict assertion distinguishes persistent editor state from toast announcements',async()=>{
 const browser=await source('tests/page-content-browser.mjs');
 assert.match(browser,/owner\.locator\('\.(?:page-editor-error)\[role="alert"\]'\)\)\.toContainText\('Your draft is kept'\)/);
 assert.doesNotMatch(browser,/owner\.getByRole\('alert'\)\)\.toContainText\('Your draft is kept'\)/);
 assert.match(browser,/expect\(saveStatus\(owner\)\)\.toContainText\('Couldn’t save'\)/);
 assert.match(browser,/getByRole\('button', \{name: 'Review latest changes', exact: true\}\)\.click\(\)/);
});
