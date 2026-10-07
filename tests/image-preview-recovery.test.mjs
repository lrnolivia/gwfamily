import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privateMediaRetryUrl} from '../src/media-retry.js';
const control=readFileSync(new URL('../src/image-upload-control.jsx',import.meta.url),'utf8');
test('shared image preview retains a private image during one same-origin retry, then fails honestly',()=>{
 const retry=privateMediaRetryUrl('/api/media/synthetic-photo','https://fixture.invalid');assert.equal(retry,'https://fixture.invalid/api/media/synthetic-photo?_gw_retry=1');assert.equal(privateMediaRetryUrl(retry,'https://fixture.invalid'),null);
 for(const source of ['https://other.invalid/api/media/synthetic-photo','data:image/png;base64,synthetic','/api/private/synthetic-photo'])assert.equal(privateMediaRetryUrl(source,'https://fixture.invalid'),null);
 assert.match(control,/onError=\{previewError\}/);assert.match(control,/if\(!next\)\{setFailed\(true\);return\}/);assert.match(control,/setTimeout\(\(\)=>\{retryTimer.current=null;if\(image.isConnected&&image.getAttribute\('src'\)===original\)image.setAttribute\('src',next\)\},200\)/);
 assert.doesNotMatch(control,/onError=\{\(\)=>setFailed\(true\)\}/);assert.match(control,/Current photo unavailable/);
});
test('preview retries cancel on replacement/unmount and never mutate upload/account state',()=>{
 assert.match(control,/const clearPreviewRetry=\(\)=>\{clearTimeout\(retryTimer.current\);retryTimer.current=null\}/);assert.match(control,/useEffect\(\(\)=>\{clearPreviewRetry\(\);setFailed\(false\);return clearPreviewRetry\},\[src\]\)/);
 assert.doesNotMatch(control,/fetch\(|dispatch\(|requestPermission|pushManager|localStorage|sessionStorage/);assert.match(control,/if\(files.length\)onFiles\?\.\(files\)/);
});
test('Safari blocking reload and isolation retain original coverage with the real shared image preview',()=>{
 for(const file of ['webkit-memory-reload.mjs','webkit-diagnostics.mjs']){const source=readFileSync(new URL('./'+file,import.meta.url),'utf8');assert.match(source,/dialog\[open\] \.image-upload-preview img/);assert.doesNotMatch(source,/\.memory-edit-media/);assert.match(source,/page.reload\(/);assert.match(source,/inspectPng/);assert.match(source,/retried>0/)}
 const blocking=readFileSync(new URL('./webkit-memory-reload.mjs',import.meta.url),'utf8');for(const marker of ['desktop-webkit-mobile-width','desktop-safari-normal-image','touch-safari','sameTabReload','initial reload','repeated reload','chromatic lens','bounded gallery geometry'])assert.ok(blocking.includes(marker),marker);
});
