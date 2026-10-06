// Hosted-only synthetic notification checks. API routes are intercepted in memory;
// this file cannot write to a real account, send email/push, or request permission.
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {DEFAULT_NOTIFICATION_CATEGORIES} from '../src/notification-model.js';
import {sharedPageDefaults} from '../src/shared-content-schema.js';
if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw new Error('Notification browser QA runs only in the authorized hosted CI environment.');
const base=process.env.GW_NOTIFICATIONS_URL||'http://127.0.0.1:4173';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),'Use the isolated hosted static fixture only.');
const output='docs/notifications-qa',results=[],errors=[],requests=[],contexts=[],broadcasts=[],events=[];
let currentCheck='fixture boot',browser;
await mkdir(output,{recursive:true});
const engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium';
const oldPost={id:'older-authorized-post',authorId:'bob',text:'An authorized older fixture post outside the feed window.',createdAt:1000,memberIds:[],files:[]};
const comment={id:'older-comment',authorId:'bob',text:'The exact older fixture reply.',createdAt:2000,parentId:null,files:[]};
let linkedComments=[comment];
function account(id){return {id,settings:{accountId:id,scope:'leaders',globalOff:false,selectedIds:[],categories:{...DEFAULT_NOTIFICATION_CATEGORIES},revision:0,pushEnabled:false},notices:Array.from({length:id==='alice'?135:2},(_,i)=>({id:id+'-notice-'+(i+1),sequence:i+1,kind:'reply.created',category:'replies',title:`${id==='alice'?'Fixture':'Other account'} update ${i+1}`,text:'A fictional update for hosted QA.',createdAt:Date.now()-i*1000,readAt:null,target:{kind:'comment',id:comment.id,containerId:oldPost.id,anchorId:comment.id}}))}}
const accounts={alice:account('alice'),bob:account('bob')};let holdOpen=null,holdSettings=null;
function stateFor(id){return {...initialState(),mode:'live',schema:3,selfId:id,onboarding:'done',profileComplete:true,capabilities:{},
 members:[{id:'alice',name:'QA Alice',circle:'family',registered:true,adult:true,profileColor:'#4f996c'},{id:'bob',name:'QA Bob',circle:'family',registered:true,adult:true,profileColor:'#754c95'}],groups:[],memories:[],memorials:[],relationships:[],posts:[{id:'recent-fixture',authorId:'bob',text:'The current fixture feed.',createdAt:Date.now(),files:[]}],comments:{},reactions:{},notifications:[],readNotices:[],notificationSettings:{...accounts[id].settings},notificationUnreadCount:visible(accounts[id]).filter(n=>!n.readAt).length};}
function visible(account){return account.settings.globalOff?[]:account.notices.filter(n=>!n.dismissedAt&&account.settings.categories[n.category]);}
function json(route,body,status=200){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
function sharedPageRecord(pathname){
 const page=decodeURIComponent(pathname.slice('/api/page-content/'.length));
 return {page,content:sharedPageDefaults(page),revision:0,canEdit:false,updatedAt:null};
}
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
    if(holdSettings){const pending=holdSettings;holdSettings=null;pending.started();await pending.promise;}
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
    return json(route,notice&&!notice.dismissedAt?{accountId:viewer.id,available:true,target:notice.target,post:oldPost,comments:linkedComments,reactions:{},reactionCounts:{},reactionMembers:{}}:{accountId:viewer.id,available:false});
   }
   if(notice){if(match[2]==='read')notice.readAt||=Date.now();else notice.dismissedAt||=Date.now();}return json(route,{accountId:viewer.id,ok:true});
  }
  if(url.pathname==='/api/conversations')return json(route,{conversations:[],invitations:[],unreadCount:0,invitationCount:0});
  if(url.pathname==='/api/conversations/recipients')return json(route,{members:[]});
  if(method==='GET'&&/^\/api\/page-content\/[^/]+$/.test(url.pathname))return json(route,sharedPageRecord(url.pathname));
  if(url.pathname.endsWith('/typing'))return json(route,{typers:[]});
  return json(route,{error:'Unexpected synthetic fixture API call: '+method+' '+url.pathname},500);
 });
}
async function pageFor(viewer,{width=390,context:existing}={}){
 const context=existing||await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});if(!existing){contexts.push(context);await attachRoutes(context,viewer);}
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const record=(type,detail)=>{events.push({check:currentCheck,type,...detail});if(events.length>120)events.shift()};
 const requestDetails=request=>{const url=new URL(request.url());return {path:url.origin+url.pathname,method:request.method(),resource:request.resourceType()}};
 page.on('pageerror',error=>{if(errors.length<50)errors.push(error.message.slice(0,2000));record('pageerror',{error:String(error.stack||error.message).slice(0,3000)})});
 page.on('requestfailed',request=>record('requestfailed',{...requestDetails(request),error:request.failure()?.errorText}));
 page.on('response',response=>{if(response.status()>=400)record('http-error',{...requestDetails(response.request()),status:response.status()})});
 page.on('console',message=>{if(message.type()==='error')record('console-error',{text:message.text().slice(0,1500)})});
 await page.exposeFunction('__qaBroadcast',payload=>broadcasts.push(payload));
 await page.addInitScript(()=>{
  localStorage.setItem('gw-install-dismissed','true');localStorage.setItem('gw-preview-notice:v1','seen');
  for(const id of ['alice','bob'])localStorage.setItem('gw-help:v1:'+id,JSON.stringify({version:1,topic:'home',status:'skipped'}));
  const Native=globalThis.BroadcastChannel;if(Native)globalThis.BroadcastChannel=class extends Native{postMessage(value){if(this.name==='gw-notifications:v1')window.__qaBroadcast(value);return super.postMessage(value)}};
  const noPermission=()=>{throw new Error('Notification permission must never be requested by activity UI')};if(globalThis.Notification)Notification.requestPermission=noPermission;
 });
 await page.addInitScript(installNotificationViewportTrace);
 await page.goto(base+'/');await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();return {page,context};
}
const bell=page=>page.locator('header').getByRole('button',{name:/^Notifications(?:,|$)/});
// A native settings dialog intentionally hides the header from the accessibility
// tree. Its rendered badge still updates; recheck accessibility after closing.
const backgroundBell=page=>page.locator('header button.notification-entry');
const panel=page=>page.getByRole('region',{name:'Notifications',exact:true});
async function showInbox(page){await page.bringToFront();if(await bell(page).getAttribute('aria-expanded')!=='true')await bell(page).click();await expect(panel(page)).toBeVisible();}
async function refresh(page){await page.bringToFront();const previous=requests.filter(r=>r.path==='/api/notifications').length;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>requests.filter(r=>r.path==='/api/notifications').length).toBeGreaterThan(previous);}
async function check(name,run){currentCheck=name;await run();results.push({check:name,status:'passed'});console.log('NOTIFICATION PASS:',name);}
async function checkFit(page){const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.notification-panel button,.notification-settings button,.notification-settings input')].filter(e=>e.getClientRects().length&&!e.closest('[inert]')&&(!e.closest('[popover]')||e.closest('[popover]').matches(':popover-open'))).map(e=>({name:e.getAttribute('aria-label')||e.textContent,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(r=>r.left<0||r.right>innerWidth+1)}));assert.ok(bounds.scroll<=bounds.width+1&&!bounds.controls.length,JSON.stringify(bounds));}
function notificationBellGeometry(){
 const button=document.querySelector('header button.notification-entry'),popover=document.querySelector('.notification-panel')?.closest('[popover]'),saving=document.querySelector('.saving-status');
 const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
 const bell=rect(button),panel=rect(popover),badge=rect(saving),open=!!popover?.matches(':popover-open');
 const hit=bell&&document.elementFromPoint(bell.left+bell.width/2,bell.top+bell.height/2);
 return {clear:!!(bell&&panel&&open&&(panel.top>=bell.bottom+7||panel.bottom<=bell.top-7)),
  hit:!!(button&&hit&&(hit===button||button.contains(hit))),popoverHit:!!(popover&&hit&&(hit===popover||popover.contains(hit))),disabled:button?.disabled??null,
  diagnostic:{bell,panel,open,pointerEvents:button?getComputedStyle(button).pointerEvents:null,
   hit:hit?{tag:hit.tagName,id:hit.id,className:hit.getAttribute('class'),label:hit.getAttribute('aria-label')}:null,
   saving:badge?{rect:badge,overlapsBell:!!(bell&&badge.left<bell.right&&badge.right>bell.left&&badge.top<bell.bottom&&badge.bottom>bell.top)}:null}};
}
async function checkBellClear(page,{pending=false}={}){
 // The global mutation guard disables icon-button controls during a held open.
 // Keep their geometry clear, but require pointer hits only when enabled. The
 // actual pending hit target (including any saving badge) remains diagnostic.
 await expect.poll(()=>page.evaluate(notificationBellGeometry)).toMatchObject(pending?
  {clear:true,popoverHit:false,disabled:true}:{clear:true,popoverHit:false,disabled:false,hit:true});
}
async function checkNavigationClear(page){
 await expect.poll(()=>page.evaluate(()=>{
  const navigation=document.querySelector('[aria-label="Main navigation"]'),popover=document.querySelector('.notification-panel')?.closest('[popover]');
  if(!navigation||!popover?.matches(':popover-open'))return {clear:false,hit:false,buttonsClear:false};
  const nav=navigation.getBoundingClientRect(),panel=popover.getBoundingClientRect(),hit=document.elementFromPoint(nav.left+nav.width/2,nav.top+nav.height/2);
  const buttons=[...navigation.querySelectorAll('button')];
  return {clear:panel.bottom<=nav.top-7,hit:hit===navigation||navigation.contains(hit),buttonsClear:buttons.length>0&&buttons.every(button=>{
   const rect=button.getBoundingClientRect(),target=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return target===button||button.contains(target);
  })};
 })).toEqual({clear:true,hit:true,buttonsClear:true});
}
function notificationCaptureState(){
 const popover=document.querySelector('.notification-panel')?.closest('[popover]'),viewport=window.visualViewport;
 return {url:location.href,width:innerWidth,height:innerHeight,scrollX,scrollY,
  visualViewport:viewport?{width:viewport.width,height:viewport.height,left:viewport.offsetLeft,top:viewport.offsetTop}:null,
  expanded:document.querySelector('header button.notification-entry')?.getAttribute('aria-expanded')??null,
  inboxOpen:!!popover?.matches(':popover-open'),settingsOpen:!!document.querySelector('dialog[open] .notification-settings')};
}
function installNotificationViewportTrace(){
 const entries=window.__qaNotificationViewportEvents=[];
 const record=event=>{
  if((event.type==='toggle'||event.type==='beforetoggle')&&!event.target?.classList?.contains('notification-popover'))return;
  if(event.type==='scroll'&&event.target?.closest?.('.notification-panel'))return;
  const button=document.querySelector('header button.notification-entry'),rect=button?.getBoundingClientRect(),viewport=window.visualViewport;
  entries.push({type:event.type,source:event.currentTarget===viewport?'visualViewport':'document',newState:event.newState,
   width:innerWidth,height:innerHeight,scrollX,scrollY,visualViewport:viewport?{width:viewport.width,height:viewport.height,left:viewport.offsetLeft,top:viewport.offsetTop}:null,
   bell:rect?{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}:null,
   expanded:button?.getAttribute('aria-expanded'),open:!!document.querySelector('.notification-popover:popover-open')});
  if(entries.length>40)entries.shift();
 };
 for(const type of ['resize','scroll']){window.addEventListener(type,record,true);window.visualViewport?.addEventListener(type,record);}
 for(const type of ['beforetoggle','toggle'])document.addEventListener(type,record,true);
}
async function captureNotificationViewport(page,path,{settings=false}={}){
 const surface=settings?page.getByRole('region',{name:'Notification choices',exact:true}):panel(page);
 await expect(surface).toBeVisible();
 if(!settings)await expect(bell(page)).toHaveAttribute('aria-expanded','true');
 const before=await page.evaluate(notificationCaptureState);
 events.push({check:currentCheck,type:'viewport-capture-before',path,state:before});if(events.length>120)events.shift();
 // These are fixed top-layer controls. A document-sized fullPage capture asks
 // Chromium to captureBeyondViewport and does not represent this device view.
 await page.screenshot({path,fullPage:false});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const after=await page.evaluate(notificationCaptureState);
 events.push({check:currentCheck,type:'viewport-capture-after',path,state:after});if(events.length>120)events.shift();
 assert.deepEqual(after,before,'Capturing notification evidence must not change the viewport, scroll or open surface: '+path);
 await expect(surface).toBeVisible();
 if(!settings)await expect(bell(page)).toHaveAttribute('aria-expanded','true');
}
let failure;
try{
 browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
 const viewer={id:'alice'},first=await pageFor(viewer),alice=first.page;
 await check('authoritative unread badge covers 135 updates while page contains 30',async()=>{
  await expect(bell(alice)).toHaveAccessibleName('Notifications, 135 unread');await showInbox(alice);await expect(panel(alice).locator('[data-notice-id]')).toHaveCount(30);
  await panel(alice).getByRole('button',{name:'Load earlier activity',exact:true}).click();await expect(panel(alice).locator('[data-notice-id]')).toHaveCount(60);await expect(bell(alice)).toHaveAccessibleName('Notifications, 135 unread');
 });
 await check('a tall notification panel leaves the bell and Main navigation clear for normal clicks',async()=>{
  await checkBellClear(alice);await checkNavigationClear(alice);await bell(alice).click();await expect(panel(alice)).toBeHidden();await expect(bell(alice)).toHaveAttribute('aria-expanded','false');
  await bell(alice).click();await expect(panel(alice)).toBeVisible();await expect(bell(alice)).toHaveAttribute('aria-expanded','true');await checkBellClear(alice);await checkNavigationClear(alice);
 });
 await check('typed old post opens with exact comment focus without erasing compose draft',async()=>{
  await bell(alice).click();await alice.getByRole('button',{name:'Post an update',exact:true}).click();await alice.getByRole('textbox',{name:"What's on your mind",exact:true}).fill('Keep this unsent fixture draft');await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 135, unread',exact:true}).click();await expect(alice).toHaveURL(/#\/post\/older-authorized-post\?section=comment%3Aolder-comment$/);await expect(alice.locator('[data-comment-id="older-comment"]')).toBeFocused();
  await alice.getByRole('button',{name:'Green and White family home',exact:true}).click();await alice.getByRole('button',{name:'Post an update',exact:true}).click();await expect(alice.getByRole('textbox',{name:"What's on your mind",exact:true})).toHaveValue('Keep this unsent fixture draft');await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('background deep-link refresh preserves active comment and reply drafts; explicit revisits still focus',async()=>{
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 135',exact:true}).click();
  await expect(alice.getByRole('navigation',{name:'Main navigation',exact:true})).toHaveCount(0);
  const anchor=alice.locator('[data-comment-id="older-comment"]'),draft=alice.getByRole('textbox',{name:'Write a comment…',exact:true});
  await expect(anchor).toBeFocused();await draft.fill('Keep this unsent comment draft');
  await alice.evaluate(()=>{
   const original=Element.prototype.scrollIntoView;window.__qaCommentAnchorScrolls=0;
   Element.prototype.scrollIntoView=function(...args){if(this.hasAttribute('data-comment-id'))window.__qaCommentAnchorScrolls++;return original.apply(this,args)};
  });
  const selectDraft=async field=>{await field.focus();await field.evaluate(el=>el.setSelectionRange(5,12));};
  const assertDraft=async(field,value)=>{await expect(field).toBeFocused();await expect(field).toHaveValue(value);assert.deepEqual(await field.evaluate(el=>[el.selectionStart,el.selectionEnd]),[5,12]);assert.equal(await alice.evaluate(()=>window.__qaCommentAnchorScrolls),0);};
  const refreshComments=async(comments)=>{
   linkedComments=comments;
   // This invokes the same full-state refresh used by the 15-second poll. The
   // older linked post is reauthorized and hydrated into a fresh comments array.
   await refresh(alice);await expect(anchor).toContainText(comments[0].text);
   await alice.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  await selectDraft(draft);const beforeScroll=await alice.evaluate(()=>window.scrollY);
  await refreshComments([{...comment,text:'The first fresh fixture reply.'}]);await assertDraft(draft,'Keep this unsent comment draft');
  assert.ok(Math.abs(await alice.evaluate(()=>window.scrollY)-beforeScroll)<=1,'Background refresh must not scroll back to the anchor');
  const nextComment={...comment,id:'next-comment',text:'A new reply arrived while writing.',createdAt:3000};
  await refreshComments([{...comment,text:'The next refreshed fixture reply.'},nextComment]);await assertDraft(draft,'Keep this unsent comment draft');
  await anchor.getByRole('button',{name:'Reply',exact:true}).click();const reply=alice.getByRole('textbox',{name:'Write a reply…',exact:true});await reply.fill('Keep this unsent reply draft');await selectDraft(reply);
  await refreshComments([{...comment,text:'The reply refreshed fixture text.'},nextComment]);await assertDraft(reply,'Keep this unsent reply draft');
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();
  await refreshComments([{...comment,text:'The sheet refreshed fixture text.'},nextComment]);await expect(alice.getByRole('region',{name:'Notification choices',exact:true})).toBeVisible();
  assert.equal(await alice.evaluate(()=>window.__qaCommentAnchorScrolls),0);
  await alice.getByRole('button',{name:'Close dialog',exact:true}).click();await selectDraft(reply);
  await refreshComments([{...comment,text:'The final refreshed fixture text.'},nextComment]);await assertDraft(reply,'Keep this unsent reply draft');
  // Opening the identical route is a new explicit request, even though the
  // navigation hook does not push a duplicate history entry.
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 135',exact:true}).click();await expect(anchor).toBeFocused();
  assert.equal(await alice.evaluate(()=>window.__qaCommentAnchorScrolls),1);await expect(draft).toHaveValue('Keep this unsent comment draft');await expect(reply).toHaveValue('Keep this unsent reply draft');
  const notice=accounts.alice.notices.find(item=>item.id==='alice-notice-135'),previousTarget=notice.target;
  try{
   notice.target={kind:'comment',id:nextComment.id,containerId:oldPost.id,anchorId:nextComment.id};
   await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 135',exact:true}).click();
   await expect(alice.locator('[data-comment-id="next-comment"]')).toBeFocused();assert.equal(await alice.evaluate(()=>window.__qaCommentAnchorScrolls),2);
  }finally{notice.target=previousTarget;linkedComments=[comment];}
  await alice.getByRole('button',{name:'Green and White family home',exact:true}).click();
 });
 await check('a delayed notification open cannot override a newer navigation intent',async()=>{
  let release,started;const startedPromise=new Promise(r=>started=r);holdOpen={promise:new Promise(r=>release=r),started};await showInbox(alice);await panel(alice).getByRole('button',{name:'Open Fixture update 134, unread',exact:true}).click();await startedPromise;
  // Popover is nonmodal. A newer navigation intent is deferred by the existing
  // mutation guard, then wins when the original open settles.
  try{
   await expect(panel(alice)).toBeVisible();await expect(alice.locator('.saving-status')).toBeVisible();await checkBellClear(alice,{pending:true});await checkNavigationClear(alice);
   const you=alice.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'You',exact:true});await expect(you).toBeEnabled();await you.click();await expect(alice).toHaveURL(/#\/home$/);
  }finally{release();}
  await expect(alice).toHaveURL(/#\/you$/);await expect.poll(()=>holdOpen).toBe(null);await expect(alice).toHaveURL(/#\/you$/);await expect(bell(alice)).toBeEnabled();
  await showInbox(alice);await checkBellClear(alice);await checkNavigationClear(alice);await bell(alice).click();await expect(panel(alice)).toBeHidden();
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
  const before=visible(accounts.alice).filter(notice=>!notice.readAt).length;
  await showInbox(alice);await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();const settings=alice.getByRole('region',{name:'Notification choices',exact:true});
  const loved=settings.getByRole('radio',{name:'Loved Ones',exact:true}),replies=settings.getByRole('checkbox',{name:'Replies',exact:true}),saving=settings.getByRole('status',{name:'Saving notification choices',exact:true});
  await chooseRadio(loved);assert.equal(accounts.alice.settings.scope,'loved_ones');
  await chooseRadio(settings.getByRole('radio',{name:'Off',exact:true}));await expect(replies).toBeDisabled();await expect(backgroundBell(alice)).toHaveAttribute('aria-label','Notifications');
  assert.equal(accounts.alice.settings.globalOff,true);assert.equal(accounts.alice.settings.scope,'loved_ones');
  await chooseRadio(settings.getByRole('radio',{name:'On',exact:true}));await expect(loved).toBeChecked();await expect(replies).toBeEnabled();
  assert.equal(accounts.alice.settings.globalOff,false);assert.equal(accounts.alice.settings.scope,'loved_ones');
  // These are controlled, server-authoritative checkboxes. The native click is
  // accepted immediately, but its checked value is committed only after saving
  // and refreshing. check()/uncheck() demand a synchronous state change, which
  // is incorrect here and especially for the rejected stale-account write below.
  const previous=structuredClone(accounts.alice.settings),writesBefore=settingsWrites().length;
  let release,started=false;holdSettings={promise:new Promise(r=>release=r),started:()=>{started=true}};
  try{
   await expect(replies).toBeChecked();await replies.click();await expect.poll(()=>started).toBe(true);
   await expect(saving).toBeVisible();await expect(replies).toBeDisabled();await expect(replies).toBeChecked();await expect(loved).toBeDisabled();
   assert.deepEqual(accounts.alice.settings,previous,'A pending save must not be presented as committed');
  }finally{release();}
  await expect(replies).not.toBeChecked();await expect(replies).toBeEnabled();await expect(saving).toBeHidden();await expect(backgroundBell(alice)).toHaveAttribute('aria-label','Notifications');
  assert.deepEqual(settingsWrites().slice(writesBefore).map(write=>write.payload),[{expectedAccountId:'alice',revision:previous.revision,categories:{replies:false}}]);
  assert.deepEqual(accounts.alice.settings,{...previous,revision:previous.revision+1,categories:{...previous.categories,replies:false}});
  await replies.click();await expect(replies).toBeChecked();await expect(replies).toBeEnabled();await expect(saving).toBeHidden();
  assert.deepEqual(settingsWrites().slice(writesBefore).map(write=>write.payload),[
   {expectedAccountId:'alice',revision:previous.revision,categories:{replies:false}},
   {expectedAccountId:'alice',revision:previous.revision+1,categories:{replies:true}},
  ]);
  assert.deepEqual(accounts.alice.settings,{...previous,revision:previous.revision+2});
  await alice.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(bell(alice)).toHaveAccessibleName(`Notifications, ${before} unread`);
 });
 await check('read-all uses a server cutoff and leaves a later arrival unread',async()=>{
  await showInbox(alice);const cutoff=Math.max(...accounts.alice.notices.map(n=>n.sequence));accounts.alice.notices.push({id:'alice-new-after-cutoff',sequence:cutoff+1,kind:'reply.created',category:'replies',title:'A later fixture arrival',createdAt:Date.now(),target:{kind:'post',id:oldPost.id}});
  await panel(alice).getByRole('button',{name:'Mark all read',exact:true}).click();await expect(bell(alice)).toHaveAccessibleName('Notifications, 1 unread');assert.equal(accounts.alice.notices.at(-1).readAt,undefined);
 });
 await check('account switch rejects stale settings writes and clears old-account inbox',async()=>{
  await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();const previous=structuredClone(accounts.bob.settings),oldSettings=structuredClone(accounts.alice.settings),writesBefore=settingsWrites().length;
  const reactions=alice.getByRole('region',{name:'Notification choices'}).getByRole('checkbox',{name:'Reactions',exact:true});await expect(reactions).toBeChecked();await expect(reactions).toBeEnabled();viewer.id='bob';await reactions.click();
  await expect(backgroundBell(alice)).toHaveAttribute('aria-label','Notifications, 2 unread');await expect(reactions).toBeEnabled();await expect(reactions).toBeChecked();
  assert.deepEqual(settingsWrites().slice(writesBefore).map(write=>({viewer:write.viewer,payload:write.payload})),[{viewer:'bob',payload:{expectedAccountId:'alice',revision:oldSettings.revision,categories:{reactions:false}}}]);
  assert.deepEqual(accounts.alice.settings,oldSettings);assert.deepEqual(accounts.bob.settings,previous);await alice.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(bell(alice)).toHaveAccessibleName('Notifications, 2 unread');await showInbox(alice);await expect(panel(alice).locator('[data-notice-id^="alice-"]')).toHaveCount(0);await expect(panel(alice).locator('[data-notice-id^="bob-"]')).toHaveCount(2);
 });
 await check('notification controls fit 320/390/768/1280 across approved materials and palettes',async()=>{
  for(const variant of [{width:320,theme:'light',material:'android'},{width:390,theme:'dark',material:'ios'},{width:768,theme:'light',material:'ios'},{width:1280,theme:'dark',material:'android'}]){
   await alice.setViewportSize({width:variant.width,height:900});await alice.evaluate(({theme,material})=>{localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',material)},variant);await alice.reload();await showInbox(alice);await checkFit(alice);await checkBellClear(alice);await checkNavigationClear(alice);await captureNotificationViewport(alice,`${output}/${engine}-${variant.width}-${variant.theme}-${variant.material}-inbox.png`);
   await panel(alice).getByRole('button',{name:'Notification settings',exact:true}).click();await checkFit(alice);await captureNotificationViewport(alice,`${output}/${engine}-${variant.width}-${variant.theme}-${variant.material}-settings.png`,{settings:true});await alice.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
 });
 await check('preview controls are isolated and resettable with no notification network writes',async()=>{
  const preview=initialState();preview.onboarding='done';const p=await pageFor({id:'alice'});await p.page.evaluate(({key,state})=>{localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));sessionStorage.setItem('gw-active-mode','preview')},{key:PREVIEW_KEY,state:preview});await p.page.reload();const before=requests.filter(r=>r.method!=='GET').length;
  await showInbox(p.page);await panel(p.page).getByRole('button',{name:'Mark A sample reply is waiting read',exact:true}).click();await panel(p.page).getByRole('button',{name:'Dismiss A sample memory includes you',exact:true}).click();await panel(p.page).getByRole('button',{name:'Reset sample activity',exact:true}).click();await expect(bell(p.page)).toHaveAccessibleName('Notifications, 3 unread');assert.equal(requests.filter(r=>r.method!=='GET').length,before);
 });
 assert.deepEqual(errors,[],'No browser runtime errors');
}catch(error){
 failure=error;results.push({check:currentCheck,status:'failed',error:error.stack||error.message});
 console.error('::error title=GW notification browser '+annotation(engine+' '+currentCheck,true)+'::'+annotation(String(error.stack||error.message)));
 const diagnostics=await captureFailure();
 console.error('NOTIFICATION FAILURE DIAGNOSTICS:',JSON.stringify({check:currentCheck,errors,events:events.slice(-20),pages:diagnostics}));
 await writeFile(output+'/'+engine+'-failure.json',JSON.stringify({engine,check:currentCheck,errors,events,requests:requests.slice(-100).map(({viewer,path,method})=>({viewer,path,method})),pages:diagnostics},null,2));
}
finally{await writeFile(output+'/'+engine+'-results.json',JSON.stringify({engine,synthetic:true,externalWrites:false,results,errors,broadcasts},null,2));for(const context of contexts)await context.close();await browser?.close();}
if(failure)throw failure;

function settingsWrites(){return requests.filter(request=>request.path==='/api/me/notifications'&&request.method==='PUT');}
async function chooseRadio(radio){await expect(radio).toBeEnabled();await radio.locator('..').click();await expect(radio).toBeChecked();await expect(radio).toBeEnabled();}
function annotation(value,property=false){const escaped=String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');return property?escaped.replaceAll(':','%3A').replaceAll(',','%2C'):escaped;}
async function bounded(operation,ms=4000){let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Diagnostic exceeded '+ms+'ms')),ms)})])}finally{clearTimeout(timer)}}
async function captureFailure(){
 // A failed diagnostic must not replace the original assertion or stall CI.
 const pages=contexts.flatMap(context=>context.pages()).filter(page=>!page.isClosed()).slice(-4);
 return Promise.all(pages.map(async(page,index)=>{
  const result={url:page.url()};
  try{result.dom=await bounded(page.evaluate(()=>({title:document.title,app:document.querySelector('.app')?.className,body:document.body?.innerText.slice(0,3500),
   bells:[...document.querySelectorAll('header .notification-entry')].map(el=>({label:el.getAttribute('aria-label'),hidden:el.getAttribute('aria-hidden'),inert:!!el.closest('[inert]'),display:getComputedStyle(el).display})),
   dialogs:[...document.querySelectorAll('dialog')].map(el=>({open:el.open,title:el.querySelector('h2')?.textContent,text:el.innerText.slice(0,1000)})),alerts:[...document.querySelectorAll('[role="alert"]')].map(el=>el.textContent.slice(0,500))})));}catch(error){result.domError=error.message}
  try{result.bellGeometry=await bounded(page.evaluate(notificationBellGeometry));}catch(error){result.bellGeometryError=error.message}
  try{result.viewportEvents=await bounded(page.evaluate(()=>window.__qaNotificationViewportEvents||[]));}catch(error){result.viewportEventsError=error.message}
  try{result.screenshot=`${engine}-failure-${index+1}.png`;await page.screenshot({path:output+'/'+result.screenshot,timeout:4000,fullPage:false})}catch(error){result.screenshotError=error.message}
  return result;
 }));
}
