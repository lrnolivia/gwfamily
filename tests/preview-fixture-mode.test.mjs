// Offline-only fixture bootstrap contracts, never a browser or runtime pass.
import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values}};
function previewHost(){
 const localStorage=storage(),sessionStorage=storage(),events=[];
 const page={setDefaultTimeout(){},on(){},async goto(){events.push('goto')},async waitForFunction(){},async evaluate(callback,args){return callback(args)},async reload(){events.push('reload');assert.equal(sessionStorage.getItem('gw-active-mode'),'preview','Explicit preview intent precedes reload')},getByRole(){return {async waitFor(){}}}};
 const initialState=()=>({mode:'preview',selfId:'fixture-owner',members:[{id:'fixture-owner'}],onboarding:'welcome'});
 return {localStorage,sessionStorage,events,page,context:{browser:{async newPage(){return page}},initialState,PREVIEW_KEY:'fixture-preview',url:'http://synthetic.invalid',errors:[],writes:[],localStorage,sessionStorage,console}};
}
test('Recovery bootstrap records real preview intent before loading its saved sample state',async()=>{
 const source=read('./recovery-browser.mjs'),start=source.indexOf('async function pageFor('),end=source.indexOf('\nasync function noOverflow',start),h=previewHost();
 assert.ok(start>=0&&end>start);const helper=vm.runInNewContext('('+source.slice(start,end)+')',h.context);
 await helper(390,'dark','ios');assert.deepEqual(h.events,['goto','reload']);assert.equal(h.sessionStorage.getItem('gw-active-mode'),'preview');assert.equal(JSON.parse(h.localStorage.getItem('fixture-preview')).state.onboarding,'done');
 assert.doesNotMatch(source.slice(start,end),/configured\s*:\s*false|notificationApi|\.dispatch\(/);
});
test('Hotfix owns the same explicit preview intent and independent fictional state',async()=>{
 const source=read('./hotfix-browser.mjs'),start=source.indexOf('async function pageFor('),end=source.indexOf('\ntry{',start),h=previewHost();
 assert.ok(start>=0&&end>start);const helper=vm.runInNewContext('('+source.slice(start,end)+')',h.context);
 await helper(768,'light','android');assert.deepEqual(h.events,['goto','reload']);assert.equal(h.sessionStorage.getItem('gw-active-mode'),'preview');assert.equal(JSON.parse(h.localStorage.getItem('fixture-preview')).state.members[0].profileColor,'#c9aa52');
 assert.doesNotMatch(source.slice(start,end),/configured\s*:\s*false|notificationApi|\.dispatch\(/);
});
test('quiet returning live-load scenario clears only explicit preview mode before the gated live reload',()=>{
 const source=read('./recovery-browser.mjs'),start=source.indexOf('const returning=await pageFor()'),end=source.indexOf('for(const width of [390,768,1280])',start),scenario=source.slice(start,end);
 const removal="await returning.evaluate(()=>sessionStorage.removeItem('gw-active-mode'));";
 assert.ok(scenario.includes(removal));assert.ok(scenario.indexOf(removal)<scenario.indexOf('await returning.reload('));assert.match(scenario,/configured:true,email:true/);assert.match(scenario,/signedIn:false,configured:true/);
 assert.match(scenario,/Opening your family space/);assert.match(scenario,/Email me a code/);
 const sessionStorage=storage();sessionStorage.setItem('gw-active-mode','preview');vm.runInNewContext("(()=>sessionStorage.removeItem('gw-active-mode'))()",{sessionStorage});assert.equal(sessionStorage.getItem('gw-active-mode'),null);
 assert.doesNotMatch(scenario,/configured\s*:\s*false|sessionStorage\.clear\(/);
});
test('navigation geometry fixture seeds explicit preview before first document bootstrap',()=>{
 const source=read('./navigation-insets-browser.mjs'),start=source.indexOf('function installNavigationFixture('),end=source.indexOf('  const events = [], started = performance.now();',start);
 assert.ok(start>=0&&end>start);const initializer=source.slice(start,end)+'\n}';
 const localStorage=storage(),sessionStorage=storage(),navigator={},window={matchMedia:query=>({matches:false,media:query})};
 const init=vm.runInNewContext('('+initializer+')',{localStorage,sessionStorage,navigator,window,EventTarget});
 init({device:{platform:'MacIntel',touch:5,height:900,width:768},material:'ios',theme:'dark',mode:'standalone',state:{mode:'preview',onboarding:'done'},key:'fixture-preview'});
 assert.equal(sessionStorage.getItem('gw-active-mode'),'preview');assert.equal(navigator.standalone,true);assert.equal(JSON.parse(localStorage.getItem('fixture-preview')).state.onboarding,'done');
 assert.doesNotMatch(initializer,/configured\s*:\s*false|notificationApi|\.dispatch\(/);
});
test('fixture intent matches the real adapter while unknown configuration and live account guards remain intact',()=>{
 const adapter=read('../src/live-adapter.js'),hook=read('../src/use-notifications.js');
 assert.match(adapter,/const modeKey=reviewOnly\?'gw-review-mode':'gw-active-mode'/);assert.match(adapter,/sessionStorage.getItem\(modeKey\)==='preview'/);assert.match(adapter,/sessionStorage.setItem\(modeKey,'preview'\)/);
 assert.match(hook,/previewReady=data.preview\|\|!data.loading&&data.config\?\.configured===false/);assert.match(hook,/latest.mode===run.mode&&latest.selfId===run.accountId/);assert.match(hook,/run.identity!==identity/);
 const regression=read('./notification-hook.test.mjs');assert.match(regression,/unknown config cannot activate a saved preview without explicit preview intent/);assert.match(regression,/data.config=null/);assert.match(regression,/assert.deepEqual\(liveCalls,\[\]\)/);
});
