// Focused real built preview for the renamed Reunion Schedule tab. Local
// fictional state; canonical hosted persistence/permissions suite stays intact.
import './test-environment-guard.mjs';
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
const root=resolve('dist'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',errors=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
try{
 browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_CONSOLIDATED_CHROMIUM_PATH?{executablePath:process.env.GW_CONSOLIDATED_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());assert(['GET','HEAD'].includes(req.method()));if(url.origin!==base)return route.abort();if(url.pathname==='/api/config')return route.fulfill({json:{configured:false,email:false,providers:[]}});if(url.pathname==='/api/session')return route.fulfill({json:{signedIn:false,configured:false}});return route.continue()});
 await context.addInitScript(({state,key})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-platform','ios')}},{key:PREVIEW_KEY,state:{...initialState(),onboarding:'done',previewRoleView:'leader'}});
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 for(const [tab,key,panelId] of [['Plan','reunion-plans','native-rsvp'],['Schedule','reunion-calendar','native-events']]){
  await page.goto(base+'/#/reunion');await page.getByRole('tab',{name:tab,exact:true}).click();
  const toolbar=page.locator('.page-edit-toolbar');await toolbar.getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();
  const panel=page.locator(`[data-panel-page="${key}"] [data-panel-id="${panelId}"]`);await expect(panel).toBeVisible();
  if(tab==='Schedule'){
   await expect(page.locator('[data-page-field="reunion-calendar.heading"]')).toHaveCount(0);
   await page.getByRole('button',{name:'Add Panel',exact:true}).click();const add=page.getByRole('dialog',{name:'Add Panel',exact:true});await add.getByRole('radio',{name:'Side area',exact:true}).check();await add.getByRole('button',{name:'Add side panel',exact:true}).click();
   const custom=page.locator(`[data-panel-page="${key}"] .page-custom-panel`).last();await custom.getByRole('button',{name:'Edit Panel heading',exact:true}).click();await custom.getByRole('textbox',{name:'Panel heading',exact:true}).fill('Fictional Schedule sidebar');await custom.getByRole('button',{name:'Finish editing Panel heading',exact:true}).click();
   await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1'))?.[key]?.record?.content.panelLayout.panels.some(row=>row.title==='Fictional Schedule sidebar'&&row.zone==='side'),key)).toBe(true);
  }
  await toolbar.locator('.page-edit-tools > summary').click();await toolbar.getByRole('button',{name:'Arrange page',exact:true}).click();
  await panel.getByRole('button',{name:/^Side for /}).click();
  await expect.poll(()=>page.evaluate(({key,panelId})=>JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1'))?.[key]?.record?.content.panelLayout.panels.find(row=>row.id===panelId)?.zone,{key,panelId})).toBe('side');
  await toolbar.getByRole('button',{name:'Reorder panels',exact:true}).click();
  const reorder=page.getByRole('dialog',{name:'Reorder panels',exact:true}),picker=reorder.getByRole('combobox',{name:'Reunion tab to reorder',exact:true});
  await expect(picker).toHaveValue(key);await expect(picker.locator('option[value="reunion-calendar"]')).toHaveText('Schedule');
  for(const [target,id] of [['reunion','native-plans'],['reunion-plans','native-rsvp'],['reunion-calendar','native-events']]){await picker.selectOption(target);await expect(reorder.locator(`[data-panel-id="${id}"]`)).toBeVisible()}
  await picker.selectOption(key);await reorder.getByRole('button',{name:'Done',exact:true}).click();
  await toolbar.locator('.page-edit-tools > summary').click();await toolbar.getByRole('button',{name:'Finish arranging',exact:true}).click();await toolbar.locator('.page-mode-done').click();
  await page.reload();await expect(page.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator(`[data-panel-page="${key}"] [data-panel-id="${panelId}"]`)).toBeVisible();
  assert.equal(await page.evaluate(({key,panelId})=>JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1'))?.[key]?.record?.content.panelLayout.panels.find(row=>row.id===panelId)?.zone,{key,panelId}),'side');
  if(tab==='Schedule')await expect(page.getByRole('heading',{name:'Fictional Schedule sidebar',exact:true})).toBeVisible();
  results.push({tab,key,independentEditor:true,allReorderSectionsReachable:true,placementPersists:true});
 }
 assert.deepEqual(errors,[]);const output=resolve(process.env.GW_SCHEDULE_QA_OUTPUT||'docs/schedule-editor-qa');await mkdir(output,{recursive:true});await writeFile(output+'/'+engine+'-receipt.json',JSON.stringify({pass:true,engine,results,fictionalPreviewOnly:true,errors},null,2));console.log(JSON.stringify({pass:true,engine,results}));await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r))}
