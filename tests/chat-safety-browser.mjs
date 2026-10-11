import './test-environment-guard.mjs';
// Hosted fictional fixture only. Decline-and-block from the inbox, choosing
// messages to report, and the moderator seeing only that snapshot.
import {chromium,webkit,expect} from '@playwright/test';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_CHAT_SAFETY_BASE||'http://127.0.0.1:4193',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_CHAT_SAFETY_QA_OUTPUT||'docs/chat-safety-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const post=async(page,path,data)=>{const response=await page.request.post(base+path,{headers:{Origin:base},data});return {status:response.status(),data:await response.json()}};
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
try{
 const alice=await session('alice'),bob=await session('bob'),owner=await session('owner');
 // 1. Decline and block from the inbox; the sender cannot invite again.
 assert.equal((await post(bob.page,'/api/conversations',{requestId:randomUUID(),type:'direct',memberIds:['alice']})).status,201);
 await alice.navigate(base+'/?qa='+randomUUID()+'#/inbox');const invite=alice.page.locator('.conversation-invite').first();await expect(invite).toBeVisible();
 await invite.getByRole('button',{name:'Decline and block…'}).click();await invite.getByRole('button',{name:/Decline and block Bob/}).click();
 await expect(alice.page.locator('.conversation-invite')).toHaveCount(0);
 const again=await post(bob.page,'/api/conversations',{requestId:randomUUID(),type:'direct',memberIds:['alice']});assert.equal(again.status,400);assert.doesNotMatch(again.data.error,/block/i);
 results.push('decline and block stops repeat invitations');
 // 2. Unblock in conversation details later; report only chosen messages.
 assert.equal((await post(alice.page,'/api/conversations/blocks',{memberId:'bob',blocked:false})).status,200);
 const chat=await post(alice.page,'/api/conversations',{requestId:randomUUID(),type:'group',name:'Fictional pair',memberIds:['bob']});assert.equal(chat.status,201);const id=chat.data.id;
 await post(bob.page,`/api/conversations/${id}/invitation`,{action:'accept'});
 for(const body of ['Fictional greeting','Fictional message to report','Fictional unrelated update'])await post(bob.page,`/api/conversations/${id}/messages`,{requestId:randomUUID(),body});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/chat-settings/'+id);
 const safety=alice.page.getByRole('region',{name:'Safety'});await expect(safety).toContainText('Bob');
 await safety.getByRole('button',{name:'Report messages…'}).click();
 await alice.page.locator('.direct-message',{hasText:'Fictional message to report'}).getByRole('checkbox').check();
 const bar=alice.page.getByRole('form',{name:'Report messages'});await expect(bar).toContainText('1 message chosen');await bar.getByLabel('Reason').fill('Fictional reason for moderators');
 await alice.page.screenshot({path:`${output}/${engine}-report-messages.png`});
 await bar.getByRole('button',{name:'Send report'}).click();await expect(bar).toBeHidden();results.push('member reports only chosen messages');
 // 3. The moderator sees the snapshot, cannot open the chat, and marks it handled.
 assert.equal((await owner.page.request.get(base+'/api/conversations/'+id)).status(),404);
 await owner.navigate(base+'/?qa='+randomUUID()+'#/moderation');const card=owner.page.locator('.report-card',{hasText:'Fictional reason for moderators'});
 await expect(card).toContainText('Fictional message to report');await expect(card).not.toContainText('Fictional unrelated update');await expect(card).not.toContainText('Fictional greeting');
 await owner.page.screenshot({path:`${output}/${engine}-message-report.png`});
 await card.getByRole('button',{name:'Mark handled'}).click();await expect(owner.page.locator('.report-card',{hasText:'Fictional reason for moderators'})).toHaveCount(0);
 results.push('moderator sees only the snapshot and resolves it');
 for(const s of [alice,bob,owner])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' chat safety: '+results.join('; '));
