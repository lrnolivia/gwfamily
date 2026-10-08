import './test-environment-guard.mjs';
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
 await expect(dialog.getByRole('button',{name:'Create invitation link',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Send email invitation',exact:true})).toBeDisabled();await dialog.getByRole('textbox',{name:'Recipient email',exact:true}).fill('pending@example.test');await dialog.getByRole('button',{name:'Send email invitation',exact:true}).click();const link=await dialog.getByLabel('Invitation link',{exact:true}).inputValue();assert.match(link,/#\/family-invite\/[a-f0-9]{64}$/);await expect(dialog).toContainText('Invitation email sent.');
 const pending=await browser.newContext({viewport:{width:390,height:844}}),view=await pending.newPage();view.on('pageerror',error=>errors.push(error.message));try{
  await view.goto(base+'/__test/signin?user=pending');await expect(view.getByText('Fictional read-only family update',{exact:true})).toBeVisible();
  await expect(view.getByRole('button',{name:'Post an update',exact:true})).toHaveCount(0);assert.equal((await pending.request.get(base+'/api/conversations')).status(),403);
  await view.goto(base+'/'+new URL(link).hash);await expect(view.getByRole('heading',{name:'Alice invited you to join the fun.',exact:true})).toBeVisible();await view.getByRole('button',{name:'Accept invitation',exact:true}).click();await expect(view.getByRole('button',{name:'Accept invitation',exact:true})).toHaveCount(0);
  await expect(view.getByText('Fictional read-only family update',{exact:true})).toHaveCount(0);assert.equal((await pending.request.get(base+'/api/state')).status(),403);
 }finally{await pending.close()}
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.goto(base+'/#/invitations');await expect(page.getByRole('heading',{name:'Invitations',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create your invitation link',exact:true}).click();
 const reusable=page.getByLabel('Your reusable invitation link',{exact:true});await expect(reusable).toBeVisible();const original=await reusable.inputValue();assert.match(original,/#\/family-invite\/[a-f0-9]{64}$/);
 await page.reload();await expect(reusable).toHaveValue(original);
 await page.getByRole('button',{name:'Replace link',exact:true}).click();await page.getByRole('button',{name:'Keep current link',exact:true}).click();await expect(reusable).toHaveValue(original);
 await page.getByRole('button',{name:'Replace link',exact:true}).click();await page.getByRole('button',{name:'Replace invitation link',exact:true}).click();await expect(reusable).not.toHaveValue(original);
 const replacement=await reusable.inputValue();await page.reload();await expect(reusable).toHaveValue(replacement);
 await mkdir('docs/invitation-qa',{recursive:true});await page.screenshot({path:`docs/invitation-qa/${engine}-reusable-link.png`,fullPage:true});
 await page.goto(base+'/__test/signin?user=owner');await page.goto(base+'/#/family?tab=tree');await page.getByRole('button',{name:'Add memorial profile',exact:true}).click();
 const memorial=page.getByRole('dialog',{name:'Remembering family',exact:true});await expect(memorial).toBeVisible();
 await memorial.getByRole('textbox',{name:'Name',exact:true}).fill('Fictional QA ancestor');await memorial.getByRole('textbox',{name:'Birth year',exact:true}).fill('1870');await memorial.getByRole('textbox',{name:'Year of passing',exact:true}).fill('1940');await memorial.getByRole('textbox',{name:'Family story · Optional',exact:true}).fill('An isolated test story.');
 await memorial.locator('form').getByRole('button',{name:'Save memorial profile',exact:true}).click();await expect(memorial).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:/Fictional QA ancestor.*In loving memory/}).click();const memorialPage=page.locator('.memorial-page');await expect(memorialPage).toBeVisible();await expect(memorialPage).toContainText('1870 – 1940');
 await page.getByRole('button',{name:'Memorial options',exact:true}).click();await page.getByRole('menuitem',{name:'Edit memorial',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit memorial',exact:true});await editor.getByRole('textbox',{name:'Family story Optional',exact:true}).fill('An updated isolated test story.');await editor.locator('form').getByRole('button',{name:'Save memorial',exact:true}).click();await expect(editor).toHaveCount(0);
 await page.reload();await expect(memorialPage).toContainText('An updated isolated test story.');await page.screenshot({path:`docs/invitation-qa/${engine}-memorial.png`,fullPage:true});
 await page.goto(base+'/#/about');await expect(page.getByRole('heading',{name:'About Green & White',exact:true})).toBeVisible();await page.locator('.about-open-source>summary').click();await expect(page.getByRole('heading',{name:'Software',exact:true})).toBeVisible();await page.locator('.about-notice').filter({hasText:'react 19.2.0'}).first().locator('summary').click();await expect(page.locator('.about-notice[open] pre')).toBeVisible();
 await page.goto(base+'/__test/signin?user=bob');await page.goto(base+'/#/family?tab=tree');await expect(page.getByRole('button',{name:'Add memorial profile',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:1024,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1);assert.deepEqual(errors,[]);
 await mkdir('docs/invitation-qa',{recursive:true});await page.screenshot({path:`docs/invitation-qa/${engine}-invitation.png`,fullPage:true});await writeFile(`docs/invitation-qa/${engine}-results.json`,JSON.stringify({sourceSha:process.env.GW_SOURCE_SHA,engine,result:'pass',synthetic:true,errors},null,2));
}finally{await context.close();await browser.close()}
