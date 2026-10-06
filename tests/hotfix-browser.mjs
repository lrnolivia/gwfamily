import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
const browser=await (process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({headless:true}),results=[],errors=[];
await mkdir('docs/recovery-qa',{recursive:true});
async function pageFor(width,theme,platform){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>!!document.documentElement.dataset.platform);
 const state=initialState();state.onboarding='done';state.members.find(m=>m.id===state.selfId).profileColor='#c9aa52';
 await page.evaluate(({state,key,theme,platform})=>{localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',platform);localStorage.setItem('gw-preview-notice:v1','seen');localStorage.setItem('gw-install-dismissed','true')},{state,key:PREVIEW_KEY,theme,platform});
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'Main navigation'}).waitFor();return page;
}
try{
 for(const width of [390,768,1280])for(const theme of ['dark','light'])for(const platform of ['ios','android']){
  const p=await pageFor(width,theme,platform),nav=p.getByRole('navigation',{name:'Main navigation'}),fab=p.getByRole('button',{name:'Post an update',exact:true});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page stays within viewport');
  if(width>=700){const a=await nav.boundingBox(),b=await fab.boundingBox();assert.ok(b.x>=a.x+a.width+8,'FAB beside nav with gap');assert.ok(b.x+b.width<=width-12,'FAB stays onscreen');assert.ok(Math.abs((a.y+a.height/2)-(b.y+b.height/2))<20,'FAB aligned with nav');}
  await p.getByRole('button',{name:'Profile and appearance'}).click();
  const rows=await p.locator('.profile-menu .list-row').evaluateAll(rows=>rows.map(e=>{const s=getComputedStyle(e);return {top:s.paddingTop,bottom:s.paddingBottom,align:s.alignItems}}));assert.ok(rows.length);assert.ok(rows.every(r=>r.top===r.bottom&&r.align==='center'));
  await p.screenshot({path:`docs/recovery-qa/hotfix-menu-${width}-${theme}-${platform}.png`});await p.keyboard.press('Escape');
  await fab.click();await p.getByText('Tag family',{exact:false}).first().click();const picker=p.getByRole('combobox',{name:'Family in this post'});await picker.fill('Shirley');await p.getByRole('option',{name:/Shirley Thomas/}).click();await p.getByRole('textbox',{name:"What's on your mind"}).fill('A family memory from the hotfix test');await p.getByRole('button',{name:'Send post',exact:true}).click();await p.getByText('A family memory from the hotfix test',{exact:true}).waitFor();const savedPost=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.posts.find(post=>post.text==='A family memory from the hotfix test'),PREVIEW_KEY);assert.ok(savedPost?.memberIds?.includes('shirley'),'saved post retains selected ancestor ID');assert.equal(await p.locator('.ancestor-tag').filter({hasText:'Shirley Thomas'}).count(),1,'ancestor tag is rendered with its memorial description');
  await nav.getByRole('button',{name:'You',exact:true}).click();await p.getByRole('button',{name:'Edit profile',exact:true}).click();
  await p.screenshot({path:`docs/recovery-qa/hotfix-profile-${width}-${theme}-${platform}.png`,fullPage:true});
  results.push({width,theme,platform,status:'passed'});await p.close();
 }
 // Exercise standalone CSS rules in the browser; this is a simulation, not a physical-device install check.
 for(const width of [390,768]){
  const p=await pageFor(width,'dark','ios');
  const applied=await p.evaluate(()=>{let count=0;function visit(rules){for(const rule of rules){if(rule.media?.mediaText.includes('display-mode: standalone')||rule.media?.mediaText.includes('display-mode:standalone')){rule.media.mediaText='all';count++}if(rule.cssRules)visit(rule.cssRules)}}for(const sheet of document.styleSheets){try{visit(sheet.cssRules)}catch{}}return count});assert.ok(applied>0,'standalone CSS rules exercised');
  const nav=await p.locator('.bottom').boundingBox();assert.ok(nav.y+nav.height<=900&&900-nav.y-nav.height<=8,'standalone nav close to bottom');
  await p.screenshot({path:`docs/recovery-qa/hotfix-standalone-simulation-${width}.png`});results.push({width,check:'standalone CSS simulation',status:'passed'});await p.close();
 }
 const draft=await pageFor(390,'dark','ios');let fresh=false;const current=await draft.locator('meta[name="gw-build"]').getAttribute('content');
 await draft.route('**/build.json',route=>route.fulfill({json:{version:fresh?'ffffffffffffffffffff':current}}));
 await draft.getByRole('button',{name:'Post an update',exact:true}).click();await draft.getByRole('textbox',{name:"What's on your mind"}).fill('Keep this unsaved family story');fresh=true;
 await draft.evaluate(()=>window.dispatchEvent(new Event('online')));await draft.locator('.build-update-notice button').waitFor({state:'attached'});
 assert.equal(await draft.getByRole('textbox',{name:"What's on your mind"}).inputValue(),'Keep this unsaved family story');assert.equal(await draft.locator('dialog[open]').count(),1,'update does not dismiss the draft');await draft.getByRole('button',{name:'Close dialog',exact:true}).click();await draft.getByRole('button',{name:'Reload updated app'}).waitFor();await draft.getByRole('button',{name:'Post an update',exact:true}).click();assert.equal(await draft.getByRole('textbox',{name:"What's on your mind"}).inputValue(),'Keep this unsaved family story','draft survives dismissing and reopening the composer with an update ready');
 results.push({check:'new build notice preserves unsaved composer',status:'passed'});await draft.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await writeFile('docs/recovery-qa/hotfix-results.json',JSON.stringify({results,errors},null,2));await browser.close()}
