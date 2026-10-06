// Blocking regression: do not replace same-tab reload with a new page/session.
// Runs independently of live-browser.mjs against the isolated fixture server.
import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:4174';
const png={name:'safari-reload-test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHMkAAAAASUVORK5CYII=','base64')};
const results=[],browser=await webkit.launch({headless:true});
await mkdir('docs/live-qa',{recursive:true});
async function decoded(page,selector){await page.waitForFunction(selector=>{const img=document.querySelector(selector);return img?.complete&&img.naturalWidth===1&&img.naturalHeight===1},selector,{timeout:15000})}
async function sameTabReload(page,selector,label){
 const url=page.url();
 const response=await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response?.status(),200,label+' document loads');
 await page.getByRole('navigation',{name:'Main navigation'}).waitFor();
 assert.equal(page.url(),url,label+' retains the active route');
 await decoded(page,selector);
 assert.equal(await page.locator('dialog[open]').count(),0,label+' does not restore a dismissed editor');
}
try {
 for(const scenario of [
  {name:'desktop-webkit-mobile-width',viewport:{width:390,height:844},reducedMotion:'reduce'},
  {name:'desktop-safari',viewport:{width:1280,height:900}},
  {name:'touch-safari',viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'},
 ]) {
  const {name,...options}=scenario,context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('crash',()=>errors.push('WebKit renderer crashed'));
  // Test the glass path explicitly even if a fixture/browser default changes.
  await context.addInitScript(()=>localStorage.setItem('gw-platform','ios'));
  await page.goto(origin+'/__test/signin?user=alice');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Family',exact:true}).click();
  await page.getByRole('tab',{name:'Memories',exact:true}).click();
  const before=await page.locator('.field-memory-open').count();
  const existingPaths=new Set(await page.locator('.field-memory-open img').evaluateAll(images=>images.map(img=>new URL(img.src,location.href).pathname)));
  let failedMediaOnce=false,retried=0,failedPath='';
  await page.route('**/api/media/*',route=>{
   const request=route.request();
   const mediaUrl=new URL(request.url());
   if(request.method()==='GET'&&!existingPaths.has(mediaUrl.pathname)){
    if(mediaUrl.pathname===failedPath&&mediaUrl.searchParams.has('_gw_retry'))retried++;
    if(!failedMediaOnce){failedMediaOnce=true;failedPath=mediaUrl.pathname;return route.fulfill({status:503,json:{error:'Synthetic transient storage failure'}})}
   }
   return route.continue();
  });
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Add a memory',exact:true}).click();
  await(await chooser).setFiles(png);
  await page.getByText('Your memory is saved. Add any details you know, or close this window.').waitFor();
  await decoded(page,'.memory-edit-media');
  await page.waitForFunction(()=>[...document.querySelectorAll('.field-memory-open img')].every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(failedMediaOnce,true,name+' exercises one failed private media request');
  assert.ok(retried>0,name+' exercises the bounded private media retry');
  const mediaPath=new URL(await page.locator('.memory-edit-media').getAttribute('src'),origin).pathname;
  assert.equal(failedPath,mediaPath,name+' retries the newly uploaded image');
  const galleryImage=`.field-memory-open img[src^="${mediaPath}"],.field-memory-open img[src^="${origin+mediaPath}"]`;
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.locator('dialog').waitFor({state:'detached'});
  await page.unroute('**/api/media/*');
  await decoded(page,galleryImage);
  assert.equal(await page.locator('.field-memory-open').count(),before+1,name+' saves exactly one new memory');
  const glass=await page.evaluate(()=>({
   layers:document.querySelectorAll('.liquid-glass-effect').length,
   svgImages:document.querySelectorAll('filter feImage').length,
   passes:[...document.querySelectorAll('filter')].map(el=>el.querySelectorAll('feDisplacementMap').length),
   filters:[...document.querySelectorAll('.liquid-glass-effect')].map(el=>getComputedStyle(el).filter),
   blur:[...document.querySelectorAll('.liquid-glass-effect')].map(el=>getComputedStyle(el).backdropFilter||getComputedStyle(el).webkitBackdropFilter),
  }));
  assert.ok(glass.layers>0,name+' retains glass material layers');
  assert.ok(glass.blur.some(value=>value?.includes('blur(')),name+' retains native backdrop glass');
  assert.ok(glass.svgImages>0,name+' retains real SVG displacement images');
  if(!options.hasTouch)assert.ok(glass.filters.some(value=>value.includes('url(')),name+' retains refraction filters');
  else assert.ok(glass.filters.every(value=>value==='none'),name+' preserves package touch fallback');
  assert.ok(glass.passes.every(value=>value===1),name+' uses one displacement pass per filter');
  const geometry=await page.locator('.field-memory-gallery').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(geometry.width>0&&geometry.height>0&&geometry.scrollWidth<=geometry.viewport+1,name+' has bounded gallery geometry');
  await page.screenshot({path:`docs/live-qa/safari-reload-${name}-before.png`,timeout:15000});
  await writeFile(`docs/live-qa/safari-memory-reload-${name}-before.json`,JSON.stringify({scenario:name,status:'awaiting first same-tab reload',retried,glass,geometry},null,2));
  await sameTabReload(page,galleryImage,name+' initial reload');
  assert.equal(await page.locator('.field-memory-open').count(),before+1,name+' persists the uploaded memory after same-tab reload');
  // Reopening and dismissing must not leave a filter/observer alive on a sheet.
  await page.locator(galleryImage).click();
  await decoded(page,'.memory-large');
  await page.getByRole('button',{name:'Add or edit details',exact:true}).click();
  await decoded(page,'.memory-edit-media');
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({state:'detached'});
  await page.locator('.page-back').click();
  await decoded(page,galleryImage);
  await sameTabReload(page,galleryImage,name+' repeated reload');
  assert.deepEqual(errors,[],name+' has no page/renderer errors');
  await page.screenshot({path:`docs/live-qa/safari-reload-${name}.png`});
  results.push({scenario:name,passed:true,retried,glass,geometry});
  console.log('GW-WEBKIT-MEMORY-RELOAD passed',name);
  await context.close();
 }
 await writeFile('docs/live-qa/safari-memory-reload-results.json',JSON.stringify({passed:true,results},null,2));
} catch(error) {
 await writeFile('docs/live-qa/safari-memory-reload-results.json',JSON.stringify({passed:false,results,error:error.stack||error.message},null,2));
 console.error('::error title=Safari same-tab memory reload regression::'+String(error.stack||error.message).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));
 process.exitCode=1;
} finally {await browser.close()}
