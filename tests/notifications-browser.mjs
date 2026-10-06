// Hosted-only synthetic notification checks. API routes are intercepted in memory;
// this file cannot write to a real account, send email/push, or request permission.
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {DEFAULT_NOTIFICATION_CATEGORIES} from '../src/notification-model.js';
if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw new Error('Notification browser QA runs only in the authorized hosted CI environment.');
const base=process.env.GW_NOTIFICATIONS_URL||'http://127.0.0.1:4173';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),'Use the isolated hosted static fixture only.');
const output='docs/notifications-qa',results=[],errors=[],requests=[],contexts=[],broadcasts=[];
await mkdir(output,{recursive:true});
const engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
const oldPost={id:'older-authorized-post',authorId:'bob',text:'An authorized older fixture post outside the feed window.',createdAt:1000,memberIds:[],files:[]};
const comment={id:'older-comment',authorId:'bob',text:'The exact older fixture reply.',createdAt:2000,parentId:null,files:[]};
function account(id){return {id,settings:{accountId:id,scope:'leaders',globalOff:false,selectedIds:[],categories:{...DEFAULT_NOTIFICATION_CATEGORIES},revision:0,pushEnabled:false},notices:Array.from({length:id==='alice'?135:2},(_,i)=>({id:id+'-notice-'+(i+1),sequence:i+1,kind:'reply.created',category:'replies',title:`${id==='alice'?'Fixture':'Other account'} update ${i+1}`,text:'A fictional update for hosted QA.',createdAt:Date.now()-i*1000,readAt:null,target:{kind:'comment',id:comment.id,containerId:oldPost.id,anchorId:comment.id}}))}}
const accounts={alice:account('alice'),bob:account('bob')};let holdOpen=null;
function stateFor(id){return {...initialState(),mode:'live',schema:3,selfId:id,onboarding:'done',profileComplete:true,capabilities:{},
 members:[{id:'alice',name:'QA Alice',circle:'family',registered:true,adult:true,profileColor:'#4f996c'},{id:'bob',name:'QA Bob',circle:'family',registered:true,adult:true,profileColor:'#754c95'}],groups:[],memories:[],memorials:[],relationships:[],posts:[{id:'recent-fixture',authorId:'bob',text:'The current fixture feed.',createdAt:Date.now(),files:[]}],comments:{},reactions:{},notifications:[],readNotices:[],notificationSettings:{...accounts[id].settings},notificationUnreadCount:visible(accounts[id]).filter(n=>!n.readAt).length};}
function visible(account){return account.settings.globalOff?[]:account.notices.filter(n=>!n.dismissedAt&&account.settings.categories[n.category]);}
function json(route,body,status=200){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
async function attachRoutes(context,viewer){
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==base)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const method=request.method(),a=accounts[viewer.id],payload=method==='GET'?{}:request.postDataJSON()||{};requests.push({viewer:viewer.id,path:url.pathname,method,payload});
  if(payload.expectedAccountId&&payload.expectedAccountId!==viewer.id)return json(route,{error:'Your signed-in account changed. Refresh before trying again.'},409);
  if(url.pathname==='/api/config')return json(route,{configured:true,email:false,providers:[],pushEnabled:false});
  if(url.pathname==='/api/session')return json(route,{status:'active',member:{id:viewer.id},user:{id:viewer.id}});
  if(url.pathname==='/api/state')return json(route,stateFor(viewer.id));
  if(url.pathname==='/api/notifications'){
   const all=visible(a).sort((x,y)=>y.sequence-x.sequence),before=Number(url.searchParams.get('before'))||Infinity,limit=Number(url.searchParams.get('limit'))||30,filtered=all.filter(n=>n.sequence<before),items=filtered.slice(0,limit);
   return json(route,{accountId:viewer.id,notifications:items,unreadCount:all.filter(n=>!n.readAt&&n.kind!=='message.created').length,nextCursor:filtered.length>limit?items.at(-1).sequence:null,readAllCutoff:Math.max(0,...all.map(n=>n.sequence)),settings:a.settings});
  }
  if(url.pathname==='/api/me/notifications'){
   if(method==='PUT'){
    if(payload.revision!==a.settings.revision)return json(route,{error:'Notification settings changed on another device.'},409);
    const {expectedAccountId,revision,categories,...rest}=payload;a.settings={...a.settings,...rest,categories:{...a.settings.categories,...categories},revision:revision+1};if(a.settings.scope==='loved')a.settings.scope='loved_ones';
   }return json(route,a.settings);
  }
  if(url.pathname==='/api/notifications/read-all'){for(const notice of visible(a))if(notice.sequence<=payload.cutoff&&notice.kind!=='message.created')notice.readAt||=Date.now();return json(route,{accountId:viewer.id,ok:true});}
  const match=/^\/api\/notifications\/([^/]+)\/(open|read|dismiss)$/.exec(url.pathname);
  if(match){
   const notice=a.notices.find(n=>n.id===decodeURIComponent(match[1]));if(match[2]==='open'){
    if(holdOpen){holdOpen.started();await holdOpen.promise;holdOpen=null;}
    if(url.searchParams.get('expectedAccountId')!==viewer.id)return json(route,{error:'Your signed-in account changed.'},409);
    return json(route,notice&&!notice.dismissedAt?{accountId:viewer.id,available:true,target:notice.target,post:oldPost,comments:[comment],reactions:{},reactionCounts:{},reactionMembers:{}}:{accountId:viewer.id,available:false});
   }
   if(notice){if(match[2]==='read')notice.readAt||=Date.now();else notice.dismissedAt||=Date.now();}return json(route,{accountId:viewer.id,ok:true});
  }
  if(url.pathname==='/api/conversations')return json(route,{conversations:[],invitations:[],unreadCount:0,invitationCount:0});
  if(url.pathname==='/api/conversations/recipients')return json(route,{members:[]});
  if(url.pathname.startsWith('/api/page-content/'))return json(route,{content:{},revision:0,canEdit:false});
  if(url.pathname.endsWith('/typing'))return json(route,{typers:[]});
  return json(route,{error:'Unexpected synthetic fixture API call: '+method+' '+url.pathname},500);
 });
}
async function pageFor(viewer,{width=390,context:existing}={}){
 const context=existing||await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});if(!existing){contexts.push(context);await attachRoutes(context,viewer);}
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
 await page.exposeFunction('__qaBroadcast',payload=>broadcasts.push(payload));
 await page.addInitScript(()=>{
  localStorage.setItem('gw-install-dismissed','true');localStorage.setItem('gw-preview-notice:v1','seen');
  for(const id of ['alice','bob'])localStorage.setItem('gw-help:v1:'+id,JSON.stringify({version:1,topic:'home',status:'skipped'}));
  const Native=globalThis.BroadcastChannel;if(Native)globalThis.BroadcastChannel=class extends Native{postMessage(value){if(this.name==='gw-notifications:v1')window.__qaBroadcast(value);return super.postMessage(value)}};
  const noPermission=()=>{throw new Error('Notification permission must never be requested by activity UI')};if(globalThis.Notification)Notification.requestPermission=noPermission;
 });
 await page.goto(base+'/');await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();return {page,context};
}
const bell=page=>page.locator('header').getByRole('button',{name:/^Notifications(?:,|$)/});
const panel=page=>page.getByRole('region',{name:'Notifications',exact:true});
async function showInbox(page){await page.bringToFront();if(await bell(page).getAttribute('aria-expanded')!=='true')await bell(page).click();await expect(panel(page)).toBeVisible();}
async function refresh(page){await page.bringToFront();const previous=requests.filter(r=>r.path==='/api/notifications').length;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>requests.filter(r=>r.path==='/api/notifications').length).toBeGreaterThan(previous);}
async function check(name,run){await run();results.push({check:name,status:'passed'});console.log('NOTIFICATION PASS:',name);}
async function checkFit(page){const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.notification-panel button,.notification-settings button,.notification-settings input')].filter(e=>e.getClientRects().length&&!e.closest('[inert]')&&(!e.closest('[popover]')||e.closest('[popover]').matches(':popover-open'))).map(e=>({name:e.getAttribute('aria-label')||e.textContent,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(r=>r.left<0||r.right>innerWidth+1)}));assert.ok(bounds.scroll<=bounds.width+1&&!bounds.controls.length,JSON.stringify(bounds));}
let failure;
try{
 const viewer={id:'alice'},first=await pageFor(viewer),alice=first.page;
 await check('authoritative unread badge covers 135 updates while page contains 30',async()=>{
  await expect(bell(alice)).toHaveAccessibleName('Notifications, 135 unread');await showInbox(alice);await expect(panel(alice).locator('[data-notice-id]')).toHaveCount(30);
  await panel(alice).getByRole('button',{name:'Load earlier activity',exact:true}).click();await expect(panel(alice).locator('[data-notice-id]')).toHaveCount(60);await expect(bell(alice)).toHaveAccessibleName('Notifications, 135 unread');
 });
 await check('typed old post opens with exact comment focus without erasing compose draft',async()=>{
  await bell(alice).click();await alice.getByRole('button',{name:'Post an update',exact:true}).click();await alice.getByRole('textbox',{name:"What's on your mind",exact:true}).fill('Keep this unsent fixture draft');await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 135, unread',exact:true}).click();await expect(alice).toHaveURL(/#\/post\/older-authorized-post\?section=comment%3Aolder-comment$/);await expect(alice.locator('[data-comment-id="older-comment"]')).toBeFocused();
  await alice.getByRole('button',{name:'Green and White family home',exact:true}).click();await alice.getByRole('button',{name:'Post an update',exact:true}).click();await expect(alice.getByRole('textbox',{name:"What's on your mind",exact:true})).toHaveValue('Keep this unsent fixture draft');await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('a delayed notification open cannot override a newer navigation intent',async()=>{
  let release,started;const startedPromise=new Promise(r=>started=r);holdOpen={promise:new Promise(r=>release=r),started};await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 134, unread',exact:true}).click();await startedPromise;
  // Popover is nonmodal. A newer navigation intent is deferred by the existing
  // mutation guard, then wins when the original open settles.
  await alice.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'You',exact:true}).click();release();await expect(alice).toHaveURL(/#\/you$/);await expect.poll(()=>holdOpen).toBe(null);await expect(alice).toHaveURL(/#\/you$/);
 });
 await check('separate devices refresh read/dismiss and broadcast contains no private data',async()=>{
  const other=await pageFor({id:'alice'},{width:768}),device=other.page;await showInbox(device);const before=visible(accounts.alice).filter(n=>!n.readAt).length;
  await device.locator('[data-notice-id="alice-notice-133"]').getByRole('button',{name:'Mark Fixture update 133 read',exact:true}).click();await expect(bell(device)).toHaveAccessibleName(`Notifications, ${before-1} unread`);
  await refresh(alice);await expect(bell(alice)).toHaveAccessibleName(`Notifications, ${before-1} unread`);await showInbox(alice);
  await alice.locator('[data-notice-id="alice-notice-132"]').getByRole('button',{name:'Dismiss Fixture update 132',exact:true}).click();await expect(alice.locator('[data-notice-id="alice-notice-132"]')).toHaveCount(0);
  await refresh(device);await expect(device.locator('[data-notice-id="alice-notice-132"]')).toHaveCount(0);
  assert.ok(broadcasts.length);for(const payload of broadcasts)assert.deepEqual(payload,{type:'invalidate',version:1});
 });
 await check('settings preserve Following through global Off and normalize Loved Ones',async()=>{
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();const settings=alice.getByRole('region',{name:'Notification choices',exact:true});
  await chooseRadio(settings.getByRole('radio',{name:'Loved Ones',exact:true}));await expect(settings.getByRole('radio',{name:'Loved Ones',exact:true})).toBeChecked();
  await chooseRadio(settings.getByRole('radio',{name:'Off',exact:true}));await expect(settings.getByRole('checkbox',{name:'Replies',exact:true})).toBeDisabled();await expect(bell(alice)).toHaveAccessibleName('Notifications');
  await chooseRadio(settings.getByRole('radio',{name:'On',exact:true}));await expect(settings.getByRole('radio',{name:'Loved Ones',exact:true})).toBeChecked();
  await settings.getByRole('checkbox',{name:'Replies',exact:true}).uncheck();await expect(bell(alice)).toHaveAccessibleName('Notifications');await settings.getByRole('checkbox',{name:'Replies',exact:true}).check();
  await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('read-all uses a server cutoff and leaves a later arrival unread',async()=>{
  await showInbox(alice);const cutoff=Math.max(...accounts.alice.notices.map(n=>n.sequence));accounts.alice.notices.push({id:'alice-new-after-cutoff',sequence:cutoff+1,kind:'reply.created',category:'replies',title:'A later fixture arrival',createdAt:Date.now(),target:{kind:'post',id:oldPost.id}});
  await panel(alice).getByRole('button',{name:'Mark all read',exact:true}).click();await expect(bell(alice)).toHaveAccessibleName('Notifications, 1 unread');assert.equal(accounts.alice.notices.at(-1).readAt,undefined);
 });
 await check('account switch rejects stale settings writes and clears old-account inbox',async()=>{
  await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();const previous=structuredClone(accounts.bob.settings);viewer.id='bob';await alice.getByRole('region',{name:'Notification choices'}).getByRole('checkbox',{name:'Reactions',exact:true}).uncheck();
  await expect(bell(alice)).toHaveAccessibleName('Notifications, 2 unread');assert.deepEqual(accounts.bob.settings,previous);await alice.getByRole('button',{name:'Close dialog',exact:true}).click();await showInbox(alice);await expect(panel(alice).locator('[data-notice-id^="alice-"]')).toHaveCount(0);await expect(panel(alice).locator('[data-notice-id^="bob-"]')).toHaveCount(2);
 });
 await check('notification controls fit 320/390/768/1280 across approved materials and palettes',async()=>{
  for(const variant of [{width:320,theme:'light',material:'android'},{width:390,theme:'dark',material:'ios'},{width:768,theme:'light',material:'ios'},{width:1280,theme:'dark',material:'android'}]){
   await alice.setViewportSize({width:variant.width,height:900});await alice.evaluate(({theme,material})=>{localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',material)},variant);await alice.reload();await showInbox(alice);await checkFit(alice);await alice.screenshot({path:`${output}/${engine}-${variant.width}-${variant.theme}-${variant.material}-inbox.png`,fullPage:true});
   await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();await checkFit(alice);await alice.screenshot({path:`${output}/${engine}-${variant.width}-${variant.theme}-${variant.material}-settings.png`,fullPage:true});await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
 });
 await check('preview controls are isolated and resettable with no notification network writes',async()=>{
  const preview=initialState();preview.onboarding='done';const p=await pageFor({id:'alice'});await p.page.evaluate(({key,state})=>{localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));sessionStorage.setItem('gw-active-mode','preview')},{key:PREVIEW_KEY,state:preview});await p.page.reload();const before=requests.filter(r=>r.method!=='GET').length;
  await showInbox(p.page);await panel(p.page).getByRole('button',{name:'Mark A sample reply is waiting read',exact:true}).click();await panel(p.page).getByRole('button',{name:'Dismiss A sample memory includes you',exact:true}).click();await panel(p.page).getByRole('button',{name:'Reset sample activity',exact:true}).click();await expect(bell(p.page)).toHaveAccessibleName('Notifications, 3 unread');assert.equal(requests.filter(r=>r.method!=='GET').length,before);
 });
 assert.deepEqual(errors,[],'No browser runtime errors');
}catch(error){failure=error;results.push({check:'browser suite',status:'failed',error:error.stack||error.message});}
finally{await writeFile(output+'/'+engine+'-results.json',JSON.stringify({engine,synthetic:true,externalWrites:false,results,errors,broadcasts},null,2));for(const context of contexts)await context.close();await browser.close();}
if(failure)throw failure;

async function chooseRadio(radio){await expect(radio).toBeEnabled();await radio.locator('..').click();await expect(radio).toBeChecked();}
