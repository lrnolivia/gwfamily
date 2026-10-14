import './test-environment-guard.mjs';
// Loopback-only, fictional, resettable in-memory fixture. No family data.
import {chromium,webkit,expect} from '@playwright/test';
import {createTestPng} from './png-fixtures.mjs';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';

const base=process.env.GW_MEMORY_MENU_BASE||'http://127.0.0.1:4199';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium';
const output=process.env.GW_MEMORY_MENU_QA_OUTPUT||'../memory-menu-qa';
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
const results=[],errors=[],sessions=[];
await mkdir(output,{recursive:true});
const command=async(page,input)=>{const response=await page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.ok(response.ok(),await response.text());return response.json()};
const state=async page=>(await page.request.get(base+'/api/state')).json();
async function session(user,theme='dark',platform='ios'){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',acceptDownloads:true}),page=await context.newPage();
 sessions.push(context);page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(user+': '+error.message));
 await page.addInitScript(({theme,platform})=>{localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',platform);localStorage.setItem('gw-install-dismissed','true')},{theme,platform});
 await page.route('**/*',route=>{const r=route.request();if(!['GET','HEAD','OPTIONS'].includes(r.method())&&new URL(r.url()).origin!==base)throw Error('Fixture mutation left loopback');return route.continue()});
 await page.goto(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page};
}
const trigger=page=>page.getByRole('button',{name:'Memory options',exact:true});
const menu=page=>page.getByRole('menu',{name:'Memory options',exact:true});
async function open(page){await trigger(page).click();await expect(menu(page)).toBeVisible()}
async function memory(page,id){await page.goto(base+'/?qa='+randomUUID()+'#/memory/'+id);await expect(trigger(page)).toBeVisible()}
async function bounds(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page fits viewport');const r=await menu(page).boundingBox(),v=page.viewportSize();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=v.width&&r.y+r.height<=v.height,'menu fits viewport')}
const twice=locator=>locator.evaluate(button=>{button.click();button.click()});

try{
 const admin=await session('owner','light','android');await command(admin.page,{type:'APPROVE_MEMBER',id:'bob',status:'active',roles:[],canPost:true});
 const alice=await session('alice'),page=alice.page,pixels=createTestPng(360,180);
 const upload=await page.request.post(base+'/api/media',{headers:{Origin:base},multipart:{file:{name:'fictional-menu-review.png',mimeType:'image/png',buffer:pixels}}});assert.equal(upload.status(),201);
 const file=await upload.json(),id=randomUUID(),title='Fictional gathering of a generation 💚';
 await command(page,{type:'ADD_MEMORY',memory:{id,image:file.url,mediaType:'image/png',title}});
 const discussion=await(await page.request.get(base+'/api/photo-discussions/memory/'+id)).json(),photoTarget={kind:'memory',id,index:0,photo:discussion.photo.url};
 await command(page,{type:'ADD_COMMENT',targetId:discussion.threadId,photoTarget,text:'Fictional comment for this menu review.'});
 await command(page,{type:'TOGGLE_REACTION',targetId:discussion.threadId,photoTarget,emoji:'💚',photoSelected:true});
 await memory(page,id);await expect(page.getByRole('heading',{name:'Comments',exact:true})).toBeVisible();await expect(page.getByText('Fictional comment for this menu review.',{exact:true})).toBeVisible();
 await expect(page.locator('.photo-viewer-details').getByRole('button',{name:/^(Save|Saved|Add or edit details|Save photo|Remove memory)$/})).toHaveCount(0);
 await expect(page.locator('.photo-viewer-actions .react-trigger')).toBeVisible();await expect(page.locator('.photo-viewer-details .reaction-pill').first()).toBeVisible();
 await page.screenshot({path:output+'/'+engine+'-mobile-closed.png',fullPage:true});
 await open(page);await expect(menu(page).getByRole('menuitem')).toHaveText(['Edit details','Save','Save photo','Remove memory']);await bounds(page);
 const separated=menu(page).getByRole('group',{name:'Remove',exact:true});await expect(separated.getByRole('menuitem',{name:'Remove memory'})).toBeVisible();
 const colors=await menu(page).getByRole('menuitem',{name:'Remove memory'}).evaluate(el=>({remove:getComputedStyle(el).color,normal:getComputedStyle(el.closest('[role=menu]').querySelector('[role=menuitem]')).color,separator:getComputedStyle(el.parentElement).borderTopWidth}));assert.notEqual(colors.remove,colors.normal);assert.notEqual(colors.separator,'0px');
 await page.screenshot({path:output+'/'+engine+'-mobile-open.png',fullPage:true});
 results.push('single title menu; reactions/comments visible; removal separated and styled');

 // Arrow navigation, Escape/focus return, pointer dismissal and repeated toggles.
 await expect(menu(page).getByRole('menuitem',{name:'Edit details'})).toBeFocused();
 await page.keyboard.press('End');await expect(menu(page).getByRole('menuitem',{name:'Remove memory'})).toBeFocused();
 await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Save',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(menu(page)).toBeHidden();await expect(trigger(page)).toBeFocused();
 await trigger(page).press('ArrowUp');await expect(menu(page).getByRole('menuitem',{name:'Remove memory'})).toBeFocused();
 await page.keyboard.press('Tab');await expect(menu(page)).toBeHidden();await expect(page.locator('.photo-viewer-details .reaction-pill').first()).toBeFocused();await trigger(page).focus();await trigger(page).press('ArrowDown');await page.keyboard.press('Shift+Tab');await expect(menu(page)).toBeHidden();assert.equal(await page.evaluate(()=>document.activeElement!==document.body&&!document.activeElement.closest('[popover]')),true,'Shift+Tab leaves the menu with focus on the preceding control');await open(page);
 await page.getByRole('heading',{name:title,exact:true}).click();await expect(menu(page)).toBeHidden();await expect(trigger(page)).toHaveAttribute('aria-expanded','false');
 for(let i=0;i<3;i++){await open(page);await trigger(page).click();await expect(menu(page)).toBeHidden()}
 results.push('keyboard arrows/Home/End, Tab exit, Escape focus return, outside dismissal and repeated open/close');

 // Delay the real fixture command and issue two immediate clicks; one request.
 let favorites=0;
 await page.route('**/api/commands',async route=>{if(route.request().postDataJSON().type==='TOGGLE_FAVORITE'){favorites++;await new Promise(resolve=>setTimeout(resolve,150))}await route.continue()});
 await open(page);await twice(menu(page).getByRole('menuitem',{name:'Save',exact:true}));
 await expect.poll(async()=>(await state(page)).favorites.includes(id)).toBe(true);assert.equal(favorites,1);
 await expect(trigger(page)).toBeEnabled();await open(page);await menu(page).getByRole('menuitem',{name:'Unsave',exact:true}).click();await expect.poll(async()=>(await state(page)).favorites.includes(id)).toBe(false);
 await expect(trigger(page)).toBeEnabled();await page.unroute('**/api/commands');results.push('save/unsave persists; repeated save clicks issue one command');

 let downloads=0;await page.route('**/api/photo-discussions/memory/*/download?*',async route=>{downloads++;await new Promise(resolve=>setTimeout(resolve,150));await route.continue()});
 await open(page);const downloaded=page.waitForEvent('download');await twice(menu(page).getByRole('menuitem',{name:'Save photo',exact:true}));const download=await downloaded;
 assert.equal(downloads,1);assert.equal(download.suggestedFilename(),title+'.png');assert.deepEqual(await readFile(await download.path()),pixels);
 await expect(trigger(page)).toBeEnabled();await page.unroute('**/api/photo-discussions/memory/*/download?*');results.push('photo download uses original bytes/filename; repeated clicks issue one download');

 await open(page);await menu(page).getByRole('menuitem',{name:'Edit details'}).click();await expect(page.getByLabel('Caption')).toHaveValue(title);await expect(menu(page)).toBeHidden();await memory(page,id);results.push('Edit details opens the existing editor');
 await open(page);await menu(page).getByRole('menuitem',{name:'Remove memory'}).click();const confirm=page.getByRole('group',{name:'Remove memory',exact:true});await expect(confirm).toBeFocused();await expect(confirm).toContainText('can restore it for 30 days');await expect(menu(page)).toBeHidden();
 await page.screenshot({path:output+'/'+engine+'-remove-confirmation.png',fullPage:true});await confirm.getByRole('button',{name:'Keep memory'}).click();await expect(confirm).toHaveCount(0);await expect(trigger(page)).toBeFocused();assert.ok((await state(page)).memories.some(m=>m.id===id));
 await open(page);await menu(page).getByRole('menuitem',{name:'Remove memory'}).click();await confirm.press('Escape');await expect(confirm).toHaveCount(0);await expect(trigger(page)).toBeFocused();results.push('Remove asks existing recovery confirmation; Keep and Escape preserve memory and focus');

 const bob=await session('bob','light','android');await memory(bob.page,id);await open(bob.page);await expect(menu(bob.page).getByRole('menuitem')).toHaveText(['Save','Save photo']);await bounds(bob.page);await bob.page.screenshot({path:output+'/'+engine+'-member-menu.png',fullPage:true});
 for(const input of [{type:'DELETE_MEMORY',id},{type:'SAVE_MEMORY',memory:{id,title:'Denied edit'}}]){const response=await bob.page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.equal(response.status(),403)}
 results.push('ordinary member sees only save/download; backend denies forged edit/removal');
 const moderator=admin;await memory(moderator.page,id);await open(moderator.page);await expect(menu(moderator.page).getByRole('menuitem')).toHaveText(['Edit details','Save','Save photo','Remove memory']);results.push('moderator retains edit/removal for another uploader');
 await command(moderator.page,{type:'APPROVE_MEMBER',id:'bob',status:'active',roles:['moderator'],canPost:true});await memory(bob.page,id);assert.equal((await state(bob.page)).capabilities.manageMembers,false);assert.equal((await state(bob.page)).capabilities.moderate,true);await open(bob.page);await expect(menu(bob.page).getByRole('menuitem')).toHaveText(['Edit details','Save','Save photo','Remove memory']);results.push('moderator without admin capabilities retains edit/removal');
 await moderator.page.addInitScript(()=>sessionStorage.setItem('gw-member-view:v1',JSON.stringify({accountId:'owner',enabled:true})));await memory(moderator.page,id);await open(moderator.page);await expect(menu(moderator.page).getByRole('menuitem')).toHaveText(['Save','Save photo']);results.push('view-as-member suppresses leader edit/removal');

 // Narrow title wrapping plus tablet and desktop placement, both themes/platforms.
 for(const width of [320,768,1280]){await page.setViewportSize({width,height:900});await open(page);await bounds(page);await page.screenshot({path:output+'/'+engine+'-width-'+width+'.png',fullPage:true});await page.keyboard.press('Escape')}
 results.push('320/390/768/1280 layouts and menu bounds pass');

 // Server load and download failures remain visible and recoverable.
 await page.route('**/api/photo-discussions/memory/'+id+'?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional photo load failure'})}));
 await page.goto(base+'/?qa='+randomUUID()+'#/memory/'+id);await expect(page.getByRole('alert').filter({hasText:'Fictional photo load failure'})).toBeVisible();
 await expect(trigger(page)).toHaveCount(0);await page.unroute('**/api/photo-discussions/memory/'+id+'?*');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(trigger(page)).toBeVisible();
 await page.route('**/api/photo-discussions/memory/*/download?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional download failure'})}));
 await open(page);await menu(page).getByRole('menuitem',{name:'Save photo'}).click();await expect(page.getByRole('alert').filter({hasText:'Fictional download failure'})).toBeVisible();await expect(trigger(page)).toBeEnabled();await page.unroute('**/api/photo-discussions/memory/*/download?*');results.push('photo-load retry and download errors remain visible');
 await page.route('**/api/commands',route=>{const type=route.request().postDataJSON().type;return ['TOGGLE_FAVORITE','DELETE_MEMORY'].includes(type)?route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Fictional command failure'})}):route.continue()});
 await open(page);await menu(page).getByRole('menuitem',{name:'Save',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'The saved memory could not be updated.'})).toBeVisible();assert.equal((await state(page)).favorites.includes(id),false);await expect(trigger(page)).toBeEnabled();
 await open(page);await menu(page).getByRole('menuitem',{name:'Remove memory'}).click();await confirm.getByRole('button',{name:'Remove memory',exact:true}).click();await expect(confirm.getByRole('alert')).toContainText('The memory could not be removed');assert.ok((await state(page)).memories.some(m=>m.id===id));await confirm.getByRole('button',{name:'Keep memory'}).click();await page.unroute('**/api/commands');results.push('failed save/removal preserves state and offers recovery');

 // Non-image memories have the same title menu, without a photo action.
 const pdfUpload=await page.request.post(base+'/api/media',{headers:{Origin:base},multipart:{file:{name:'fictional-document.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF')}}});assert.equal(pdfUpload.status(),201);const pdfFile=await pdfUpload.json();
 const pdf=randomUUID();await command(page,{type:'ADD_MEMORY',memory:{id:pdf,image:pdfFile.url,mediaType:'application/pdf',title:'Fictional document memory'}});await memory(page,pdf);await open(page);await expect(menu(page).getByRole('menuitem')).toHaveText(['Edit details','Save','Remove memory']);await page.keyboard.press('Escape');
 await expect(page.getByRole('heading',{name:'Comments',exact:true})).toBeVisible();results.push('non-image memory retains edit/save/removal and visible comments');

 // Other photo viewers retain their surfaced download and privacy controls.
 await command(page,{type:'SAVE_MEMBER',member:{id:'alice',name:'Alice',photo:file.url,allowPhotoSave:false}});
 await bob.page.goto(base+'/?qa='+randomUUID()+'#/photo/alice?section=profile');await expect(bob.page.getByText('Photo saving is turned off for this profile.')).toBeVisible();await expect(bob.page.getByRole('button',{name:'Save photo',exact:true})).toHaveCount(0);await expect(trigger(bob.page)).toHaveCount(0);
 await page.goto(base+'/?qa='+randomUUID()+'#/photo/alice?section=profile');await expect(page.getByRole('button',{name:'Save photo',exact:true})).toBeVisible();await expect(trigger(page)).toHaveCount(0);results.push('profile viewer download and privacy remain unchanged');

 // Confirm one real fixture removal, with a duplicate click, then restore it.
 await memory(page,id);let removals=0;await page.route('**/api/commands',async route=>{if(route.request().postDataJSON().type==='DELETE_MEMORY'){removals++;await new Promise(resolve=>setTimeout(resolve,150))}await route.continue()});
 await open(page);await menu(page).getByRole('menuitem',{name:'Remove memory'}).click();await twice(confirm.getByRole('button',{name:'Remove memory',exact:true}));await expect.poll(async()=>(await state(page)).memories.some(m=>m.id===id)).toBe(false);assert.equal(removals,1);await page.unroute('**/api/commands');
 const removed=(await(await page.request.get(base+'/api/content/removed')).json()).removed.find(m=>m.targetId===id);assert.ok(removed);await command(page,{type:'RESTORE_CONTENT',id:removed.id});assert.ok((await state(page)).memories.some(m=>m.id===id));results.push('confirmed removal sends one command and remains restorable');
 assert.deepEqual(errors,[]);
}finally{
 await browser.close();const build=JSON.parse(await readFile(new URL('../dist/build.json',import.meta.url),'utf8'));
 const sources=await Promise.all(['memories.jsx','photo-viewer.jsx','content-history.jsx','memory-details.css'].map(async file=>({file,sha256:createHash('sha256').update(await readFile(new URL('../src/'+file,import.meta.url))).digest('hex')})));
 await writeFile(output+'/'+engine+'-results.json',JSON.stringify({engine,build,sources,results,errors},null,2));
}
console.log(engine+' memory menu: '+results.join('; '));
