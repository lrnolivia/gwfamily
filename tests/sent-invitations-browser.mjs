import './test-environment-guard.mjs';
// Hosted fictional fixture with invitations enabled (GW_INVITATION_FIXTURE=1,
// in-memory email stub). Sent list, revoke and request withdrawal through the UI.
import {chromium,webkit,expect} from '@playwright/test';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_SENT_INVITES_BASE||'http://127.0.0.1:4196',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_SENT_INVITES_QA_OUTPUT||'docs/sent-invitations-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
const post=async(page,path,data)=>{const r=await page.request.post(base+path,{headers:{Origin:base},data});return {status:r.status(),data:await r.json()}};
try{
 const alice=await session('alice'),bob=await session('bob');
 const sent=await post(alice.page,'/api/family-invitations',{expectedAccountId:'alice',email:'fictional.cousin@example.test',sendEmail:true});assert.equal(sent.status,201);
 assert.equal((await post(alice.page,'/api/family-invitations',{expectedAccountId:'alice',email:'fictional.cousin@example.test',sendEmail:true})).status,409);
 await alice.navigate(base+'/?qa='+randomUUID()+'#/invitations');const card=alice.page.getByRole('region',{name:'Sent invitations'});
 const row=card.locator('.sent-row',{hasText:'fictional.cousin@example.test'});await expect(row).toContainText('Waiting');
 await alice.page.screenshot({path:`${output}/${engine}-sent.png`,fullPage:true});
 await row.getByRole('button',{name:'Revoke…'}).click();await row.getByRole('button',{name:'Revoke',exact:true}).click();await expect(row).toContainText('Revoked');
 results.push('sent list with duplicate protection and revoke');
 const h=await post(alice.page,'/api/commands',{requestId:randomUUID(),type:'CREATE_HOUSEHOLD',name:'Fictional Oak household'});
 await post(bob.page,'/api/commands',{requestId:randomUUID(),type:'REQUEST_HOUSEHOLD_JOIN',householdId:h.data.id});
 await bob.navigate(base+'/?qa='+randomUUID()+'#/invitations');const request=bob.page.getByRole('region',{name:'Sent invitations'}).locator('.sent-row',{hasText:'Asked to join Fictional Oak household'});
 await request.getByRole('button',{name:'Withdraw'}).click();await expect(request).toHaveCount(0);
 const waiting=(await (await alice.page.request.get(base+'/api/state')).json()).householdRequests.filter(r=>r.householdId===h.data.id);assert.equal(waiting.length,0);
 results.push('household request withdrawn');
 for(const s of [alice,bob])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' sent invitations: '+results.join('; '));
