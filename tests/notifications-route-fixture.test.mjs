import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const fixture=fs.readFileSync(new URL('./notifications-browser.mjs',import.meta.url),'utf8');
const source=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const checkBody=name=>{
 const start=fixture.indexOf("await check('"+name+"',async()=>{");
 assert.ok(start>=0,'Missing browser check: '+name);
 const end=fixture.indexOf("\n await check('",start+1);
 return fixture.slice(start,end<0?fixture.length:end);
};

test('full-page settings helpers assert the route, heading, choices, closed inbox and no dialog, then use exact Back history',async()=>{
 const start=fixture.indexOf('async function expectSettingsPage('),end=fixture.indexOf('async function refresh(page)');
 assert.ok(start>=0&&end>start,'Shared full-page settings helpers must exist');
 for(const initial of ['https://fixture.test/#/home','https://fixture.test/#/you','https://fixture.test/#/post/older-authorized-post?section=comment%3Aolder-comment']){
  const calls=[],state={url:initial,settings:false,inbox:true},locator=(kind,detail)=>({kind,detail});
  const page={url:()=>state.url,getByRole:(role,options)=>locator(role,options),locator:selector=>({getByRole:(role,options)=>({kind:role,detail:options,async click(){assert.equal(selector,'#main .page-back-row');assert.equal(options.name,'Back');state.settings=false;state.url=initial;calls.push('Back')}})})};
  const panel=()=>({kind:'panel',getByRole:(role,options)=>({async click(){assert.equal(role,'button');assert.equal(options.name,'Notification settings');state.url='https://fixture.test/#/notification-settings';state.settings=true;state.inbox=false;calls.push('settings')}})});
  const expect=target=>({
   async toHaveURL(value){assert.ok(typeof value?.test==='function'?value.test(state.url):value===state.url);calls.push('url')},
   async toBeVisible(){assert.ok(state.settings);assert.ok(target.kind==='heading'&&target.detail.name==='Notifications'&&target.detail.level===1||target.kind==='region'&&target.detail.name==='Notification choices');calls.push(target.kind)},
   async toHaveCount(count){assert.equal(target.kind,'dialog'===target.kind?'dialog':'region');assert.equal(count,0);assert.ok(target.kind==='dialog'||!state.settings);calls.push('count:'+target.kind)},
   async toBeHidden(){assert.equal(target.kind,'panel');assert.equal(state.inbox,false);calls.push('closed inbox')},
   async toHaveAttribute(name,value){assert.equal(target.kind,'bell');assert.equal(name,'aria-expanded');assert.equal(value,'false');assert.equal(state.inbox,false);calls.push('collapsed bell')}
  });
  // The only evaluated source is the inspected route helper slice, with fake
  // locators. No browser module, server, fetch, timer or child process is used.
  const helpers=vm.runInNewContext(fixture.slice(start,end)+';({openSettings,returnFromSettings});',{expect,showInbox:async()=>{state.inbox=true},panel,bell:()=>locator('bell')});
  const previous=await helpers.openSettings(page);assert.equal(previous,initial);
  await helpers.returnFromSettings(page,previous);assert.equal(state.url,initial);
  for(const required of ['settings','url','heading','region','count:dialog','closed inbox','collapsed bell','Back','count:region'])assert.ok(calls.includes(required),required);
 }
});

test('push settings fixture returns only activation-required account-scoped disabled status and keeps unexpected requests denied',async()=>{
 const start=fixture.indexOf('async function attachRoutes('),end=fixture.indexOf('async function pageFor(');
 assert.ok(start>=0&&end>start);
 const requests=[],accounts={alice:{},bob:{}},base='https://fixture.test';let handler;
 const attach=vm.runInNewContext(fixture.slice(start,end)+';attachRoutes;',{URL,requests,accounts,base,json:(route,body,status=200)=>({body,status})});
 const viewer={id:'alice'};await attach({async route(pattern,callback){assert.equal(pattern,'**/*');handler=callback}},viewer);
 const routeFor=(method,path)=>({request:()=>({url:()=>base+path,method:()=>method,postDataJSON:()=>({})})});
 for(const accountId of ['alice','bob']){
  viewer.id=accountId;const result=await handler(routeFor('GET','/api/me/push'));
  assert.equal(result.status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body)),{accountId,ready:false,pushEnabled:false,devices:[],reason:'activation-required'});
 }
 for(const [method,path] of [['PUT','/api/me/push'],['POST','/api/me/push'],['GET','/api/unexpected-fixture-call']]){
  const result=await handler(routeFor(method,path));assert.equal(result.status,500);assert.equal(result.body.error,'Unexpected synthetic fixture API call: '+method+' '+path);
 }
 assert.equal(requests.length,5);
});

test('viewport capture recognizes full-page notification choices without requiring a dialog',()=>{
 const start=fixture.indexOf('function notificationCaptureState('),end=fixture.indexOf('function installNotificationViewportTrace(');
 assert.ok(start>=0&&end>start);
 let settings=true;const selectors=[];
 const capture=vm.runInNewContext(fixture.slice(start,end)+';notificationCaptureState;',{location:{href:'https://fixture.test/#/notification-settings'},innerWidth:390,innerHeight:844,scrollX:0,scrollY:0,window:{visualViewport:null},document:{querySelector(selector){selectors.push(selector);if(selector==='.notification-panel')return {closest:()=>({matches:()=>false})};if(selector==='header button.notification-entry')return {getAttribute:()=> 'false'};if(selector==='.notification-settings-page .notification-settings')return settings?{}:null;throw Error('Unexpected capture selector: '+selector)}}});
 assert.equal(capture().settingsOpen,true);settings=false;assert.equal(capture().settingsOpen,false);
 assert.ok(selectors.includes('.notification-settings-page .notification-settings'));
 assert.ok(!selectors.some(selector=>selector.includes('dialog')));
});

test('mounted post refresh keeps every focus, selection, scroll and draft invariant while using a real cancellable sheet',()=>{
 const body=checkBody('background deep-link refresh preserves active comment and reply drafts; explicit revisits still focus');
 assert.match(body,/window\.__qaDraftNodes\?\.\[el\.getAttribute\('aria-label'\)\]===el/);
 assert.match(body,/await expect\(field\)\.toBeFocused\(\);await expect\(field\)\.toHaveValue\(value\)/);
 assert.match(body,/selectionStart,el\.selectionEnd\]\),\[5,12\]/);
 assert.match(body,/Background refresh must not scroll back to the anchor/);
 for(const text of ['The first fresh fixture reply.','The next refreshed fixture reply.','The reply refreshed fixture text.','The sheet refreshed fixture text.','The final refreshed fixture text.'])assert.ok(body.includes(text));
 assert.match(body,/getByRole\('dialog',\{name:'Report content',exact:true\}\)/);
 assert.match(body,/await expect\(reason\)\.toBeFocused\(\)/);
 assert.match(body,/await sheet\.getByRole\('button',\{name:'Close dialog',exact:true\}\)\.click\(\)/);
 assert.match(body,/request\.payload\.type==='REPORT'/);
 assert.match(body,/must not submit a report/);
 assert.match(body,/await expect\(draft\)\.toHaveValue\('Keep this unsent comment draft'\)/);
 assert.match(body,/await expect\(reply\)\.toHaveValue\('Keep this unsent reply draft'\)/);
 assert.match(body,/window\.__qaCommentAnchorScrolls\),1/);assert.match(body,/window\.__qaCommentAnchorScrolls\),2/);
 assert.doesNotMatch(body,/Notification settings|openSettings\(/);
});

test('full-page settings refresh and Back retain both draft kinds for explicit authenticated reauthorization',()=>{
 const body=checkBody('full-page settings uses Back and preserves drafts across explicit post reauthorization');
 assert.match(body,/const previous=await openSettings\(alice\);await refresh\(alice\);await expectSettingsPage\(alice\)/);
 assert.match(body,/await returnFromSettings\(alice,previous\)/);
 assert.match(body,/getByText\('This post is unavailable\.',\{exact:true\}\)\)\.toBeVisible\(\)/);
 assert.match(body,/locator\('\[data-comment-id="older-comment"\]'\)\)\.toHaveCount\(0\)/);
 assert.match(body,/getByRole\('button',\{name:'Open Fixture update 135',exact:true\}\)\.click\(\)/);
 assert.match(body,/await expect\(anchor\)\.toBeFocused\(\)/);
 assert.match(body,/await expect\(draft\)\.toHaveValue\('Keep this unsent comment draft'\)/);
 assert.match(body,/getByRole\('textbox',\{name:'Write a reply…',exact:true\}\)\)\.toHaveValue\('Keep this unsent reply draft'\)/);
 assert.match(body,/name:'You',exact:true/);assert.match(body,/name:'Notifications Updates, following and this device',exact:true/);
 assert.match(body,/await returnFromSettings\(alice,you\)/);
 assert.doesNotMatch(body,/Close dialog/);
});

test('all notification settings fixture entries follow the approved full-page contract without deleting safety or race coverage',()=>{
 assert.match(fixture,/const panel=page=>page\.locator\('\.notification-popover'\)\.getByRole\('region',\{name:'Notifications',exact:true\}\)/,'The inbox region must not match the full-page Notifications region');
 assert.equal((fixture.match(/getByRole\('button',\{name:'Notification settings',exact:true\}\)\.click\(\)/g)||[]).length,1,'Only the shared full-page helper may click the center settings entry');
 for(const name of ['settings preserve Following through global Off and normalize Loved Ones','account switch rejects stale settings writes and clears old-account inbox','notification controls fit 320/390/768/1280 across approved materials and palettes']){
  const body=checkBody(name);assert.match(body,/openSettings\(alice\)/);assert.match(body,/returnFromSettings\(alice,/);assert.doesNotMatch(body,/Close dialog/);
 }
 assert.match(fixture,/assert\.deepEqual\(errors,\[\],'No browser runtime errors'\)/);
 assert.match(fixture,/a delayed notification open cannot override a newer navigation intent/);
 assert.match(fixture,/expectedAccountId&&payload\.expectedAccountId!==viewer\.id/);
 assert.match(fixture,/Cross|broadcast contains no private data/);
 assert.doesNotMatch(fixture,/waitForTimeout|networkidle/);
 const app=source('react-app.jsx'),ui=source('notifications.jsx'),comments=source('conversation.jsx');
 assert.match(app,/route.type==='notification-settings'\?<NotificationSettingsPage\/>/);
 assert.match(ui,/aria-label="Notification settings" onClick=\{\(\)=>go\(\{type:'notification-settings'\}\)\}/);
 assert.match(comments,/<Comment key=\{comment.id\}/);assert.match(comments,/<ComposerBox key=\{comment.id\} kind="replies"/);
});
