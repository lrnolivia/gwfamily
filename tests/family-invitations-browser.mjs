// Hosted synthetic fixture only. Never run against production.
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw Error('Run only in the authorized hosted fixture.');
const base='http://127.0.0.1:4177',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{localStorage.setItem('gw-platform','android');localStorage.setItem('gw-install-dismissed','true')});
try{
 await page.goto(base+'/__test/signin?user=alice');await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Family',exact:true}).click();await page.getByRole('button',{name:'Invite someone',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Invite someone',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Create invitation link',exact:true}).click();const link=await dialog.getByLabel('Invitation link',{exact:true}).inputValue();assert.match(link,/#\/family-invite\/[a-f0-9]{64}$/);await expect(dialog).toContainText('Invitation link created.');
 const pending=await browser.newContext({viewport:{width:390,height:844}}),view=await pending.newPage();view.on('pageerror',error=>errors.push(error.message));try{
  await view.goto(base+'/__test/signin?user=pending');await expect(view.getByText('Fictional read-only family update',{exact:true})).toBeVisible();
  await expect(view.getByRole('button',{name:'Post an update',exact:true})).toHaveCount(0);assert.equal((await pending.request.get(base+'/api/conversations')).status(),403);
  await view.goto(base+'/'+new URL(link).hash);await view.getByRole('button',{name:'Accept invitation',exact:true}).click();await expect(view.getByRole('status').filter({hasText:'Invitation recorded.'})).toBeVisible();
  await expect(view.getByText('Fictional read-only family update',{exact:true})).toHaveCount(0);assert.equal((await pending.request.get(base+'/api/state')).status(),403);
 }finally{await pending.close()}
 await page.setViewportSize({width:1024,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1);assert.deepEqual(errors,[]);
 await mkdir('docs/invitation-qa',{recursive:true});await page.screenshot({path:`docs/invitation-qa/${engine}-invitation.png`,fullPage:true});await writeFile(`docs/invitation-qa/${engine}-results.json`,JSON.stringify({sourceSha:process.env.GW_SOURCE_SHA,engine,result:'pass',synthetic:true,errors},null,2));
}finally{await context.close();await browser.close()}
