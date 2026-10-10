import './test-environment-guard.mjs';
// Hosted fictional fixture only. Real UI navigation for organizer reach,
// Family Leader grant and founding-head handover with consent.
import {chromium,webkit,expect} from '@playwright/test';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_ROLES_BASE||'http://127.0.0.1:4192',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_ROLES_QA_OUTPUT||'docs/roles-succession-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const command=async(page,input)=>{const response=await page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.ok(response.ok(),await response.text());return response.json()};
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
try{
 const owner=await session('owner');
 // 1. A Planner (not a leader, not an admin) reaches only their own Leader Tools.
 await command(owner.page,{type:'APPROVE_MEMBER',id:'alice',status:'active',roles:['planner'],canPost:true});
 const alice=await session('alice');await alice.navigate(base+'/?qa='+randomUUID()+'#/you');
 await alice.page.getByText('Leader overview').click();
 const tabs=alice.page.getByRole('navigation',{name:'Leader tools sections'});await expect(tabs.getByRole('button',{name:/Reunion details/})).toBeVisible();await expect(tabs.getByRole('button',{name:/People/})).toHaveCount(0);
 assert.equal((await alice.page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),type:'APPROVE_MEMBER',id:'bob',status:'active',roles:['admin'],canPost:true}})).status(),403,'planner cannot manage members');
 await alice.page.screenshot({path:`${output}/${engine}-planner-tools.png`});results.push('planner reaches only planner tabs');

 // 2. An admin grants Family Leader through the member review.
 await owner.navigate(base+'/?qa='+randomUUID()+'#/leader-tools?section=members');
 await owner.page.getByText('bob@example.test').first().locator('xpath=ancestor::*[.//button[normalize-space()="Manage Membership"]][1]').getByRole('button',{name:'Manage Membership'}).click();
 const leader=owner.page.getByRole('checkbox',{name:/Family Leader/});await leader.check();
 await owner.page.getByRole('button',{name:'Save membership'}).last().click();
 await expect.poll(async()=>(await (await owner.page.request.get(base+'/api/manage')).json()).members.find(m=>m.id==='bob')?.is_leader).toBe(1);results.push('admin grants Family Leader');

 // 3. The founding head hands over; nothing changes until the named member accepts.
 const h=await command(alice.page,{type:'CREATE_HOUSEHOLD',name:'Fictional Lantern household'});const invite=await command(alice.page,{type:'INVITE_HOUSEHOLD_MEMBER',householdId:h.id,memberId:'bob'});
 const bob=await session('bob');await command(bob.page,{type:'RESOLVE_HOUSEHOLD_REQUEST',id:invite.id,accept:true});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/household/'+h.id);
 const card=alice.page.getByRole('region',{name:'Founding head'});const picker=card.getByRole('combobox',{name:'New founding head'});await picker.fill('Bob');await alice.page.getByRole('option',{name:'Bob',exact:true}).click();
 await card.getByRole('button',{name:'Hand over founding role…'}).click();await card.getByRole('button',{name:'Offer to Bob'}).click();
 await expect(card).toContainText('Waiting for Bob');
 const founder=async page=>(await (await page.request.get(base+'/api/state')).json()).households.find(x=>x.id===h.id).founderId;
 assert.equal(await founder(alice.page),'alice');
 await bob.navigate(base+'/?qa='+randomUUID()+'#/household/'+h.id);const offer=bob.page.getByRole('region',{name:'Founding head'});await expect(offer).toContainText('offered you the founding head role');await bob.page.screenshot({path:`${output}/${engine}-handover-offer.png`});
 await offer.getByRole('button',{name:'Accept founding role'}).click();await expect.poll(()=>founder(bob.page)).toBe('bob');
 results.push('founder handover waits for consent');
 for(const s of [owner,alice,bob])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' roles and succession: '+results.join('; '));
