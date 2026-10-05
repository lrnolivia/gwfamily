import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
const engine=process.env.GW_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true});
const origin='http://127.0.0.1:4174';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHMkAAAAASUVORK5CYII=','base64');
try {
 const page=await browser.newPage();
 await page.goto(origin+'/__test/signin?user=alice');
 const upload=await page.request.post(origin+'/api/media',{headers:{Origin:origin},multipart:{file:{name:'decode-test.png',mimeType:'image/png',buffer:png}}});
 assert.equal(upload.status(),201,await upload.text());
 const file=await upload.json();
 const response=await page.request.get(origin+file.url);assert.equal(response.status(),200);assert.deepEqual(await response.body(),png);
 await page.setContent(`<img id="test-photo" src="${file.url}" alt="Synthetic decode test">`);
 assert.equal(await page.locator('#test-photo').evaluate(async img=>{await img.decode();return img.naturalWidth}),1,'embedded authenticated image decodes');
 console.log('Embedded private image decode passed',process.env.GW_BROWSER);
 await page.goto(origin+file.url);assert.ok(await page.locator('img').evaluate(async img=>{await img.decode();return img.naturalWidth>0}),'native image viewer decodes');
 console.log('Native private image viewer passed',process.env.GW_BROWSER);
} catch(error) {console.error('MEDIA DECODE FAILURE',error.stack);throw error}finally{await browser.close()}
