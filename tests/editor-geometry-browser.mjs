// Hosted, synthetic fixture only. Screenshots establish rendered geometry;
// they do not establish physical-device acceptance or production persistence.
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted CI lane.');
const base='http://127.0.0.1:4188',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium';
const output='docs/editor-geometry-qa',results=[],errors=[];
await mkdir(output,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{localStorage.setItem('gw-platform','ios');localStorage.setItem('gw-install-dismissed','true')});
const toolbar=()=>page.locator('.page-edit-toolbar'),tools=()=>page.locator('.page-object-tools[open]');
const saved=()=>expect(toolbar().locator('.page-edit-mode-label').getByRole('status')).toHaveText(/^(Saved for the family|Changes save automatically)$/);
const begin=async()=>{await toolbar().getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await expect(page.locator('html')).toHaveAttribute('data-page-edit-mode','true')};
const finish=async()=>{await saved();await toolbar().locator('.page-mode-done').click();await expect(page.locator('html')).not.toHaveAttribute('data-page-edit-mode','true')};
const read=async()=>{const response=await page.request.get(base+'/api/page-content/home');assert.equal(response.status(),200);return response.json()};
const snapshot=locator=>locator.evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
const stable=(before,after)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<=1,JSON.stringify({before,after,key}))};
try{
 await page.goto(base+'/__test/signin?user=owner');
 await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});await begin();
  await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeHidden();
  const heading=page.locator('[data-page-field="home.feedTitle"]');
  const before=await snapshot(heading);
  await heading.getByRole('button',{name:'Edit Feed heading',exact:true}).click();
  const input=heading.getByRole('textbox',{name:'Feed heading',exact:true});
  const geometry=await input.evaluate(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node),canvas=document.createElement('canvas'),drawing=canvas.getContext('2d');drawing.font=style.font;return {left:r.left,right:r.right,width:node.clientWidth,text:drawing.measureText(node.value).width,font:style.font,scroll:document.documentElement.scrollWidth,viewport:innerWidth}});
  assert.ok(geometry.width>=geometry.text+1,JSON.stringify(geometry));
  assert.ok(geometry.left>=-1&&geometry.right<=width+1&&geometry.scroll<=width+1,JSON.stringify(geometry));
  stable(before,await snapshot(heading));
  await page.screenshot({path:`${output}/${engine}-heading-${width}.png`});
  await heading.getByRole('button',{name:'Finish editing Feed heading',exact:true}).click();
  const body=page.locator('[data-page-field="home.nextRsvpBody"]');
  const panel=body.locator('xpath=ancestor::section[@data-panel-id][1]');
  const panelBefore=await snapshot(panel);
  await body.getByRole('button',{name:'Edit RSVP next-step copy',exact:true}).click();
  await expect(tools().getByRole('textbox',{name:'RSVP next-step copy',exact:true})).toBeVisible();
  await expect(body.getByRole('textbox')).toHaveCount(0);
  const buttons=await tools().locator('.page-markdown-toolbar button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));assert.ok(Math.max(...buttons)-Math.min(...buttons)<=1);
  await expect(tools().getByRole('button',{name:'Bold',exact:true})).toBeVisible();
  stable(panelBefore,await snapshot(panel));
  const layer=await tools().locator('.liquid-glass-content').evaluate(node=>({display:getComputedStyle(node).display,z:getComputedStyle(node).zIndex,effect:getComputedStyle(node.parentElement.querySelector('.liquid-glass-effect')).zIndex}));assert.notEqual(layer.display,'contents');assert.ok(Number(layer.z)>Number(layer.effect));
  const textbox=tools().getByRole('textbox',{name:'RSVP next-step copy',exact:true});await textbox.fill('Live formatting preview');await expect(body).toContainText('Live formatting preview');
  await tools().getByRole('button',{name:'Undo formatting or typing',exact:true}).click();await expect(body).not.toContainText('Live formatting preview');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`${output}/${engine}-wysiwyg-${width}.png`});
  await tools().getByRole('button',{name:'Done',exact:true}).click();
  await finish();results.push(`Heading and in-place WYSIWYG at ${width}px`);
 }
 await page.setViewportSize({width:1280,height:900});await begin();
 const hero=page.locator('[data-panel-page="home"] [data-panel-id="hero"]');
 if(await hero.getAttribute('data-panel-locked')==='true'){
  await hero.getByRole('button',{name:/^Panel options for /}).click();
  await tools().getByRole('button',{name:/^Unlock /}).click();await saved();
  await tools().getByRole('button',{name:'Close object tools',exact:true}).click();
 }
 await hero.getByRole('button',{name:'Layout for Heading',exact:true}).click();
 await expect(tools().getByRole('img',{name:'Preview of Heading',exact:true})).toContainText('More time');
 await expect(tools().getByRole('img',{name:'Preview of Heading',exact:true}).locator('[contenteditable=true],input,textarea')).toHaveCount(0);
 await tools().getByRole('button',{name:'Close object tools',exact:true}).click();
 await toolbar().locator('.page-edit-tools > summary').click();await toolbar().getByRole('button',{name:'Arrange page',exact:true}).click();
 await expect(hero.getByRole('button',{name:'Edit Hero heading',exact:true})).toHaveCount(0);await expect(hero.getByRole('button',{name:'Edit Home page media',exact:true})).toHaveCount(0);
 const strip=hero.locator('.page-panel-inline-controls');await expect(strip.getByRole('combobox')).toHaveCount(0);
 const tops=await strip.locator('button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));assert.ok(Math.max(...tops)-Math.min(...tops)<=1);
 await expect(strip.getByRole('button',{name:/^Hero for /})).toBeVisible();
 await hero.getByRole('button',{name:'Arrange card content',exact:true}).click();
 await expect(hero.locator('.card-slot-content[inert]')).not.toHaveCount(0);await expect(hero.getByRole('textbox')).toHaveCount(0);
 await hero.getByRole('button',{name:'Finish arranging',exact:true}).click();await toolbar().locator('.page-edit-tools > summary').click();await toolbar().getByRole('button',{name:'Finish arranging',exact:true}).click();
 const before=(await read()).content,canvasBefore=await snapshot(hero);
 await hero.getByRole('button',{name:'Edit Home page media',exact:true}).click();
 await expect(tools()).toBeVisible();assert.equal(await tools().evaluate(node=>node.matches(':modal')),false);
 stable(canvasBefore,await snapshot(hero));
 const inspectorBefore=await snapshot(tools()),handle=tools().locator('.page-object-tools-heading');await handle.focus();await page.keyboard.press('ArrowLeft');const moved=await snapshot(tools());assert.ok(moved.x<inspectorBefore.x);await page.keyboard.press('Home');stable(inspectorBefore,await snapshot(tools()));
 const bar=await handle.boundingBox();await page.mouse.move(bar.x+20,bar.y+20);await page.mouse.down();await page.mouse.move(25,25,{steps:5});await page.mouse.up();const dragged=await snapshot(tools());assert.ok(dragged.x>=11&&dragged.y>=11&&dragged.x+dragged.width<=1281&&dragged.y+dragged.height<=901);await handle.focus();await page.keyboard.press('Home');
 await expect(tools().getByRole('button',{name:'Full',exact:true})).toBeVisible();await expect(tools().getByRole('button',{name:'Mobile',exact:true})).toBeVisible();
 for(const label of ['Placement','Alignment','Image size','Shape','Zoom','Position'])await expect(tools().locator('.image-control-label').filter({hasText:new RegExp('^'+label+'$')})).toBeVisible();
 await expect(tools().getByRole('button',{name:'Reset frame',exact:true})).toBeVisible();await expect(tools().getByRole('button',{name:'Replace media',exact:true})).toBeVisible();

 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});
  const rows=await tools().locator('.image-control-row').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return {left:r.left,right:r.right,padding:Number.parseFloat(style.paddingLeft),radius:Number.parseFloat(style.borderRadius),children:[...node.querySelectorAll('button,input')].map(control=>{const b=control.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height}})}}));
  for(const row of rows){assert.ok(row.padding>=12&&row.radius>=12,JSON.stringify(row));for(const c of row.children)assert.ok(c.left>=row.left-1&&c.right<=row.right+1&&c.width>=43.9&&c.height>=43.9,JSON.stringify(row))}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`${output}/${engine}-photo-${width}.png`});
 }
 await tools().getByRole('button',{name:'Decrease Photo or video size',exact:true}).click();
 await tools().getByRole('button',{name:'Apply image',exact:true}).click();await saved();
 const applied=(await read()).content;assert.notDeepEqual(applied.cardLayouts,before.cardLayouts);
 await toolbar().getByRole('button',{name:'Undo Edit image',exact:true}).click();await saved();
 assert.deepEqual((await read()).content.cardLayouts,before.cardLayouts);
 await toolbar().getByRole('button',{name:'Redo Edit image',exact:true}).click();await saved();
 assert.deepEqual((await read()).content.cardLayouts,applied.cardLayouts);
 results.push('Photo platters, stable canvas and autosaved compensating Undo/Redo');
 await toolbar().getByRole('button',{name:'Add Panel',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'Add Panel',exact:true});const dismiss=await sheet.getByRole('button',{name:'Close dialog',exact:true}).boundingBox(),title=await sheet.locator('.sheet-head h2').boundingBox();assert.ok(dismiss.x>title.x+title.width);
 await sheet.getByRole('button',{name:'Add main panel',exact:true}).click();await saved();
 const added=(await read()).content.panelLayout.panels.find(row=>row.kind==='content');assert.ok(added);
 await toolbar().getByRole('button',{name:'Undo Add panel',exact:true}).click();await saved();
 assert.equal((await read()).content.panelLayout.panels.find(row=>row.id===added.id)?.removed,true);
 await toolbar().getByRole('button',{name:'Redo Add panel',exact:true}).click();await saved();
 assert.equal((await read()).content.panelLayout.panels.find(row=>row.id===added.id)?.removed,false);
 results.push('New panel Undo/Redo remains a revisioned edit');
 assert.deepEqual(errors,[]);
}finally{
 await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,source:process.env.GW_SOURCE_SHA,results,errors},null,2));
 await context.close();await browser.close();
}
