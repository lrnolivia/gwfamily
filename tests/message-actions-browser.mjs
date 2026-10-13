import './test-environment-guard.mjs';
// Hosted fictional fixture only. Reply with a quote, edit, unsend seen live by
// the other participant, undo, and the per-chat mute toggle.
import {chromium,webkit,expect} from '@playwright/test';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_MESSAGE_ACTIONS_BASE||'http://127.0.0.1:4195',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_MESSAGE_ACTIONS_QA_OUTPUT||'docs/message-actions-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const post=async(page,path,data,method='post')=>{const response=await page.request[method](base+path,{headers:{Origin:base},data});return {status:response.status(),data:await response.json()}};
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
try{
 const alice=await session('alice'),bob=await session('bob');
 const chat=await post(alice.page,'/api/conversations',{requestId:randomUUID(),type:'group',name:'Fictional cousins',memberIds:['bob']});const id=chat.data.id;
 await post(bob.page,`/api/conversations/${id}/invitation`,{action:'accept'});
 await post(bob.page,`/api/conversations/${id}/messages`,{requestId:randomUUID(),body:'Fictional question about Saturday'});
 await post(alice.page,`/api/conversations/${id}/messages`,{requestId:randomUUID(),body:'Fictional tpyo answer'});
 // 1. Reply quotes the original message.
 await alice.navigate(base+'/?qa='+randomUUID()+'#/chat/'+id);
 const question=alice.page.locator('.direct-message',{hasText:'Fictional question about Saturday'});await question.getByRole('button',{name:'Message actions'}).click();await question.getByRole('button',{name:'Reply'}).click();
 await expect(alice.page.locator('.message-replying')).toContainText('Fictional question');
 await alice.page.locator('.message-compose-area textarea, .message-compose-area [contenteditable]').first().fill('Fictional quoted reply');await alice.page.getByRole('button',{name:'Send'}).click();
 await expect(alice.page.locator('.direct-message',{hasText:'Fictional quoted reply'}).locator('.message-quote')).toContainText('Fictional question about Saturday');results.push('reply with quote');
 // 2. Edit own message.
 const typo=alice.page.locator('.direct-message',{hasText:'Fictional tpyo answer'});await typo.getByRole('button',{name:'Message actions'}).click();await typo.getByRole('button',{name:'Edit'}).click();
 const editForm=alice.page.getByRole('form',{name:'Edit message'});await editForm.getByLabel('Edit message').fill('Fictional typo answer');const patched=alice.page.waitForResponse(r=>r.request().method()==='PATCH');await editForm.getByRole('button',{name:'Save edit'}).click();const patchResponse=await patched;assert.equal(patchResponse.status(),200,await patchResponse.text());
 await expect(alice.page.locator('.direct-message',{hasText:'Fictional typo answer'})).toContainText('Edited');results.push('edit');
 // 3. Unsend; the other participant's open chat updates while polling; undo restores.
 await bob.navigate(base+'/?qa='+randomUUID()+'#/chat/'+id);await expect(bob.page.locator('.direct-message',{hasText:'Fictional typo answer'})).toBeVisible();
 const own=alice.page.locator('.direct-message',{hasText:'Fictional typo answer'});await own.getByRole('button',{name:'Message actions'}).click();await own.getByRole('button',{name:'Unsend'}).click();
 await expect(alice.page.getByText('You unsent this message')).toBeVisible();
 await expect(bob.page.getByText('Message unsent')).toBeVisible({timeout:12000});await expect(bob.page.locator('.direct-message',{hasText:'Fictional typo answer'})).toHaveCount(0);
 await bob.page.screenshot({path:`${output}/${engine}-unsent.png`});
 await alice.page.getByRole('button',{name:'Undo unsend'}).click();await expect(bob.page.locator('.direct-message',{hasText:'Fictional typo answer'})).toBeVisible({timeout:12000});results.push('unsend seen live and undone');
 // 4. Mute this conversation from its details.
 await alice.navigate(base+'/?qa='+randomUUID()+'#/chat-settings/'+id);const mute=alice.page.getByRole('checkbox',{name:'Mute this conversation'});await mute.check();
 await expect.poll(async()=>(await (await alice.page.request.get(base+'/api/conversations/'+id)).json()).conversation.muted).toBe(true);
 assert.equal((await (await bob.page.request.get(base+'/api/conversations/'+id)).json()).conversation.muted,false,'mute is per participant');results.push('per-chat mute');
 for(const s of [alice,bob])await s.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' message actions: '+results.join('; '));
