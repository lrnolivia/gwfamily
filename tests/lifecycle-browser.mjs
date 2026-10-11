import './test-environment-guard.mjs';
// Hosted fictional fixture only. Child record removal and restore, memorial
// archive and restore, and an account deletion review that deletes nothing.
import {chromium,webkit,expect} from '@playwright/test';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_LIFECYCLE_BASE||'http://127.0.0.1:4197',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_LIFECYCLE_QA_OUTPUT||'docs/lifecycle-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const command=async(page,input)=>{const r=await page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.ok(r.ok(),await r.text());return r.json()};
const state=async page=>(await page.request.get(base+'/api/state')).json();
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
try{
 const alice=await session('alice'),owner=await session('owner');
 // 1. Child record: remove privately, then restore.
 await command(alice.page,{type:'ADD_PERSON',child:true,member:{name:'Fictional Sprout',birthday:'2020-04-05',gender:'Prefer not to say'}});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/household-children');await alice.page.getByRole('button',{name:/Fictional Sprout/}).first().click();
 await alice.page.getByRole('button',{name:/Remove Fictional Sprout’s record/}).click();await alice.page.getByRole('group',{name:/Remove Fictional Sprout/}).getByRole('button',{name:'Remove record'}).click();
 const removed=alice.page.getByRole('region',{name:'Removed records'});await expect(removed).toContainText('Fictional Sprout');
 await removed.getByRole('button',{name:'Restore'}).click();await expect(removed).toHaveCount(0);
 assert.ok((await state(alice.page)).members.some(m=>m.name==='Fictional Sprout'));results.push('child record removed and restored');
 // 2. Memorial archive and restore.
 const memorial=await command(owner.page,{type:'ADD_MEMORIAL',memorial:{name:'Fictional Great-Aunt'}});
 await owner.navigate(base+'/?qa='+randomUUID()+'#/memorial/'+memorial.id);await owner.page.getByRole('button',{name:'Memorial options'}).click();
 await owner.page.getByRole('menuitem',{name:'Archive memorial…'}).click();await owner.page.getByRole('group',{name:'Archive memorial'}).getByRole('button',{name:'Archive memorial'}).click();
 await expect.poll(async()=>(await state(alice.page)).memorials.some(m=>m.id===memorial.id)).toBe(false);
 await owner.navigate(base+'/?qa='+randomUUID()+'#/removed');const archived=owner.page.getByRole('region',{name:'Archived'});await expect(archived).toContainText('Fictional Great-Aunt');
 await owner.page.screenshot({path:`${output}/${engine}-archived.png`});
 await archived.getByRole('button',{name:'Restore'}).click();await expect.poll(async()=>(await state(alice.page)).memorials.some(m=>m.id===memorial.id)).toBe(true);results.push('memorial archived and restored');
 // 3. Deletion review: requested, acknowledged, nothing deleted.
 await alice.navigate(base+'/?qa='+randomUUID()+'#/you');await alice.page.getByRole('button',{name:/Your account data/}).click();
 await alice.page.getByRole('button',{name:'Request a deletion review'}).click();await expect(alice.page.getByRole('button',{name:'Deletion review requested'})).toBeDisabled();
 await alice.page.screenshot({path:`${output}/${engine}-account-data.png`,fullPage:true});
 await owner.navigate(base+'/?qa='+randomUUID()+'#/you');await owner.page.getByRole('button',{name:/Account requests \(1\)/}).click();
 await owner.page.getByRole('region',{name:'Account requests to review'}).getByRole('button',{name:'Acknowledge'}).click();
 await expect.poll(async()=>(await state(alice.page)).accountRequests[0].status).toBe('acknowledged');assert.equal((await state(alice.page)).selfId,'alice','account still active');
 results.push('deletion review acknowledged, nothing deleted');
 for(const s of [alice,owner])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' lifecycle: '+results.join('; '));
