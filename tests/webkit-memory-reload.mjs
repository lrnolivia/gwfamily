// Visible, non-blocking reproduction of the one release exception accepted by
// the owner on 2026-10-06. Keep this failing until the hotfix actually passes.
import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await webkit.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:4174/__test/signin?user=alice');
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Family',exact:true}).click();
 await page.getByRole('tab',{name:'Memories',exact:true}).click();
 await page.waitForFunction(()=>{const img=document.querySelector('.field-memory-open img');return img?.complete&&img.naturalWidth>0});
 await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 await page.getByRole('navigation',{name:'Main navigation'}).waitFor();
 assert.ok(await page.locator('.field-memory-open').count()>0,'uploaded memory remains after reload');
 console.log('GW-WEBKIT-MEMORY-RELOAD reproduction passed; verify the complete upload sequence before closing.');
} catch(error){console.error('::warning title=Known release exception GW-WEBKIT-MEMORY-RELOAD::'+String(error.message).replaceAll('\n','%0A'));process.exitCode=1}finally{await browser.close()}
