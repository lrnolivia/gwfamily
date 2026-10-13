// Offline contracts for the hosted capture helper. This does not launch a
// browser or replace the required Chromium/WebKit responsive UI checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./notifications-browser.mjs',import.meta.url),'utf8');
const settingsSource=source.slice(source.indexOf('async function expectSettingsPage('),source.indexOf('async function openSettings('));
const captureSource=source.slice(source.indexOf('async function captureNotificationViewport('),source.indexOf('\nlet failure;'));
function captureFixture({settings=false,mutate=()=>{}}={}){
 const calls=[],events=[],state={url:settings?'http://127.0.0.1:4173/#/notification-settings':'http://127.0.0.1:4173/#/you',width:768,height:900,scrollX:0,scrollY:0,
  visualViewport:{width:768,height:900,left:0,top:0},expanded:String(!settings),inboxOpen:!settings,settingsOpen:settings};
 const surface={name:settings?'settings':'inbox'},inbox={name:'inbox'},button={name:'bell'};
 const context=vm.createContext({assert,events,currentCheck:'responsive widths',
  panel:()=>settings?inbox:surface,bell:()=>button,notificationCaptureState:function notificationCaptureState(){},
  expect:locator=>({
   async toBeVisible(){calls.push('visible:'+locator.name);assert.equal(locator.name==='inbox'?state.inboxOpen:state.settingsOpen,true);},
   async toHaveURL(value){calls.push('settings-url');assert.equal(value.test(state.url),true);},
   async toHaveCount(count){calls.push('count:'+locator.name);assert.equal(locator.name,'dialog');assert.equal(count,0);},
   async toBeHidden(){calls.push('hidden:'+locator.name);assert.equal(locator.name,'inbox');assert.equal(state.inboxOpen,false);},
   async toHaveAttribute(name,value){calls.push(name+':'+value);assert.equal(locator,button);assert.equal(state.expanded,value);},
  }),
 });
 vm.runInContext(settingsSource+captureSource,context);
 const page={
  getByRole(role,options){if(role==='heading'){assert.equal(options.name,'Notifications');assert.equal(options.level,1);assert.equal(options.exact,true);return {name:'heading'}}if(role==='dialog')return {name:'dialog'};assert.equal(role,'region');assert.equal(options.name,'Notification choices');assert.equal(options.exact,true);return surface;},
  async evaluate(fn){if(fn.name==='notificationCaptureState'){calls.push('state');return structuredClone(state);}calls.push('render-frames');},
  async screenshot(options){calls.push('screenshot');assert.deepEqual(JSON.parse(JSON.stringify(options)),{path:'fixture.png',fullPage:false});mutate(state);},
 };
 return {run:()=>context.captureNotificationViewport(page,'fixture.png',{settings}),calls,events,state};
}

test('inbox evidence uses a viewport capture and keeps strict pre/post open-state assertions',async()=>{
 const fixture=captureFixture();await fixture.run();
 assert.deepEqual(fixture.calls,['visible:inbox','aria-expanded:true','state','screenshot','render-frames','state','visible:inbox','aria-expanded:true']);
 assert.deepEqual(fixture.events.map(event=>event.type),['viewport-capture-before','viewport-capture-after']);
 assert.equal(fixture.events[0].path,'fixture.png');assert.equal(fixture.events[1].state.inboxOpen,true);
});

test('settings evidence stays viewport-only and preserves the full page without reopening the inbox or a modal',async()=>{
 const fixture=captureFixture({settings:true});await fixture.run();
 assert.deepEqual(fixture.calls,['settings-url','visible:heading','visible:settings','count:dialog','hidden:inbox','aria-expanded:false','visible:settings','state','screenshot','render-frames','state','visible:settings']);
 assert.equal(fixture.events[1].state.settingsOpen,true);assert.equal(fixture.events[1].state.inboxOpen,false);
});

test('capture rejects dismissal, scrolling, viewport drift and navigation instead of repairing or hiding them',async()=>{
 for(const mutate of [
  state=>{state.inboxOpen=false;state.expanded='false';},
  state=>{state.scrollY=100;},
  state=>{state.height=1200;},
  state=>{state.visualViewport.height=1200;},
  state=>{state.url='http://127.0.0.1:4173/#/home';},
 ]){
  const fixture=captureFixture({mutate});
  await assert.rejects(fixture.run(),/Capturing notification evidence must not change/);
  assert.equal(fixture.events.at(-1).type,'viewport-capture-after');
  assert.equal(fixture.calls.filter(call=>call==='screenshot').length,1);
 }
 const settings=captureFixture({settings:true,mutate:state=>{state.settingsOpen=false;}});
 await assert.rejects(settings.run(),/Capturing notification evidence must not change/);
});

test('responsive loop retains every width, fit check and normal settings click around captures',()=>{
 const loop=source.slice(source.indexOf("await check('notification controls fit"),source.indexOf("await check('preview controls"));
 for(const width of [320,390,768,1280])assert.ok(loop.includes('width:'+width));
 for(const helper of ['checkFit(alice)','checkBellClear(alice)','checkNavigationClear(alice)'])assert.ok(loop.includes(helper));
 assert.match(loop,/await captureNotificationViewport\(alice,[^\n]+-inbox\.png`\)/);
 assert.match(loop,/const previous=await openSettings\(alice\)/);
 const normalSettings=source.slice(source.indexOf('async function openSettings('),source.indexOf('async function refresh(page)'));
 assert.match(normalSettings,/getByRole\('button',\{name:'Notification settings',exact:true\}\)\.click\(\)/);assert.match(normalSettings,/returnFromSettings[\s\S]*locator\('\.page-navigation-header'\)\.getByRole\('button',\{name:\/\^Back to \/\}\)\.click\(\)/);assert.doesNotMatch(normalSettings,/force:|dispatchEvent|showPopover|waitForTimeout/);
 assert.match(loop,/-settings\.png`,\{settings:true\}\)/);
 assert.equal((loop.match(/showInbox\(alice\)/g)||[]).length,1,'Only the normal initial bell action may open the inbox.');
 assert.doesNotMatch(loop,/fullPage:true|force:|dispatchEvent|waitForTimeout/);
 assert.doesNotMatch(captureSource,/showInbox|\.click\(|showPopover|force:|dispatchEvent|waitForTimeout/);
});

test('viewport trace is bounded and records transient resize and native dismissal geometry without changing the UI',()=>{
 const traceSource=source.slice(source.indexOf('function installNotificationViewportTrace('),source.indexOf('async function captureNotificationViewport('));
 const listeners=new Map(),viewport={width:768,height:900,offsetLeft:0,offsetTop:0},rect={left:650,right:694,top:30,bottom:74};
 const attach=target=>Object.assign(target,{addEventListener(type,fn){listeners.set(target.label+':'+type,fn);}});
 const window=attach({label:'window',visualViewport:attach({...viewport,label:'viewport'})});
 const button={getBoundingClientRect:()=>rect,getAttribute:()=> 'true'};
 const document=attach({label:'document',querySelector:selector=>selector==='header button.notification-entry'?button:{}});
 const context=vm.createContext({window,document,innerWidth:768,innerHeight:900,scrollX:0,scrollY:0});
 vm.runInContext(traceSource,context);context.installNotificationViewportTrace();
 const target={classList:{contains:value=>value==='notification-popover'}};
 listeners.get('document:beforetoggle')({type:'beforetoggle',target,currentTarget:document,newState:'closed'});
 assert.equal(window.__qaNotificationViewportEvents[0].newState,'closed');
 assert.equal(window.__qaNotificationViewportEvents[0].bell.top,30);
 const count=window.__qaNotificationViewportEvents.length;
 listeners.get('document:toggle')({type:'toggle',target:{classList:{contains:()=>false}},currentTarget:document});
 assert.equal(window.__qaNotificationViewportEvents.length,count,'Unrelated popovers do not obscure notification evidence.');
 for(let i=0;i<45;i++)listeners.get('viewport:resize')({type:'resize',currentTarget:window.visualViewport});
 assert.equal(window.__qaNotificationViewportEvents.length,40);assert.equal(window.__qaNotificationViewportEvents[0].source,'visualViewport');
 assert.equal(window.__qaNotificationViewportEvents.at(-1).visualViewport.height,900);
 assert.match(source,/page\.addInitScript\(installNotificationViewportTrace\)/);
 assert.match(source,/result\.viewportEvents=await bounded\(page\.evaluate\(\(\)=>window\.__qaNotificationViewportEvents\|\|\[\]\)\)/);
});
