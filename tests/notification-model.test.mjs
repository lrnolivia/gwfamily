import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {initialState,reducer,loadLocalState,PREVIEW_KEY} from '../src/data-adapter.js';
import {SHARED_PAGE_SCHEMA,sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {DEFAULT_NOTIFICATION_CATEGORIES,normalizeNotificationSettings,notificationCategory,notificationTargetRoute,mergeNotificationPages,mergeNotificationResource,previewNotificationPage,previewOpenNotification,createNotificationChannel,isNotificationInvalidation,NOTIFICATION_INVALIDATION} from '../src/notification-model.js';
const source=file=>fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
const settings=(state,patch)=>reducer(state,{type:'SET_NOTIFICATION_SETTINGS',patch,revision:state.notificationSettings.revision});

test('legacy Off stays off; Following scope, categories, and external push stay independent',()=>{
 const migrated=normalizeNotificationSettings({}, {notificationScope:'off',selectedNotificationIds:['person']});
 assert.equal(normalizeNotificationSettings({scope:'loved_ones'}).scope,'loved');assert.equal(migrated.globalOff,true);assert.equal(migrated.scope,'leaders');assert.deepEqual(migrated.selectedIds,['person']);assert.equal(migrated.pushEnabled,false);
 let state=initialState();state=settings(state,{scope:'selected',selectedIds:['monique'],categories:{reactions:false}});
 state=settings(state,{globalOff:true});assert.equal(state.notificationSettings.scope,'selected');assert.deepEqual(state.notificationSettings.selectedIds,['monique']);assert.equal(previewNotificationPage(state).unreadCount,0);
 state=settings(state,{globalOff:false});assert.equal(state.notificationSettings.scope,'selected');assert.equal(state.notificationSettings.categories.reactions,false);assert.equal(previewNotificationPage(state).unreadCount,4);
});
test('categories can only retain explicit boolean choices and defaults never enable push',()=>{
 const result=normalizeNotificationSettings({categories:{replies:false,fees:'yes',unknown:true},pushEnabled:true});
 assert.equal(result.categories.replies,false);assert.equal(result.categories.fees,true);assert.equal(result.categories.unknown,undefined);assert.equal(result.pushEnabled,false);assert.equal(Object.keys(result.categories).length,12);assert.equal(Object.keys(DEFAULT_NOTIFICATION_CATEGORIES).length,12);
});
test('direct replies and mentions bypass Following, and global Off remains absolute',()=>{
 const state=initialState(),page=previewNotificationPage(state);assert.equal(page.unreadCount,3);assert.equal(page.notifications.some(n=>n.category==='following'),false);assert.ok(page.notifications.some(n=>n.category==='replies'));
 assert.equal(previewNotificationPage(settings(state,{categories:{replies:false}})).unreadCount,2);
 assert.equal(previewNotificationPage(settings(state,{globalOff:true})).notifications.length,0);
 assert.equal(previewOpenNotification(settings(state,{globalOff:true}),'preview-notice-reply').available,false);
});
test('preview pagination is stable beyond 100 and unread count is independent of page size',()=>{
 const state=initialState();state.notifications=Array.from({length:135},(_,i)=>({id:'n'+i,sequence:i+1,kind:'reunion.changed',category:'reunion',target:{kind:'reunion',id:'reunion'},createdAt:1000}));
 const pages=[];let before;do{const page=previewNotificationPage(state,{before,limit:30});assert.equal(page.unreadCount,135);pages.push(page);before=page.nextCursor}while(before!=null);
 const items=mergeNotificationPages(pages);assert.equal(items.length,135);assert.equal(items[0].sequence,135);assert.equal(items.at(-1).sequence,1);assert.equal(new Set(items.map(x=>x.id)).size,135);
});
test('read-all uses its captured cutoff; later activity and disabled categories remain unread',()=>{
 let state=initialState(),cutoff=previewNotificationPage(state).readAllCutoff;state.notifications.unshift({id:'later',sequence:cutoff+1,kind:'reunion.changed',category:'reunion',target:{kind:'reunion',id:'reunion'}});
 state=reducer(state,{type:'MARK_NOTICES_READ_ALL',cutoff});assert.equal(previewNotificationPage(state).unreadCount,1);assert.ok(!state.readNotices.includes('later'));assert.ok(!state.readNotices.includes('preview-notice-post'));
 const firstRead=[...state.readNotices];state=reducer(state,{type:'MARK_NOTICES_READ_ALL',cutoff:1});assert.deepEqual(state.readNotices,firstRead);
});
test('read and dismiss are idempotent; old devices cannot mark unread; reset is isolated',()=>{
 let state=initialState();state.drafts.post='Keep my writing';state.compose={title:'still here'};state.bag=[{productId:'shirt'}];state=settings(state,{scope:'all'});
 for(let i=0;i<2;i++)state=reducer(state,{type:'MARK_NOTICE_READ',id:'preview-notice-reply'});assert.equal(state.readNotices.filter(id=>id==='preview-notice-reply').length,1);
 for(let i=0;i<2;i++)state=reducer(state,{type:'DISMISS_NOTICE',id:'preview-notice-reply'});assert.equal(state.notifications.some(n=>n.id==='preview-notice-reply'),false);
 const reset=reducer(state,{type:'RESET_NOTIFICATIONS_PREVIEW'});assert.equal(reset.notifications.length,4);assert.equal(reset.drafts,state.drafts);assert.equal(reset.compose,state.compose);assert.equal(reset.bag,state.bag);assert.equal(reset.notificationSettings.globalOff,false);
});
test('preview rejects stale preference revisions without reverting unrelated preferences',()=>{
 const state=settings(initialState(),{categories:{reactions:false}}),next=reducer(state,{type:'SET_NOTIFICATION_SETTINGS',patch:{scope:'all'},revision:0});assert.equal(next,state);assert.equal(next.notificationSettings.categories.reactions,false);
});
test('old preview persistence preserves notification off choice and read history',()=>{
 const old=initialState();delete old.notificationSettings;old.notificationScope='off';old.readNotices=['historic'];const storage={getItem:key=>key===PREVIEW_KEY?JSON.stringify({schema:2,mode:'preview',state:old}):null};
 const loaded=loadLocalState(storage);assert.equal(loaded.notificationSettings.globalOff,true);assert.deepEqual(loaded.readNotices,['historic']);
});
test('typed resource routing rejects arbitrary URLs and unknown kinds',()=>{
 assert.equal(notificationTargetRoute({kind:'url',id:'https://evil.example/'}),null);assert.equal(notificationTargetRoute({url:'javascript:alert(1)'}),null);
 assert.deepEqual(notificationTargetRoute({kind:'comment',id:'c',containerId:'old-post',anchorId:'c'}),{type:'post',id:'old-post',section:'comment:c'});
 assert.deepEqual(notificationTargetRoute({kind:'invitation',id:'invite',url:'https://evil.example/'}),{type:'inbox',section:'invitations'});
 assert.deepEqual(notificationTargetRoute({kind:'fee',id:'fee',section:'planner'}),{type:'leader-tools',section:'fees'});
 assert.equal(notificationTargetRoute({kind:'post',id:''}),null);
});
test('resource hydration opens authorized old content without mutating any draft boundary',()=>{
 const state=initialState();state.drafts.post='Unsent';state.compose={poll:{question:'Unsent poll'}};state.feedFilter='saved';state.peopleFilter='loved';state.memoryFilters={year:'2024'};state.bag=[{productId:'shirt'}];
 const result={available:true,target:{kind:'comment',id:'old-comment',containerId:'old-post'},post:{id:'old-post',authorId:'monique',text:'Older authorized update'},comments:[{id:'old-comment'}]};const next=mergeNotificationResource(state,result);
 assert.equal(next.posts.at(-1).id,'old-post');assert.deepEqual(next.comments['old-post'],[{id:'old-comment'}]);for(const field of ['drafts','compose','feedFilter','peopleFilter','memoryFilters','bag'])assert.equal(next[field],state[field],field);
 assert.equal(mergeNotificationResource(state,{...result,available:false}),state);assert.equal(mergeNotificationResource(state,{...result,target:{kind:'url',id:'x'}}),state);
});
test('old memory hydration also restores its mirrored post and comments',()=>{
 const state=initialState(),result={available:true,target:{kind:'memory',id:'old-memory'},memory:{id:'old-memory',title:'Memory'},post:{id:'old-memory',text:'Memory post'},comments:[{id:'memory-comment'}]},next=mergeNotificationResource(state,result);
 assert.equal(next.memories.at(-1).id,'old-memory');assert.equal(next.posts.at(-1).id,'old-memory');assert.equal(next.comments['old-memory'][0].id,'memory-comment');assert.equal(next.drafts,state.drafts);
 assert.deepEqual(notificationTargetRoute({kind:'household_invitation',id:'opaque',containerId:'h'}),{type:'household',id:'h',section:'email-invitation'});
});
test('preview open honors missing resources and comment anchors without manufacturing targets',()=>{
 const state=initialState(),opened=previewOpenNotification(state,'preview-notice-reply');assert.equal(opened.available,true);assert.equal(opened.post.id,'post-generations');assert.equal(opened.target.anchorId,'seed-comment-2');
 assert.equal(previewOpenNotification({...state,posts:[]},'preview-notice-reply').available,false);assert.equal(previewOpenNotification(state,'absent').available,false);
});
test('message unread is counted separately, but conversation invitations remain activity',()=>{
 const state=initialState();state.notifications=[{id:'msg',sequence:1,kind:'message.created',category:'messages'},{id:'invite',sequence:2,kind:'conversation.invited',category:'messages'}];assert.equal(previewNotificationPage(state).unreadCount,1);
 const marked=reducer(state,{type:'MARK_NOTICES_READ_ALL',cutoff:2});assert.deepEqual(marked.readNotices,['invite']);
 assert.equal(notificationCategory({kind:'comment.created'}),'replies');assert.equal(notificationCategory({kind:'memory.tagged'}),'mentions');
});
test('cross-tab invalidation is payload-minimal and close detaches the handler',()=>{
 let instance;class Channel{constructor(name){this.name=name;instance=this}postMessage(value){this.sent=value}close(){this.closed=true}}
 let refreshed=0;const channel=createNotificationChannel(()=>refreshed++,Channel);channel.send();assert.deepEqual(instance.sent,{type:'invalidate',version:1});assert.deepEqual(Object.keys(instance.sent).sort(),['type','version']);
 instance.onmessage({data:{...NOTIFICATION_INVALIDATION,accountId:'secret'}});assert.equal(refreshed,0);instance.onmessage({data:NOTIFICATION_INVALIDATION});assert.equal(refreshed,1);
 assert.equal(isNotificationInvalidation({type:'wrong',version:1}),false);channel.close();assert.equal(instance.onmessage,null);assert.equal(instance.closed,true);assert.doesNotThrow(()=>createNotificationChannel(()=>{},null).send());
});
test('notification hook checks identity before commits, clears on account switches, and refreshes visible online sessions',()=>{
 const hook=source('use-notifications.js');assert.match(hook,/current\.current\.identity===run\.identity/);assert.match(hook,/run\.sequence!==sequence/);assert.match(hook,/run\.controller\?\.abort\(\)/);assert.match(hook,/result\.accountId===run\.accountId/);assert.match(hook,/setInterval\(tick,15000\)/);assert.match(hook,/visibilitychange/);assert.match(hook,/addEventListener\('online'/);assert.match(hook,/snapshot\.identity===identity\?snapshot/);
 assert.doesNotMatch(hook,/Notification\.requestPermission|pushManager\.subscribe|localStorage\.setItem/);
});
test('UI uses shared choice controls, direct open actions, authoritative counts, and reduced motion',()=>{
 const ui=source('notifications.jsx'),css=source('notifications.css'),adapter=source('live-adapter.js');assert.match(ui,/ChoiceControl label="Whose posts and memories\?"/);assert.match(ui,/aria-label="Activity updates"/);assert.match(ui,/data-notice-id/);assert.match(ui,/n\.unreadCount/);assert.match(ui,/PushDeviceSettings/);assert.match(source('push-device.jsx'),/Push on this device/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/var\(--flat-font/);assert.match(adapter,/expectedAccountId/);assert.match(adapter,/withLinkedResource/);
});
test('hosted notification fixture returns renderable canonical page content, including hero defaults',()=>{
 const fixture=fs.readFileSync(new URL('./notifications-browser.mjs',import.meta.url),'utf8');
 const start=fixture.indexOf('function sharedPageRecord('),end=fixture.indexOf('async function attachRoutes(');
 assert.ok(start>=0&&end>start,'Fixture must use the schema-complete shared-page response');
 const record=vm.runInNewContext(fixture.slice(start,end)+';sharedPageRecord;',{sharedPageDefaults,decodeURIComponent});
 for(const page of Object.keys(SHARED_PAGE_SCHEMA)){
  const result=JSON.parse(JSON.stringify(record('/api/page-content/'+encodeURIComponent(page))));
  assert.equal(result.page,page);assert.equal(result.canEdit,false);assert.equal(result.revision,0);
  assert.deepEqual(result.content,validateSharedPageContent(page,result.content));
  assert.equal(result.content.hero.mode,'default');assert.deepEqual(result.content.hero.media,[]);
 }
 assert.match(fixture,/return json\(route,sharedPageRecord\(url\.pathname\)\)/);
 assert.doesNotMatch(fixture,/content:\{\},revision:0/);
});
test('hosted notification failures annotate the exact check and retain bounded diagnostics',()=>{
 const fixture=fs.readFileSync(new URL('./notifications-browser.mjs',import.meta.url),'utf8');
 assert.match(fixture,/currentCheck=name/);assert.match(fixture,/::error title=GW notification browser /);
 assert.match(fixture,/page\.on\('pageerror'/);assert.match(fixture,/page\.on\('requestfailed'/);assert.match(fixture,/page\.on\('response'/);
 assert.match(fixture,/events\.length>120/);assert.match(fixture,/slice\(-4\)/);assert.match(fixture,/screenshot\(\{[^}]*timeout:4000/);assert.match(fixture,/result\.dom=await bounded\(/);
 assert.match(fixture,/toHaveAccessibleName\('Notifications, 135 unread'\)/);
 assert.doesNotMatch(fixture,/waitForTimeout|networkidle/);
 const start=fixture.indexOf('function annotation('),end=fixture.indexOf('async function bounded(');
 const annotation=vm.runInNewContext(fixture.slice(start,end)+';annotation;');
 assert.equal(annotation('check,colon:%\n',true),'check%2Ccolon%3A%25%0A');
});

test('Notifications settings has full-page entry from You and Notification Center with shared Back navigation',()=>{
 const app=source('react-app.jsx'),ui=source('notifications.jsx'),css=source('notifications.css');
 assert.match(app,/route.type==='notification-settings'\?<NotificationSettingsPage\/>/);
 assert.match(app,/title="Notifications"[^\n]*onClick=\{\(\)=>go\(\{type:'notification-settings'\}\)\}/);
 assert.match(ui,/aria-label="Notification settings" onClick=\{\(\)=>go\(\{type:'notification-settings'\}\)\}/);
 assert.doesNotMatch(app,/case'notification-settings':return/);
 assert.match(app,/onClick=\{\(\)=>navigation.back\(\)\}/);
 assert.match(ui,/aria-labelledby="notification-settings-heading"/);assert.match(ui,/<h1 id="notification-settings-heading"/);
 assert.match(css,/notification-settings-page/);assert.match(css,/max-width:520px/);
});

test('push deep link is captured before initial route normalization removes URL search',()=>{const src=source('push-device.jsx');assert.match(src,/pendingNotice=useRef\(new URL\(location.href\)\.searchParams.get\('gwNotice'\)\)/);assert.match(src,/id=pendingNotice.current\|\|url.searchParams.get\('gwNotice'\)/);assert.match(src,/if\(!account\|\|!notifications\?\.ready\)return/);assert.match(src,/pendingNotice.current=null/)});
