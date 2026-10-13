import './test-environment-guard.mjs';
// Ordinary built app in preview mode with synthetic files and fictional people;
// non-GET requests are blocked and recorded, so nothing is uploaded anywhere.
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {createTestPng} from './png-fixtures.mjs';
const root=resolve('dist'),output=resolve(process.env.GW_MEMORY_BATCH_QA_OUTPUT||'docs/memory-batch-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',errors=[],writes=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,PREVIEW_KEY);
try{
 await mkdir(output,{recursive:true});browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_MEMORY_BATCH_CHROMIUM_PATH?{executablePath:process.env.GW_MEMORY_BATCH_CHROMIUM_PATH}:{})});
 for(const width of [390,1024]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(url.pathname);return route.abort()}if(url.pathname==='/api/config')return route.fulfill({json:{configured:false,email:false,providers:[],pushEnrollmentPrompt:false}});if(url.pathname==='/api/session')return route.fulfill({json:{signedIn:false,configured:false}});if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);return route.continue()});
  const state={...initialState(),onboarding:'done'};state.members=state.members.map((m,i)=>({...m,name:'Fixture Person '+i,photo:null}));state.memories=[];
  await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-platform','ios');localStorage.setItem('gw-theme','light')}},{key:PREVIEW_KEY,state});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/family?tab=memories');
  // Two small synthetic photos and one over the preview size limit.
  await page.locator('input[aria-label="Add memory files"]').setInputFiles([
   {name:'fixture-one.png',mimeType:'image/png',buffer:createTestPng(120,80)},
   {name:'fixture-too-large.png',mimeType:'image/png',buffer:Buffer.concat([createTestPng(40,40),Buffer.alloc(2*1024*1024+10)])},
   {name:'fixture-two.png',mimeType:'image/png',buffer:createTestPng(80,120)}
  ]);
  const panel=page.getByRole('region',{name:'Memory uploads'});
  await expect(panel.getByRole('status')).toHaveText('2 of 3 memories added. 1 needs a retry below.');
  await expect(panel.locator('.memory-batch-row.is-saved')).toHaveCount(2);await expect(panel.locator('.memory-batch-row.is-upload-failed')).toHaveCount(1);
  let saved=await stored(page);assert.equal(saved.memories.length,2);
  // Retrying the oversized file stays honest and never duplicates the others.
  await panel.getByRole('button',{name:'Retry fixture-too-large.png',exact:true}).click();
  // The summary reads the same before and after the retry, so wait for the retry itself to finish.
  await expect(panel).toHaveAttribute('aria-busy','false');await expect(panel.locator('.memory-batch-row.is-upload-failed')).toHaveCount(1);
  await expect(panel.getByRole('status')).toHaveText('2 of 3 memories added. 1 needs a retry below.');
  saved=await stored(page);assert.equal(saved.memories.length,2,'no duplicates after retry');
  await page.screenshot({path:`${output}/${engine}-${width}-batch.png`,fullPage:true});
  // Per-item details wizard on the current editor.
  await panel.getByRole('button',{name:'Add details',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Memory details',exact:true});await expect(sheet).toBeVisible();await expect(sheet.getByText('Memory 1 of 2',{exact:true})).toBeVisible();
  await sheet.locator('.form-image-fields input').first().fill('First fixture caption');
  await page.screenshot({path:`${output}/${engine}-${width}-wizard.png`});
  await sheet.getByRole('button',{name:'Save and next',exact:true}).click();
  await expect(sheet.getByText('Memory 2 of 2',{exact:true})).toBeVisible();
  await sheet.locator('.memory-wizard-footer').getByRole('button',{name:'Finish',exact:true}).click();await expect(sheet).toHaveCount(0);
  saved=await stored(page);assert.deepEqual(saved.memories.map(m=>m.title).sort(),['','First fixture caption']);
  await panel.getByRole('button',{name:'Done',exact:true}).click();await expect(panel).toHaveCount(0);
  // A single file keeps the familiar flow: its details open right away.
  await page.locator('input[aria-label="Add memory files"]').setInputFiles({name:'fixture-solo.png',mimeType:'image/png',buffer:createTestPng(64,64)});
  await expect(page.getByRole('dialog',{name:'Memory details',exact:true})).toBeVisible();await expect(page.getByText('Memory 1 of',{exact:false})).toHaveCount(0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.close();
 }
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('memory batch browser checks passed ('+engine+')');
}finally{await browser?.close();server.close()}
