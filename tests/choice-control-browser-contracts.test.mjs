// Node-only harness contracts. These do not launch a browser or claim a hosted
// Chromium/WebKit keyboard or contrast pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./choice-control-browser.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function bootChoiceFixture('),end=source.indexOf('\nconst results=[],errors=[];',start);
assert.ok(start>=0&&end>start,'The boot contract must extract the actual hosted harness function.');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function bootHarness({ui=Promise.resolve(),helpers=Promise.resolve(),fixture={},snapshotError}={}){
 const assertions=[],waits=[],files=[],logs=[],waitsStarted=deferred();
 const window={fixture},document={readyState:'complete',getElementById:()=>({innerText:'Synthetic fixture text '.repeat(200)}),querySelectorAll:()=>Array(3)};
 const page={
  goto:async(url,options)=>{assert.equal(url,'http://choice-fixture.local/');assert.equal(options.timeout,12000)},
  url:()=> 'http://choice-fixture.local/',
  getByRole:(role,options)=>({role,...options}),
  waitForFunction:async(predicate,arg,options)=>{waits.push({predicate,arg,options});waitsStarted.resolve();await helpers},
  evaluate:async callback=>{if(snapshotError)throw snapshotError;return callback()},
 };
 const expect=(locator,message)=>Object.fromEntries(['toBeVisible','toBeChecked'].map(method=>[method,async options=>{assertions.push({locator,message,method,options});await ui}]));
 const boot=vm.runInNewContext('('+source.slice(start,end)+')',{expect,bootTimeout:12000,engineName:'webkit',output:'/synthetic-qa',window,document,
  console:{error:(...args)=>logs.push(args)},writeFile:async(path,contents)=>files.push({path,data:JSON.parse(contents)}),
 });
 return {boot,page,assertions,waits,files,logs,window,waitsStarted:waitsStarted.promise};
}

test('choice fixture waits for both semantic controls and helpers in either completion order',async()=>{
 for(const first of ['ui','helpers']){
  const gates={ui:deferred(),helpers:deferred()},h=bootHarness({ui:gates.ui.promise,helpers:gates.helpers.promise});
  let complete=false;const pending=h.boot(h.page,390,[]).then(()=>{complete=true});
  // Observe readiness being scheduled. No wall-clock delay or browser is used.
  await h.waitsStarted;
  assert.equal(h.assertions.length,4);assert.equal(h.waits.length,1);
  gates[first].resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(complete,false,`${first} readiness alone must not release the boot gate.`);
  gates[first==='ui'?'helpers':'ui'].resolve();await pending;
  assert.deepEqual(h.assertions.map(({locator,method})=>[locator.role,locator.name,method]),[
   ['heading','Choice controls','toBeVisible'],['radio','Coming','toBeChecked'],
   ['combobox','How many people?','toBeVisible'],['combobox','New owner','toBeVisible'],
  ]);
  for(const assertion of h.assertions){assert.equal(assertion.options.timeout,12000);assert.match(assertion.message,/fixture boot at 390px/)}
  assert.equal(h.waits[0].options.timeout,12000);assert.equal(h.files.length,0);
 }
});

test('readiness requires each fixture helper to be callable, not just a fixture object',async()=>{
 const h=bootHarness();await h.boot(h.page,1024,[]);
 const ready=h.waits[0].predicate;
 h.window.fixture=undefined;assert.equal(ready(),false);
 h.window.fixture={};assert.equal(ready(),false);
 for(const name of ['palette','material','disable','busy']){
  h.window.fixture[name]=true;assert.equal(ready(),false);
  h.window.fixture[name]=()=>{};
 }
 assert.equal(ready(),true);
 for(const name of ['palette','material','disable','busy']){
  const callable=h.window.fixture[name];h.window.fixture[name]=null;assert.equal(ready(),false,name);h.window.fixture[name]=callable;
 }
});

test('boot failures retain the original cause and named, bounded viewport diagnostics',async()=>{
 const helperGate=deferred(),h=bootHarness({helpers:helperGate.promise,fixture:{palette:()=>{}}});
 const failure=new Error('Synthetic readiness failure '+'.'.repeat(5000));
 const events=Array.from({length:30},(_,index)=>({type:'pageerror',message:`Synthetic error ${index}`}));
 const pending=h.boot(h.page,390,events);
 helperGate.reject(failure);
 await assert.rejects(pending,error=>error.cause===failure&&/fixture boot at 390px \(render and helper readiness\)/.test(error.message));
 assert.equal(h.files.length,1);assert.equal(h.files[0].path,'/synthetic-qa/boot-failure-webkit-390.json');
 const diagnostic=h.files[0].data;
 assert.equal(diagnostic.check,'fixture boot at 390px');assert.equal(diagnostic.engine,'webkit');assert.equal(diagnostic.width,390);assert.equal(diagnostic.timeoutMs,12000);
 assert.equal(diagnostic.error.length,4000);assert.equal(diagnostic.events.length,20);assert.equal(diagnostic.events[0].message,'Synthetic error 10');
 assert.equal(diagnostic.document.rootText.length,2000);assert.equal(diagnostic.document.readyState,'complete');assert.equal(diagnostic.document.rootPresent,true);
 assert.deepEqual(diagnostic.document.helpers,{palette:'function',material:'undefined',disable:'undefined',busy:'undefined'});
 assert.equal(h.logs[0][0],'CHOICE FIXTURE BOOT FAILURE:');
});

test('an unavailable document snapshot cannot hide the original boot failure',async()=>{
 const helperGate=deferred(),h=bootHarness({helpers:helperGate.promise,snapshotError:new Error('Closed document '+'.'.repeat(1500))});
 const failure=new Error('Synthetic readiness failure'),pending=h.boot(h.page,1024,[]);
 helperGate.reject(failure);await assert.rejects(pending,error=>error.cause===failure);
 assert.equal(h.files[0].data.document.unavailable.length,1000);
});

test('the first palette call is gated without weakening real interactions or error checks',()=>{
 assert.match(source,/await bootChoiceFixture\(page,width,bootEvents\);\s*await page\.evaluate\(\(\)=>window\.fixture\.palette\('dark','#c9aa52'\)\)/);
 assert.match(source,/page\.on\('pageerror',error=>\{errors\.push\(error\.message\);recordBootEvent\('pageerror',error\.message\)\}\)/);
 assert.match(source,/if\(bootEvents\.length>20\)bootEvents\.shift\(\)/);
 assert.match(source,/String\(message\)\.slice\(0,2000\)/);
 assert.match(source,/assert\.deepEqual\(errors,\[\]\)/);
 for(const contract of [
  "await page.keyboard.press('ArrowRight')", "await count.press('Enter')", "await owner.press('ArrowDown')",
  "await expect(activeOption).toBeEnabled()", "await sheetCount.press('Escape')", "await expect(owner).toBeDisabled()",
  "await page.getByRole('button',{name:'Save choices'}).click()", "assert.deepEqual(await page.evaluate(()=>window.formValues)",
  "assert.equal(enabled.bg,enabled.expected)", "assert.notEqual(enabled.bg,disabled.bg)", "await expect(send).toBeDisabled()",
  "for(const material of ['ios','android'])for(const theme of ['light','dark'])for(const color of ['#c9aa52','#d24978','#627bf0'])",
 ])assert.ok(source.includes(contract),contract);
 assert.doesNotMatch(source,/force\s*:\s*true|waitForTimeout|setTimeout|flushSync|\.selectOption\(/);
});
