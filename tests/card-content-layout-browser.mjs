// Hosted synthetic fixture only. Syntax-checking this file is not browser evidence.
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pageContentPayload} from '../src/page-content-model.js';
if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw Error('Run only in the authorized hosted shared-page fixture.');
const base=process.env.GW_PAGE_CONTENT_URL||'http://127.0.0.1:4176';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):4176$/);
const engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],results=[];
const pendingReads=new Set(),network=[];
page.on('request',request=>{if(request.url().startsWith(base+'/api/')&&request.method()==='GET'){pendingReads.add(request);network.push({event:'start',url:request.url(),at:Date.now()})}});
for(const event of ['requestfinished','requestfailed'])page.on(event,request=>{pendingReads.delete(request);network.push({event,url:request.url(),at:Date.now(),failure:request.failure()?.errorText});if(network.length>100)network.shift()});
page.on('pageerror',error=>{errors.push(error.message);network.push({event:'pageerror',message:error.message,stack:error.stack,at:Date.now()})});
const settleReads=async()=>{await expect.poll(()=>pendingReads.size,{timeout:20000,message:'Owner API reads complete before deliberate document navigation'}).toBe(0)};
const navigate=async url=>{await settleReads();await page.goto(url)};
const reload=async()=>{await settleReads();await page.reload()};
await page.addInitScript(()=>{localStorage.setItem('gw-platform','android');localStorage.setItem('gw-install-dismissed','true')});
const output='docs/card-content-qa',hero=()=>page.locator('[data-panel-page="home"] [data-panel-id="hero"]'),card=()=>hero().locator('[data-card-layout="hero"]'),toolbar=()=>page.locator('.page-edit-toolbar');
const read=async()=>{const response=await page.request.get(base+'/api/page-content/home');assert.equal(response.status(),200);return response.json()};
const order=async(column,root=card())=>root.locator(`[data-card-column="${column}"] > [data-card-slot]`).evaluateAll(nodes=>nodes.map(node=>node.dataset.cardSlot));
const begin=async()=>{await toolbar().getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await page.locator('.page-edit-toolbar').locator('.page-edit-tools > summary').click();await page.locator('.page-edit-toolbar').getByRole('button',{name:'Arrange page',exact:true}).click();if(await hero().getAttribute('data-panel-locked')==='true')await hero().getByRole('button',{name:/^Unlock /}).click()};
const arrange=async()=>card().getByRole('button',{name:'Arrange card content',exact:true}).click();
const save=async()=>{await expect(toolbar().locator('.page-edit-mode-label').getByRole('status')).toHaveText(/^(Saved for the family|Changes save automatically)$/)};
const finishAndSave=async(root=card())=>{const response=page.waitForResponse(r=>r.url()===base+'/api/page-content/home'&&r.request().method()==='PATCH');await root.getByRole('button',{name:'Finish arranging',exact:true}).click();const acknowledged=await response;assert.equal(acknowledged.status(),200,'Arrangement is acknowledged before reload');await save()};
const check=async(name,fn)=>{await fn();results.push({check:name,status:'passed'});console.log('CARD CONTENT PASS:',name)};
async function touchDrop(handle,target,{cancel=false}={}){
 const box=await target.boundingBox();assert.ok(box);
 await handle.evaluate((element,{x,y,cancel})=>{const rect=element.getBoundingClientRect(),start={clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2},send=(type,point)=>element.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:77,isPrimary:true,button:0,buttons:1,...point}));send('pointerdown',start);send('pointermove',{clientX:x,clientY:y});send(cancel?'pointercancel':'pointerup',{clientX:x,clientY:y})},{x:box.x+box.width/2,y:box.y+box.height/2,cancel});
}
try{
 await mkdir(output,{recursive:true});await navigate(base+'/__test/signin?user=owner');await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
 // Reset only the synthetic fixture page, using the same revisioned restore API.
 const initial=await read();const reset=await page.request.post(base+'/api/page-content/home/restore',{data:{requestId:'card-fixture-reset-'+Date.now(),expectedRevision:initial.revision,revision:0},headers:{Origin:base}});assert.equal(reset.status(),200);await reload();
 await check('desktop two-column screenshot geometry and source-owned action',async()=>{
  await expect(card().locator('[data-card-slot="media"] img')).toBeVisible();
  const left=await card().locator('[data-card-column="left"]').boundingBox(),right=await card().locator('[data-card-column="right"]').boundingBox();assert.ok(left&&right&&right.x>left.x+left.width);assert.ok(Math.abs(left.width-right.width)<=1,'Desktop columns have equal widths');
  await card().getByRole('button',{name:'Reunion details',exact:true}).click();await expect(page).toHaveURL(/reunion/);await navigate(base+'/#/home');
  await page.screenshot({path:`${output}/${engine}-desktop-original.png`,fullPage:true});
 });
 await check('lock guard, keyboard reordering, alignment and arrangement cancel',async()=>{
  await toolbar().getByRole('button',{name:'Edit page',exact:true}).click();await expect(card().getByRole('button',{name:'Arrange card content',exact:true})).toHaveCount(0);
  await toolbar().locator('.page-edit-tools > summary').click();await toolbar().getByRole('button',{name:'Arrange page',exact:true}).click();await hero().getByRole('button',{name:/^Unlock /}).click();await arrange();
  const handle=card().getByRole('button',{name:'Move Heading',exact:true});await handle.focus();await page.keyboard.press('ArrowRight');await expect(card().locator('[data-card-column="right"] [data-card-slot="title"]')).toBeVisible();await handle.focus();await page.keyboard.press('ArrowUp');assert.deepEqual(await order('right'),['title','media']);
  await card().getByRole('button',{name:'Heading alignment: Center',exact:true}).click();await expect(card().locator('[data-card-slot="title"]')).toHaveAttribute('data-card-align','center');
  await card().getByRole('button',{name:'Cancel arrangement',exact:true}).click();assert.deepEqual(await order('left'),['eyebrow','title','body','action']);assert.deepEqual((await read()).content.cardLayouts,{});
 });
 await check('mouse drag and cancelled touch drag do not alter page panel order',async()=>{
  await arrange();const before=(await read()).content.panelLayout,handle=card().getByRole('button',{name:'Move Heading',exact:true}),target=card().locator('[data-card-column="right"] [data-card-slot="media"]');
  await handle.dragTo(target,{targetPosition:{x:20,y:8}});await expect.poll(()=>order('right')).toEqual(['title','media']);
  const left=card().locator('[data-card-column="left"] .card-column-drop-end');await left.scrollIntoViewIfNeeded();await touchDrop(card().getByRole('button',{name:'Move Heading',exact:true}),left,{cancel:true});assert.deepEqual(await order('right'),['title','media']);
  await card().getByRole('button',{name:'Move Heading',exact:true}).focus();await page.keyboard.press('Escape');assert.deepEqual(await order('right'),['title','media']);assert.deepEqual((await read()).content.panelLayout,before);
  await card().getByRole('button',{name:'Cancel arrangement',exact:true}).click();
 });
 let saved;
 await check('independent text, photo, action placement saves and reloads durably',async()=>{
  await arrange();await card().getByRole('button',{name:'Heading column: Right',exact:true}).click();await card().getByRole('button',{name:'Move Heading earlier',exact:true}).click();await card().getByRole('button',{name:'Heading alignment: Center',exact:true}).click();await card().getByRole('button',{name:'Reunion details button alignment: Right',exact:true}).click();
  for(let step=0;step<7;step++)await card().getByRole('button',{name:'Decrease Photo or video size',exact:true}).click();await card().getByRole('button',{name:'Left column vertical alignment: Top',exact:true}).click();await card().getByRole('button',{name:'Right column vertical alignment: Bottom',exact:true}).click();await card().getByRole('button',{name:'Photo or video aspect ratio: Portrait 3:4',exact:true}).click();await finishAndSave();saved=await read();assert.deepEqual(saved.content.cardLayouts.hero.right.map(item=>item.id),['title','media']);assert.equal(saved.content.cardLayouts.hero.left.at(-1).align,'end');
  await reload();await expect(card().locator('[data-card-slot="title"]')).toHaveAttribute('data-card-align','center');assert.deepEqual(await order('right'),['title','media']);assert.deepEqual((await read()).content.cardLayouts,saved.content.cardLayouts);assert.equal(saved.content.cardLayouts.hero.right.find(item=>item.id==='media').width,65);assert.equal(saved.content.cardLayouts.hero.vertical.right,'bottom');assert.equal(saved.content.cardLayouts.hero.vertical.left,'top');await expect(card().locator('[data-card-column=left]')).toHaveAttribute('data-card-vertical','top');await expect(card().locator('[data-card-column=right]')).toHaveAttribute('data-card-vertical','bottom');
  await page.screenshot({path:`${output}/${engine}-desktop-arranged.png`,fullPage:true});
 });
 await check('mobile stacks left then right, supports touch/selects, preserves save through reload',async()=>{
  await page.setViewportSize({width:390,height:844});await expect(page.locator('[data-panel-page="home"]')).toHaveClass(/is-mobile/);await expect(card().locator('[data-card-column="left"]')).toBeVisible();await expect(card().locator('[data-card-column="right"]')).toBeVisible();const left=await card().locator('[data-card-column="left"]').boundingBox(),right=await card().locator('[data-card-column="right"]').boundingBox();assert.ok(right.y>=left.y+left.height&&Math.abs(right.x-left.x)<=1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1);
  await begin();await arrange();const handle=card().getByRole('button',{name:'Move Reunion date',exact:true}),target=card().locator('[data-card-column="right"] .card-column-drop-end');await target.scrollIntoViewIfNeeded();await touchDrop(handle,target);assert.ok((await order('right')).includes('body'));
  await card().getByRole('button',{name:'Reunion date alignment: Right',exact:true}).click();await finishAndSave();saved=await read();await reload();assert.deepEqual((await read()).content.cardLayouts,saved.content.cardLayouts);await expect(card().locator('[data-card-slot="body"]')).toHaveAttribute('data-card-align','end');
  await page.screenshot({path:`${output}/${engine}-mobile-arranged.png`,fullPage:true});
  for(const width of [320,768,1024]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1,`No overflow at ${width}`);}
 });
 await check('custom CMS content gets the same independent slot editor',async()=>{
  await page.setViewportSize({width:1440,height:1000});await begin();await page.getByRole('button',{name:'Add Panel',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Add Panel',exact:true});await dialog.getByLabel('Two columns',{exact:true}).check();await dialog.getByRole('button',{name:'Add main panel',exact:true}).click();
  const custom=page.locator('[data-panel-page="home"] .page-custom-panel').last(),id=await custom.getAttribute('data-panel-id'),layout=custom.locator('[data-card-layout]');await toolbar().locator('.page-edit-tools > summary').click();await toolbar().getByRole('button',{name:'Finish arranging',exact:true}).click();await custom.getByRole('button',{name:'Edit Panel heading',exact:true}).click();await custom.getByLabel('Panel heading',{exact:true}).fill('Synthetic card layout story');await custom.getByRole('button',{name:'Finish editing Panel heading',exact:true}).click();await toolbar().locator('.page-edit-tools > summary').click();await toolbar().getByRole('button',{name:'Arrange page',exact:true}).click();await layout.getByRole('button',{name:'Arrange card content',exact:true}).click();await layout.getByRole('button',{name:'Second text column: Left',exact:true}).click();await layout.getByRole('button',{name:'Second text alignment: Center',exact:true}).click();await finishAndSave(layout);await reload();
  const record=await read();assert.deepEqual(record.content.cardLayouts[id].right,[]);assert.equal(record.content.cardLayouts[id].left.at(-1).align,'center');
 });
 await check('reset restores one coherent source-owned arrangement and alignment through reload',async()=>{
  await page.setViewportSize({width:1280,height:900});await expect(page.locator('[data-panel-page="home"]')).toHaveClass(/is-wide/);await begin();await arrange();
  await card().getByRole('button',{name:'Reset arrangement',exact:true}).click();await finishAndSave();await reload();
  await expect(card().locator('[data-card-slot="media"] img')).toBeVisible();
  await expect.poll(()=>order('left')).toEqual(['eyebrow','title','body','action']);await expect.poll(()=>order('right')).toEqual(['media']);
  for(const slot of ['eyebrow','title','body'])await expect(card().locator('[data-card-slot="'+slot+'"]')).toHaveAttribute('data-card-align','start');
  await expect(card().locator('[data-card-slot="action"]')).toHaveAttribute('data-card-align','stretch');
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:900});await expect(page.locator('[data-panel-page="home"]')).toHaveClass(width<700?/is-mobile/:/is-wide/);
   await expect(card().locator('[data-card-column="left"]')).toBeVisible();await expect(card().locator('[data-card-column="right"]')).toBeVisible();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1);
   await page.screenshot({path:`${output}/${engine}-reset-${width}.png`,fullPage:true});
  }
 });
 await check('authenticated member can view but cannot edit; metadata cannot bypass public/private boundaries',async()=>{
  const member=await browser.newContext({viewport:{width:1280,height:900}}),view=await member.newPage();try{await view.goto(base+'/__test/signin?user=bob');await expect(view.locator('[data-panel-page="home"] [data-card-layout="hero"]')).toBeVisible();await expect(view.getByRole('button',{name:'Arrange card content',exact:true})).toHaveCount(0);const denied=await member.request.patch(base+'/api/page-content/home',{data:{requestId:'denied-card-write',expectedRevision:(await read()).revision,content:pageContentPayload((await read()).content)},headers:{Origin:base}});assert.equal(denied.status(),403)}finally{await member.close()}
  const anonymous=await browser.newContext();try{assert.equal((await anonymous.request.get(base+'/api/page-content/home')).status(),401)}finally{await anonymous.close()}
 });
 assert.deepEqual(errors,[],JSON.stringify({network}));await writeFile(`${output}/${engine}-card-content-results.json`,JSON.stringify({browser:engine,sourceSha:process.env.GW_SOURCE_SHA||null,results,errors},null,2));
}finally{await context.close();await browser.close()}


