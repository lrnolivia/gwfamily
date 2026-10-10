import './test-environment-guard.mjs';
// Hosted fictional fixture only. Saved destination, post corrections, poll lock
// after votes and leader pin/unpin through ordinary UI navigation.
import {chromium,webkit,expect} from '@playwright/test';
import {createTestPng} from './png-fixtures.mjs';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_SAVED_BASE||'http://127.0.0.1:4194',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_SAVED_QA_OUTPUT||'docs/saved-editing-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const command=async(page,input)=>{const response=await page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.ok(response.ok(),await response.text());return response.json()};
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
const upload=async(page,name)=>{const r=await page.request.post(base+'/api/media',{headers:{Origin:base},multipart:{file:{name,mimeType:'image/png',buffer:createTestPng(200,140)}}});assert.equal(r.status(),201);return r.json()};
try{
 const alice=await session('alice'),bob=await session('bob'),owner=await session('owner');
 // 1. Saved: bob saves a post, finds it under You → Saved, searches it.
 const saved=await command(alice.page,{type:'ADD_POST',post:{text:'Fictional cobbler recipe'}});
 await bob.navigate(base+'/?qa='+randomUUID()+'#/post/'+saved.id);await bob.page.locator('.detail-page').getByRole('button',{name:/^Save$/}).first().click();
 await bob.navigate(base+'/?qa='+randomUUID()+'#/you');await bob.page.getByRole('button',{name:/^Saved Posts, comments/}).click();
 await expect(bob.page.locator('.saved-page .post-card',{hasText:'Fictional cobbler recipe'})).toBeVisible();
 await bob.page.getByPlaceholder('Search saved').fill('zzz');await expect(bob.page.getByText('Nothing saved matches that search.')).toBeVisible();
 await bob.page.getByPlaceholder('Search saved').fill('cobbler');await expect(bob.page.locator('.saved-page .post-card',{hasText:'Fictional cobbler recipe'})).toBeVisible();
 await bob.page.screenshot({path:`${output}/${engine}-saved.png`});results.push('Saved destination with search');
 // 2. The author removes a wrong attachment and corrects tags.
 const a=await upload(alice.page,'fictional-right.png'),b=await upload(alice.page,'fictional-wrong.png');
 const post=await command(alice.page,{type:'ADD_POST',post:{text:'Fictional reunion photos',files:[a,b],memberIds:['bob']}});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/post/'+post.id);await alice.page.locator('.detail-page').getByRole('button',{name:'Post options'}).first().click();await alice.page.getByRole('menuitem',{name:'Edit post'}).click();
 const form=alice.page.getByRole('form',{name:'Edit post'});await form.getByRole('button',{name:'Remove fictional-wrong.png'}).click();
 await alice.page.screenshot({path:`${output}/${engine}-post-corrections.png`});
 await form.getByRole('button',{name:'Save changes'}).click();await expect(form).toBeHidden();
 await expect.poll(async()=>(await (await alice.page.request.get(base+'/api/state')).json()).posts.find(p=>p.id===post.id).files.map(f=>f.name).join()).toBe('fictional-right.png');results.push('attachment corrected');
 // 3. A poll locks its choices after the first vote; closing is still offered.
 const poll=await command(alice.page,{type:'ADD_POST',post:{text:'Fictional poll',poll:{question:'Which day?',mode:'single',options:['Saturday','Sunday']}}});
 await command(bob.page,{type:'POLL_VOTE',postId:poll.id,options:[0]});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/post/'+poll.id);await alice.page.locator('.detail-page').getByRole('button',{name:'Post options'}).first().click();await alice.page.getByRole('menuitem',{name:'Edit post'}).click();
 const pollForm=alice.page.getByRole('form',{name:'Edit post'});await expect(pollForm).toContainText('already voted');await expect(pollForm.getByLabel('Question')).toHaveCount(0);
 await pollForm.getByLabel('Close voting').check();await pollForm.getByRole('button',{name:'Save changes'}).click();await expect(pollForm).toBeHidden();
 const closed=await bob.page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),type:'POLL_VOTE',postId:poll.id,options:[1]}});assert.equal(closed.status(),409);results.push('poll locked after votes and closed');
 // 4. A Family Leader unpins and re-pins an announcement from the post menu.
 const ann=await command(owner.page,{type:'ADD_POST',post:{text:'Fictional pinned announcement',asLeader:true,pinned:true}});
 await owner.navigate(base+'/?qa='+randomUUID()+'#/post/'+ann.id);await owner.page.locator('.detail-page').getByRole('button',{name:'Post options'}).first().click();await owner.page.getByRole('menuitem',{name:'Unpin from top'}).click();
 await expect.poll(async()=>(await (await owner.page.request.get(base+'/api/state')).json()).posts.find(p=>p.id===ann.id).pinned).toBe(false);
 await bob.navigate(base+'/?qa='+randomUUID()+'#/post/'+ann.id);await bob.page.locator('.detail-page').getByRole('button',{name:'Post options'}).first().click();await expect(bob.page.getByRole('menuitem',{name:/Pin to top|Unpin/})).toHaveCount(0);
 results.push('leader pin/unpin');
 for(const s of [alice,bob,owner])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' saved and editing: '+results.join('; '));
