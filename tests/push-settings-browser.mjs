import './test-environment-guard.mjs';
// Isolated real PushDeviceSettings component. All auth, browser push APIs and
// API responses are fictional; no permission prompt or provider request occurs.
import {build} from 'esbuild';
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=resolve(process.env.GW_PUSH_QA_OUTPUT||'../push-fix-intake/push-settings-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium';
const endpoint='https://web.push.apple.com/fictional-offline-only',fingerprint=createHash('sha256').update(endpoint).digest('hex');
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PushDeviceSettings} from './src/push-device.jsx';import {FixtureProvider} from 'gw-push-fixture';function Fixture(){const [id,setId]=React.useState('alice');window.switchFixtureAccount=setId;return <FixtureProvider value={{state:{mode:'live',selfId:id},notifications:{settings:{globalOff:false}}}}><PushDeviceSettings/></FixtureProvider>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'isolated-context',setup(b){b.onResolve({filter:/^(gw-push-fixture|\.\/ui-core\.jsx)$/},()=>({path:'fixture-ui',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';const Context=React.createContext(null);export const FixtureProvider=Context.Provider;export const useApp=()=>React.useContext(Context);export function Button({children,secondary,icon,...props}){return <button {...props}>{children}</button>}export const Control=Button;export const Glyph=()=>null;`,loader:'jsx',resolveDir:process.cwd()}))}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?result.outputFiles[0].text:'<!doctype html><html><div id="fixture"></div><script src="/fixture.js"></script></html>')});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
let browser,responseMode='accepted',requests=[],errors=[],results=[];
try{
 browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_PUSH_CHROMIUM_PATH?{executablePath:process.env.GW_PUSH_CHROMIUM_PATH}:{})});
 const context=await browser.newContext();
 await context.addInitScript(({endpoint})=>{
  window.pushCalls={permission:0,subscribe:0,unsubscribe:0};
  window.Notification={permission:'granted',requestPermission(){window.pushCalls.permission++;throw Error('No permission prompt in passive fixture')}};
  window.PushManager=function(){};window.PushManager.prototype.subscribe=function(){};window.PushManager.prototype.getSubscription=function(){};
  window.ServiceWorkerRegistration=function(){};window.ServiceWorkerRegistration.prototype.showNotification=function(){};
  const registration={active:{},pushManager:{getSubscription:async()=>({endpoint,unsubscribe:async()=>{window.pushCalls.unsubscribe++}}),subscribe:async()=>{window.pushCalls.subscribe++;throw Error('No enrollment in fixture')}},getNotifications:async()=>[]};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>registration}});
 },{endpoint});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)throw Error('External request forbidden');
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const account=req.method()==='GET'?await route.request().frame().evaluate(()=>document.body.dataset.account||'alice'):req.postDataJSON()?.expectedAccountId;
  requests.push({path:url.pathname,method:req.method(),account});
  const json=(body,status=200)=>route.fulfill({status,json:body});
  if(url.pathname==='/api/me/push')return json({accountId:account,ready:true,keyVersion:'fixture-v1',publicKey:'BA'+'A'.repeat(85),pushEnabled:true,devices:[{id:'other-browser',endpointFingerprint:'0'.repeat(64),keyVersion:'fixture-v1'},{id:account+'-device',endpointFingerprint:fingerprint,keyVersion:'fixture-v1'}]});
  if(url.pathname==='/api/me/push/alice')throw Error('Incorrect device path');
  if(url.pathname==='/api/me/push/devices/alice-device/test'){
   if(responseMode==='accepted')return json({accountId:'alice',accepted:true});
   if(responseMode==='expired')return json({error:'This device subscription has expired. Enable push on this device again.',code:'push-subscription-expired',providerStatus:410,requestId:'12345678-1234-4234-8234-123456789abc'},410);
   return json({error:'The push provider rejected this device’s setup. Turn push off, then enable it again.',code:'push-provider-rejected',providerStatus:403,requestId:'12345678-1234-4234-8234-123456789abc'},503);
  }
  throw Error('Unexpected fictional API operation '+url.pathname);
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);const test=page.getByRole('button',{name:'Send test notification',exact:true});await expect(test).toBeVisible();await expect(page.getByText('Enabled for this signed-in session.',{exact:true})).toBeVisible();results.push('test restored for matching subscription on initial mount');
 await page.getByRole('button',{name:'Information about device notifications'}).click();await expect(page.getByText(/Names and message content stay hidden unless you turn on message previews for this device/)).toBeVisible();await page.getByRole('button',{name:'Information about device notifications'}).click();await expect(page.getByText(/Names and message content stay hidden unless you turn on message previews for this device/)).toBeHidden();results.push('information disclosure opens and closes');
 await test.click();await expect(page.getByText('Test accepted by the push provider. Check your device’s notification center.',{exact:true})).toBeVisible();results.push('explicit fixture test targets matching device with acceptance-only copy');
 await page.reload();await expect(test).toBeVisible();results.push('test restored after reload without enrollment');
 responseMode='rejected';await test.click();await expect(page.getByRole('alert')).toContainText('Reference: 12345678-1234-4234-8234-123456789abc');results.push('provider rejection keeps safe request reference');
 responseMode='expired';await test.click();await expect(page.getByRole('alert')).toContainText('subscription has expired');await expect(test).toHaveCount(0);await expect(page.getByText('Off on this device.',{exact:true})).toBeVisible();results.push('expired subscription hides test and marks device off');
 await page.evaluate(()=>{document.body.dataset.account='bob';window.switchFixtureAccount('bob')});await expect(test).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);assert.equal(requests.filter(r=>r.method==='POST').length,3);assert.ok(requests.filter(r=>r.method==='POST').every(r=>r.path.endsWith('/alice-device/test')&&r.account==='alice'));results.push('account switch clears old error and re-resolves owned device');
 assert.deepEqual(await page.evaluate(()=>window.pushCalls),{permission:0,subscribe:0,unsubscribe:0});assert.deepEqual(errors,[]);
 await mkdir(output,{recursive:true});await writeFile(output+'/'+engine+'-receipt.json',JSON.stringify({engine,results,requests,errors,permissionsRequested:0,enrollments:0,externalRequests:0,limits:'Real settings component with isolated context/native-button fixture and fictional push APIs. No live account, provider acceptance, device delivery or full-app layout proof.'},null,2));console.log('Push settings fixture PASS:',results.length,'checks; no permission, enrollment or external requests.');
}finally{await browser?.close();await new Promise(done=>server.close(done))}
