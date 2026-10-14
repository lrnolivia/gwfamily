import './test-environment-guard.mjs';
// Hosted fictional fixture only (GW_HISTORY_FIXTURE=1). Real UI navigation across
// member, other member and moderator: memory removal and restore, the report
// queue, and history paging beyond the first page. No real family data.
import {chromium,webkit,expect} from '@playwright/test';
import {createTestPng} from './png-fixtures.mjs';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_HISTORY_BASE||'http://127.0.0.1:4191',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_HISTORY_QA_OUTPUT||'docs/content-history-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const command=async(page,input)=>{const response=await page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.ok(response.ok(),await response.text());return response.json()};
async function session(user,width=390){const context=await browser.newContext({viewport:{width,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
const state=async page=>(await page.request.get(base+'/api/state')).json();
try{
 // 1. The uploader removes a memory through the viewer, then restores it from You.
 const alice=await session('alice');
 const upload=await alice.page.request.post(base+'/api/media',{headers:{Origin:base},multipart:{file:{name:'fictional-porch.png',mimeType:'image/png',buffer:createTestPng(240,160)}}});assert.equal(upload.status(),201);
 const file=await upload.json(),memoryId=randomUUID();await command(alice.page,{type:'ADD_MEMORY',memory:{id:memoryId,image:file.url,title:'Fictional porch light'}});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/memory/'+memoryId);
 await alice.page.getByRole('button',{name:'Memory options',exact:true}).click();
 await alice.page.getByRole('menu',{name:'Memory options',exact:true}).getByRole('menuitem',{name:'Remove memory',exact:true}).click();
 const confirm=alice.page.getByRole('group',{name:'Remove memory'});await expect(confirm).toContainText('can restore it for 30 days');
 await confirm.getByRole('button',{name:'Remove memory'}).click();
 await expect(alice.page.locator('.gw-toast-message',{hasText:'Memory removed.'})).toBeVisible();
 assert.equal((await state(alice.page)).memories.some(m=>m.id===memoryId),false);assert.equal((await state(alice.page)).posts.some(p=>p.id===memoryId),false,'the linked feed post leaves too');
 await alice.navigate(base+'/?qa='+randomUUID()+'#/you');await alice.page.getByRole('button',{name:/Recently removed/}).click();
 const row=alice.page.locator('.removed-row',{hasText:'Fictional porch light'});await expect(row).toBeVisible();await alice.page.screenshot({path:`${output}/${engine}-recently-removed.png`});
 await row.getByRole('button',{name:'Restore'}).click();await expect(alice.page).toHaveURL(new RegExp('#/memory/'+memoryId));
 assert.equal((await state(alice.page)).memories.some(m=>m.id===memoryId),true);results.push('memory removed and restored through the UI');

 // 2. Another member reports a post through the post menu and cannot reach the queue.
 const target=await command(alice.page,{type:'ADD_POST',post:{text:'Fictional report target'}});
 const bob=await session('bob');await bob.navigate(base+'/?qa='+randomUUID()+'#/post/'+target.id);
 await bob.page.locator('.detail-page').getByRole('button',{name:'Post options'}).first().click();await bob.page.getByRole('menuitem',{name:'Report'}).click();
 await bob.page.getByLabel('Reason for reporting').fill('Fictional reason for the moderators');await bob.page.getByRole('button',{name:'Submit report'}).click();
 await expect(bob.page.getByLabel('Reason for reporting')).toBeHidden();
 await bob.navigate(base+'/?qa='+randomUUID()+'#/you');await expect(bob.page.getByRole('button',{name:/^Reports/})).toHaveCount(0);
 await bob.navigate(base+'/?qa='+randomUUID()+'#/moderation');await expect(bob.page.getByText('This page is available to family moderators.')).toBeVisible();
 assert.equal((await bob.page.request.get(base+'/api/moderation/reports')).status(),403);results.push('member reports; queue denied to non-moderators');

 // 3. The moderator reaches Reports from You, opens the context and confirms removal.
 const owner=await session('owner');await owner.navigate(base+'/?qa='+randomUUID()+'#/you');await owner.page.getByRole('button',{name:/^Reports/}).click();
 const card=owner.page.locator('.report-card',{hasText:'Fictional report target'});await expect(card).toContainText('Reported by Bob');await expect(card).toContainText('Fictional reason for the moderators');
 await owner.page.screenshot({path:`${output}/${engine}-report-queue.png`});
 await card.getByRole('button',{name:'Open in context'}).click();await expect(owner.page).toHaveURL(new RegExp('#/post/'+target.id));await owner.page.goBack();
 await owner.page.locator('.report-card',{hasText:'Fictional report target'}).getByRole('button',{name:'Remove item…'}).click();
 await owner.page.getByRole('group',{name:'Confirm removal'}).getByRole('button',{name:'Remove item'}).click();
 await expect(owner.page.locator('.report-card',{hasText:'Fictional report target'})).toHaveCount(0);
 await owner.page.getByRole('tab',{name:'Resolved'}).click();await expect(owner.page.locator('.report-card',{hasText:'Fictional report target'})).toContainText('Removed');
 assert.equal((await state(bob.page)).posts.some(p=>p.id===target.id),false);results.push('moderator resolves through ordinary navigation');

 // 4. History beyond the first page: feed, memories and a long conversation.
 await bob.navigate(base+'/?qa='+randomUUID()+'#/home');const older=bob.page.getByRole('button',{name:'Show older posts'});await older.scrollIntoViewIfNeeded();await older.click();
 await expect.poll(async()=>bob.page.locator('.feed-stack .post-card').count()).toBeGreaterThan(100);
 await bob.navigate(base+'/?qa='+randomUUID()+'#/family?tab=memories');const olderMemories=bob.page.getByRole('button',{name:'Show older memories'});await olderMemories.scrollIntoViewIfNeeded();await olderMemories.click();await expect(olderMemories).toBeHidden();
 await bob.page.getByRole('searchbox').first().fill('lantern').catch(()=>{});
 await bob.navigate(base+'/?qa='+randomUUID()+'#/post/history-post-129');const earlier=bob.page.getByRole('button',{name:/Show earlier comments/});await expect(earlier).toBeVisible();await earlier.click();await expect(earlier).toBeHidden();
 await expect(bob.page.getByText('Fictional reply 0',{exact:true})).toBeVisible();results.push('older posts, memories and comments load in place');
 for(const s of [alice,bob,owner])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' content history: '+results.join('; '));
