import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
const browser=await (process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({headless:true}),results=[],errors=[];
await mkdir('docs/recovery-qa',{recursive:true});
async function pageFor(width,theme,platform,mode='browser'){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(mode=>{Object.defineProperty(navigator,'standalone',{get:()=>mode==='standalone'});const original=window.matchMedia.bind(window);window.matchMedia=query=>{const media=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(media,'matches',{get:()=>mode==='standalone'});return media}},mode);
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>!!document.documentElement.dataset.platform);
 const state=initialState();state.onboarding='done';state.members.find(m=>m.id===state.selfId).profileColor='#c9aa52';
 await page.evaluate(({state,key,theme,platform})=>{localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));
  sessionStorage.setItem('gw-active-mode','preview');localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',platform);localStorage.setItem('gw-preview-notice:v1','seen');localStorage.setItem('gw-install-dismissed','true')},{state,key:PREVIEW_KEY,theme,platform});
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'Main navigation'}).waitFor();return page;
}
async function verifyFilterPlatter(page,locator,label){
 await expect(locator).toBeVisible();
 const paint=await locator.evaluate(element=>{
  const probe=document.createElement('span');probe.style.background='var(--raised)';probe.style.color='var(--text)';element.append(probe);
  const actual=getComputedStyle(element),expected=getComputedStyle(probe),box=element.getBoundingClientRect();
  const result={background:actual.backgroundColor,raised:expected.backgroundColor,color:actual.color,text:expected.color,padding:parseFloat(actual.paddingLeft),radius:parseFloat(actual.borderRadius),width:box.width,overflow:document.documentElement.scrollWidth-innerWidth};probe.remove();return result;
 });
 assert.equal(paint.background,paint.raised,label+' follows the active raised surface');assert.equal(paint.color,paint.text,label+' follows active text');
 const search=locator.locator('input[type="search"]');if(await search.count()){
  const placeholder=await search.evaluate(element=>{const probe=document.createElement('span');probe.style.color='var(--work-control-muted)';element.parentElement.append(probe);const result={actual:getComputedStyle(element,'::placeholder').color,expected:getComputedStyle(probe).color,opacity:getComputedStyle(element,'::placeholder').opacity};probe.remove();return result});assert.equal(placeholder.actual,placeholder.expected,label+' search hint follows theme text');assert.equal(placeholder.opacity,'1');
 }
 assert.ok(paint.padding>=12&&paint.radius>=12&&paint.width>200,label+' has its own padded platter');assert.ok(paint.overflow<=1,label+' stays within viewport');
 // Changing a theme token must immediately repaint the shell without remounting.
 const custom=await locator.evaluate(element=>{const root=document.documentElement,previous=root.style.getPropertyValue('--raised');root.style.setProperty('--raised','rgb(93, 71, 108)');const background=getComputedStyle(element).backgroundColor;if(previous)root.style.setProperty('--raised',previous);else root.style.removeProperty('--raised');return background;});
 assert.equal(custom,'rgb(93, 71, 108)',label+' follows custom theme tokens');
}
async function verifyFilterPlatters(page,width,theme){
 const nav=page.getByRole('navigation',{name:'Main navigation'}),feed=page.locator('.inline-filters.filter-platter'),feedTrigger=feed.getByRole('button',{name:'Filter family feed',exact:true});
 await verifyFilterPlatter(page,feed,'Feed');await feedTrigger.click();await expect(feedTrigger).toHaveAttribute('aria-expanded','true');await expect(feed.locator('.filter-option').first()).toBeVisible();await feed.locator('.filter-option').first().focus();await page.keyboard.press('Escape');await expect(feedTrigger).toHaveAttribute('aria-expanded','false');await expect(feedTrigger).toBeFocused();
 await page.screenshot({path:`docs/recovery-qa/filter-feed-${width}-${theme}.png`,fullPage:true});
 await nav.getByRole('button',{name:'Family',exact:true}).click();await page.getByRole('tab',{name:'People',exact:true}).click();
 const people=page.getByRole('region',{name:'Family directory',exact:true});await verifyFilterPlatter(page,people,'People');await people.getByRole('button',{name:'Filter & sort',exact:true}).click();await expect(people.getByRole('button',{name:'Done',exact:true})).toBeVisible();
 await page.screenshot({path:`docs/recovery-qa/filter-people-${width}-${theme}.png`,fullPage:true});await people.getByRole('button',{name:'Done',exact:true}).click();await expect(people.getByRole('button',{name:'Filter & sort',exact:true})).toBeFocused();
 await page.getByRole('tab',{name:'Memories',exact:true}).click();const memories=page.getByRole('region',{name:'Memory',exact:true});await verifyFilterPlatter(page,memories,'Memories');await memories.getByRole('button',{name:'Filter & sort',exact:true}).click();await expect(memories.getByRole('button',{name:'Done',exact:true})).toBeVisible();
 // Capture the interactive panel in its normal viewport, and prove that
 // scrolling and capture leave its controls open and usable.
 const memoryTrigger=memories.getByRole('button',{name:'Filter & sort',exact:true}),memoryDone=memories.getByRole('button',{name:'Done',exact:true});
 await memoryDone.scrollIntoViewIfNeeded();await expect(memoryTrigger).toHaveAttribute('aria-expanded','true');await expect(memoryDone).toBeVisible();
 await page.screenshot({path:`docs/recovery-qa/filter-memories-${width}-${theme}.png`});await expect(memoryTrigger).toHaveAttribute('aria-expanded','true');await memoryDone.click();await nav.getByRole('button',{name:'Home',exact:true}).click();
 results.push({width,theme,check:'raised theme-token filter platters',status:'passed'});
}
try{
 for(const width of [390,768,1280])for(const theme of ['dark','light'])for(const platform of ['ios','android']){
  const p=await pageFor(width,theme,platform),nav=p.getByRole('navigation',{name:'Main navigation'}),fab=p.getByRole('button',{name:'Post an update',exact:true});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page stays within viewport');
  if(width<=768&&platform==='android')await verifyFilterPlatters(p,width,theme);
  if(width>=700){const a=await nav.boundingBox(),b=await fab.boundingBox();assert.ok(b.x>=a.x+a.width+8,'FAB beside nav with gap');assert.ok(b.x+b.width<=width-12,'FAB stays onscreen');assert.ok(Math.abs((a.y+a.height/2)-(b.y+b.height/2))<20,'FAB aligned with nav');}
  await p.getByRole('button',{name:'Profile and appearance'}).click();
  const rows=await p.locator('.profile-menu .list-row').evaluateAll(rows=>rows.map(e=>{const s=getComputedStyle(e);return {top:s.paddingTop,bottom:s.paddingBottom,align:s.alignItems}}));assert.ok(rows.length);assert.ok(rows.every(r=>r.top===r.bottom&&r.align==='center'));
  await p.screenshot({path:`docs/recovery-qa/hotfix-menu-${width}-${theme}-${platform}.png`});await p.keyboard.press('Escape');
  await fab.click();await p.getByText('Tag family',{exact:false}).first().click();const picker=p.getByRole('combobox',{name:'Family in this post'});await picker.fill('Shirley');await p.getByRole('option',{name:/Shirley Thomas/}).click();await p.getByRole('textbox',{name:"What's on your mind"}).fill('A family memory from the hotfix test');await p.getByRole('button',{name:'Send post',exact:true}).click();await p.getByText('A family memory from the hotfix test',{exact:true}).waitFor();const savedPost=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.posts.find(post=>post.text==='A family memory from the hotfix test'),PREVIEW_KEY);assert.ok(savedPost?.memberIds?.includes('shirley'),'saved post retains selected ancestor ID');assert.equal(await p.locator('.ancestor-tag').filter({hasText:'Shirley Thomas'}).count(),1,'ancestor tag is rendered with its memorial description');
  await nav.getByRole('button',{name:'You',exact:true}).click();await p.getByRole('button',{name:'Edit profile',exact:true}).click();
  await p.screenshot({path:`docs/recovery-qa/hotfix-profile-${width}-${theme}-${platform}.png`,fullPage:true});
  results.push({width,theme,platform,status:'passed'});await p.close();
 }
 // Exercise the real display-mode listener and CSS; this is a simulation, not a physical-device install check.
 for(const width of [390,768]){
  const p=await pageFor(width,'dark','ios','standalone');
  assert.equal(await p.locator('html').getAttribute('data-display-mode'),'standalone','Real navigation listener observes simulated installed mode');
  const nav=await p.locator('.bottom').boundingBox();assert.ok(nav.y+nav.height<=900&&900-nav.y-nav.height<=8,'standalone nav close to bottom');
  await p.screenshot({path:`docs/recovery-qa/hotfix-standalone-simulation-${width}.png`});results.push({width,check:'standalone CSS simulation',status:'passed'});await p.close();
 }
 const draft=await pageFor(390,'dark','ios');let fresh=false;const current=await draft.locator('meta[name="gw-build"]').getAttribute('content');
 await draft.route('**/build.json',route=>route.fulfill({json:{version:fresh?'ffffffffffffffffffff':current}}));
 await draft.getByRole('button',{name:'Post an update',exact:true}).click();await draft.getByRole('textbox',{name:"What's on your mind"}).fill('Keep this unsaved family story');fresh=true;
 await draft.evaluate(()=>window.dispatchEvent(new Event('online')));await draft.getByRole('button',{name:'Reload updated app',exact:true}).waitFor({state:'attached'});
 assert.equal(await draft.getByRole('textbox',{name:"What's on your mind"}).inputValue(),'Keep this unsaved family story');assert.equal(await draft.locator('dialog[open]').count(),1,'update does not dismiss the draft');await draft.getByRole('button',{name:'Close dialog',exact:true}).click();await draft.getByRole('button',{name:'Reload updated app'}).waitFor();await draft.getByRole('button',{name:'Post an update',exact:true}).click();assert.equal(await draft.getByRole('textbox',{name:"What's on your mind"}).inputValue(),'Keep this unsaved family story','draft survives dismissing and reopening the composer with an update ready');
 results.push({check:'new build notice preserves unsaved composer',status:'passed'});await draft.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}catch(error){console.error(error);console.log('::error title=GW hotfix browser::'+String(error.stack||error.message).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));throw error}finally{await writeFile('docs/recovery-qa/hotfix-results.json',JSON.stringify({results,errors},null,2));await browser.close()}
