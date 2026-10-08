import {webkit,chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {PREVIEW_MESSAGES_KEY} from '../src/messaging-model.js';
const base=process.env.GW_REACTION_URL||'http://127.0.0.1:4179';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser=await(process.env.GW_BROWSER==='chromium'?chromium:webkit).launch({headless:true}),results=[],errors=[];
await mkdir('docs/reaction-menu-qa',{recursive:true});
const transparent='rgba(0, 0, 0, 0)';
try{
 for(const [width,height,theme,platform] of [[390,844,'dark','ios'],[390,844,'light','ios'],[320,568,'dark','android'],[1280,900,'light','android']]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const state=initialState();state.onboarding='done';
  await page.addInitScript(({state,key,messagesKey,theme,platform})=>{
   localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));sessionStorage.setItem('gw-active-mode','preview');localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',platform);localStorage.setItem('gw-install-dismissed','true');localStorage.setItem('gw-preview-notice:v1','seen');
   const other=state.members.find(member=>member.id!==state.selfId&&!member.managedBy),members=[state.members.find(member=>member.id===state.selfId),other].map(member=>({...member,status:'active'}));
   localStorage.setItem(messagesKey,JSON.stringify({conversations:[{id:'reaction-qa',type:'direct',ownerId:state.selfId,members,createdAt:new Date().toISOString(),latestSequence:0}],messages:{'reaction-qa':[]}}));
  },{state,key:PREVIEW_KEY,messagesKey:PREVIEW_MESSAGES_KEY,theme,platform});
  await page.goto(base,{waitUntil:'domcontentloaded'});await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  const post=page.locator('.post-card').first(),trigger=post.getByRole('button',{name:'Add reaction',exact:true});
  await trigger.click();const picker=page.locator('.reaction-pop:popover-open');await expect(picker).toBeVisible();
  const checkPicker=async()=>{await page.mouse.move(0,0);const metrics=await picker.evaluate(element=>{const grid=element.querySelector('.emoji-grid'),box=element.getBoundingClientRect();return {count:grid.children.length,height:box.height,left:box.left,right:box.right,top:box.top,bottom:box.bottom,gridScroll:grid.scrollHeight-grid.clientHeight,gridX:grid.scrollWidth-grid.clientWidth,pickerScroll:element.scrollHeight-element.clientHeight,choices:[...element.querySelectorAll('.emoji-choice')].map(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {background:s.backgroundColor,shadow:s.boxShadow,width:r.width,height:r.height}})}});assert.ok(metrics.count<=24,JSON.stringify(metrics));assert.ok(metrics.gridScroll<=1&&metrics.gridX<=1&&metrics.pickerScroll<=1,JSON.stringify(metrics));assert.ok(metrics.left>=0&&metrics.top>=0&&metrics.right<=width+1&&metrics.bottom<=height+1,JSON.stringify(metrics));for(const choice of metrics.choices){assert.equal(choice.background,transparent);assert.equal(choice.shadow,'none');assert.ok(choice.width>=44&&choice.height>=44)}return metrics};
  const pickerMetrics=await checkPicker(),first=await picker.locator('.emoji-grid .emoji-choice').first().getAttribute('aria-label');
  await picker.getByRole('button',{name:'More emoji',exact:true}).click();assert.notEqual(await picker.locator('.emoji-grid .emoji-choice').first().getAttribute('aria-label'),first);await checkPicker();
  await picker.getByRole('button',{name:'Previous emoji',exact:true}).click();assert.equal(await picker.locator('.emoji-grid .emoji-choice').first().getAttribute('aria-label'),first);
  await picker.getByRole('searchbox',{name:'Search emoji'}).fill('zz-no-result');await expect(picker.getByRole('status')).toHaveText('No emoji found. Try another word.');
  await picker.getByRole('searchbox',{name:'Search emoji'}).fill('heart');await expect(picker.locator('.emoji-grid .emoji-choice').first()).toBeVisible();
  await picker.getByRole('searchbox',{name:'Search emoji'}).fill('');await picker.locator('.emoji-grid .emoji-choice').first().focus();await page.keyboard.press('Tab');assert.ok(await picker.locator('.emoji-grid .emoji-choice').nth(1).evaluate(node=>getComputedStyle(node).outlineStyle!=='none'));
  await page.screenshot({path:`docs/reaction-menu-qa/emoji-${width}-${theme}-${platform}.png`});
  const selected=picker.getByRole('button',{name:'React ❤️',exact:true});await selected.click();await expect(picker).toHaveCount(0);await trigger.click();await expect(picker.getByRole('button',{name:'React ❤️',exact:true})).toHaveAttribute('aria-pressed',String(!(state.reactions[state.posts[0].id]||[]).includes('❤️')));await page.keyboard.press('Escape');
  await post.getByRole('button',{name:'Post options',exact:true}).click();const menu=page.getByRole('menu',{name:'Post options'});await expect(menu).toBeVisible();
  await page.mouse.move(0,0);const menuMetrics=await menu.getByRole('menuitem').evaluateAll(items=>items.map(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {label:node.textContent,background:s.backgroundColor,height:r.height,glyph:!!node.querySelector('.glyph'),shadow:s.boxShadow}}));assert.equal(menuMetrics.length,6);for(const item of menuMetrics){assert.equal(item.background,transparent);assert.equal(item.shadow,'none');assert.ok(item.glyph&&item.height>=44&&item.height<58)}
  await expect(menu.getByRole('menuitem',{name:'Focus View',exact:true})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(menu.getByRole('menuitem',{name:'Share post',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(menu.getByRole('menuitem',{name:'Report',exact:true})).toBeFocused();
  await page.screenshot({path:`docs/reaction-menu-qa/post-menu-${width}-${theme}-${platform}.png`});await page.keyboard.press('Escape');await expect(post.getByRole('button',{name:'Post options',exact:true})).toBeFocused();
  await post.getByRole('button',{name:'Post options',exact:true}).click();await page.getByRole('menuitem',{name:'Focus View',exact:true}).click();await expect(page).toHaveURL(/#\/post\//);await expect(page.locator('.detail-page .post-card')).toBeVisible();
  await page.goto(base+'/#/chat/reaction-qa',{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'domcontentloaded'});const text=page.getByRole('textbox',{name:'Write a message',exact:true});await expect(text).toBeVisible();
  const composer=await page.locator('.message-writing').evaluate(element=>{const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},textarea=element.querySelector('textarea'),attach=element.querySelector('.attach-direct'),send=element.querySelector('.send-button');return {outer:box(element),text:box(textarea),attach:box(attach),send:box(send),paddingLeft:parseFloat(getComputedStyle(textarea).paddingLeft)}});
  assert.ok(composer.attach.right<=composer.text.x&&composer.text.right<=composer.send.x,JSON.stringify(composer));assert.ok(Math.abs(composer.attach.y-composer.text.y)<=1&&Math.abs(composer.send.y-composer.text.y)<=1,JSON.stringify(composer));assert.equal(composer.attach.width,44);assert.equal(composer.send.width,44);assert.ok(composer.outer.right<=width&&composer.outer.x>=0);
  await text.fill('Inline composer verification');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.locator('.message-bubble').filter({hasText:'Inline composer verification'})).toBeVisible();await expect(text).toHaveValue('');await page.screenshot({path:`docs/reaction-menu-qa/composer-${width}-${theme}-${platform}.png`});
  results.push({width,height,theme,platform,picker:pickerMetrics,menu:menuMetrics,composer,status:'passed'});await writeFile('docs/reaction-menu-qa/results.json',JSON.stringify({browser:process.env.GW_BROWSER||'webkit',results,errors},null,2));console.log('PASS',width,height,theme,platform);await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile('docs/reaction-menu-qa/results.json',JSON.stringify({browser:process.env.GW_BROWSER||'webkit',results,errors},null,2));console.log('PASS emoji pagination/search/selection/focus, glyph menu and keyboard actions, inline composer geometry/send across four phone/desktop variants');
}finally{await browser.close()}
