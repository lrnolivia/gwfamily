import {createTestPng} from './png-fixtures.mjs';
import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
const engine=process.env.GW_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true});
const origin='http://127.0.0.1:4174';
const png=createTestPng();
let page;
try {
 page=await browser.newPage();
 await page.goto(origin+'/__test/signin?user=alice');
 const upload=await page.request.post(origin+'/api/media',{headers:{Origin:origin},multipart:{file:{name:'decode-test.png',mimeType:'image/png',buffer:png}}});
 assert.equal(upload.status(),201,await upload.text());
 const file=await upload.json();
 const response=await page.request.get(origin+file.url);assert.equal(response.status(),200);assert.deepEqual(await response.body(),png);
 await page.setContent(`<img id="test-photo" src="${file.url}" alt="Synthetic decode test">`);
 await page.waitForFunction(()=>{const img=document.querySelector('#test-photo');return img?.complete&&img.naturalWidth===1&&img.naturalHeight===1},null,{timeout:15000});assert.equal(await page.locator('#test-photo').evaluate(img=>img.naturalWidth),1,'embedded authenticated image renders decoded pixels');
 console.log('Embedded private image decode passed',process.env.GW_BROWSER);
 await page.goto(origin+file.url);await page.waitForFunction(()=>{const img=document.querySelector('img');return img?.complete&&img.naturalWidth>0},null,{timeout:15000});assert.ok(await page.locator('img').evaluate(img=>img.naturalWidth>0),'native image viewer renders decoded pixels');
 console.log('Native private image viewer passed',process.env.GW_BROWSER);
} catch(error) {console.error('MEDIA DECODE FAILURE',error.stack);console.log('::error title=GW media browser::'+String(error.message).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));if(page)console.error('MEDIA VIEWER STATE',JSON.stringify(await page.evaluate(()=>({type:document.contentType,images:[...document.images].map(i=>({src:i.getAttribute('src'),complete:i.complete,width:i.naturalWidth,height:i.naturalHeight}))}))));throw error}finally{await browser.close()}
