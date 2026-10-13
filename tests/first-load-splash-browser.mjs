import './test-environment-guard.mjs';
import {chromium,webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await (process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.PW_CHROME||undefined,headless:true});
await mkdir('docs/splash-qa',{recursive:true});
const results=[];
for(const [width,height,theme,motion] of [[390,844,'light','no-preference'],[390,844,'dark','reduce'],[1024,768,'light','no-preference'],[320,568,'dark','reduce']]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(theme=>{localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-font','sans')},theme);
 let release;const gate=new Promise(r=>release=r);
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Isolated splash fixture'}}));
 await page.route('**/api/config',async r=>{await gate;await r.fulfill({json:{configured:true,email:true,providers:[]}})});
 await page.route('**/api/session',r=>r.fulfill({json:{signedIn:false,configured:true}}));
 await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
 await page.locator('.first-load-caption').waitFor();await page.waitForTimeout(800);
 assert.equal(await page.locator('.first-load-leaf').count(),6);
 assert.equal(await page.locator('.first-load-trees').evaluate(e=>e.complete&&e.naturalWidth>0),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const paused=await page.locator('.first-load-wind').evaluate(svg=>svg.animationsPaused());assert.equal(paused,motion==='reduce');
 assert.equal(await page.locator('.first-load-trail').count(),6);
 const paths=await page.locator('.first-load-flight').evaluateAll(gs=>gs.map(g=>g.querySelector('.first-load-trail').getAttribute('d')===g.querySelector('animateMotion').getAttribute('path')));assert.ok(paths.every(Boolean));
 const box=await page.locator('.first-load').boundingBox();assert.ok(Math.abs(box.y+box.height/2-height/2)<2,'splash group centered in viewport');assert.equal(await page.locator('.app>footer').count(),0);assert.equal(await page.getByRole('button',{name:'Fresh Start',exact:true}).count(),0);
 await page.screenshot({path:`docs/splash-qa/splash-${width}-${theme}.png`,fullPage:true});
 release();await page.locator('.first-load').waitFor({state:'detached'});assert.deepEqual(errors,[]);
 results.push({width,height,theme,motion,ok:true});await page.close();
}
console.log(JSON.stringify(results));await browser.close();
