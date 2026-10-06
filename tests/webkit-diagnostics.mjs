// Diagnostic isolation only. The exact 30-second release regression is separate.
// Every case gets a fresh in-memory database, storage, browser and cookie jar.
import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createTestPng,inspectPng} from './png-fixtures.mjs';
const require=createRequire(import.meta.url),folder='docs/live-qa/webkit-diagnostics';
await mkdir(folder,{recursive:true});
const playwrightVersion=require('@playwright/test/package.json').version;
const browserManifest=JSON.parse(await readFile(new URL('../node_modules/playwright-core/browsers.json',import.meta.url),'utf8')).browsers.find(item=>item.name==='webkit');
const results=[],started=Date.now(),servers=new Set(),browsers=new Set();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeHeaders=headers=>Object.fromEntries(Object.entries(headers).filter(([name])=>['content-type','content-length','cache-control','content-security-policy','etag','last-modified','location'].includes(name.toLowerCase())));
const summary=record=>({case:record.name,outcome:record.status,phase:record.phase,elapsedMs:record.elapsedMs,lastLifecycle:record.events.filter(event=>event.type==='document-lifecycle').at(-1),documentResponse:record.events.filter(event=>event.type==='response'&&event.headers?.['content-type']?.includes('text/html')).at(-1),stalledRequests:record.inflightRequests?.map(request=>({url:request.url,resource:request.resource})),error:record.error?.split('\n')[0],browserVersion:record.browserVersion,serviceWorkers:record.platform?.serviceWorkerRegistrations});
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out after '+ms+'ms')),ms)})])}finally{clearTimeout(timer)}}
async function persist(){await writeFile(folder+'/results.json',JSON.stringify({playwrightVersion,browserManifest,elapsedMs:Date.now()-started,results},null,2))}
const hardDeadline=setTimeout(async()=>{for(const server of servers)server.kill('SIGKILL');await persist().catch(()=>{});process.exit(1)},290000);
const cases=[
 {name:'baseline-home',kind:'home'},
 {name:'baseline-empty-gallery',kind:'empty'},
 {name:'private-image-only-no-app',kind:'plain'},
 {name:'api-memory-no-modal-no-retry',kind:'api'},
 {name:'api-memory-retry-no-modal',kind:'api',retry:true},
 {name:'ui-upload-no-retry-close',kind:'ui'},
 {name:'exact-upload-retry-close',kind:'ui',retry:true},
 {name:'exact-with-external-fonts-blocked',kind:'ui',retry:true,noFonts:true},
 {name:'exact-with-service-workers-blocked',kind:'ui',retry:true,noWorkers:true},
];
try {
 for(const [index,scenario] of cases.entries()){
  const record={name:scenario.name,scenario,events:[],media:[],startedAt:new Date().toISOString(),status:'running',phase:'start'},t0=Date.now(),pending=new Map();
  results.push(record);let server,browser,page,requestId=0;const ids=new WeakMap();
  const log=(type,detail={})=>record.events.push({ms:Date.now()-t0,type,...detail});
  const task=async()=>{
   const port=4370+index,origin=`http://127.0.0.1:${port}`;
   record.origin=origin;
   server=spawn(process.execPath,['backend/tests/fixture-server.mjs'],{env:{...process.env,GW_FIXTURE_PORT:String(port)},stdio:['ignore','pipe','pipe']});servers.add(server);
   server.stdout.on('data',data=>log('fixture-stdout',{text:data.toString().slice(0,1000)}));server.stderr.on('data',data=>log('fixture-stderr',{text:data.toString().slice(0,1000)}));
   for(let n=0;n<25;n++){try{const response=await fetch(origin+'/api/config',{signal:AbortSignal.timeout(300)});if(response.ok)break}catch{}if(n===24)throw new Error('Fresh fixture failed to start');await sleep(100)}
   browser=await webkit.launch({headless:true,timeout:7000});browsers.add(browser);record.browserVersion=browser.version();
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:scenario.noWorkers?'block':'allow'});
   page=await context.newPage();page.setDefaultTimeout(6500);page.setDefaultNavigationTimeout(8000);
   page.on('request',request=>{const id=++requestId;ids.set(request,id);const detail={id,url:request.url(),method:request.method(),resource:request.resourceType(),navigation:request.isNavigationRequest()};pending.set(id,detail);log('request',detail)});
   page.on('response',response=>log('response',{id:ids.get(response.request()),url:response.url(),status:response.status(),headers:safeHeaders(response.headers())}));
   page.on('requestfinished',request=>{pending.delete(ids.get(request));log('request-finished',{id:ids.get(request),url:request.url()})});
   page.on('requestfailed',request=>{pending.delete(ids.get(request));log('request-failed',{id:ids.get(request),url:request.url(),error:request.failure()?.errorText})});
   page.on('framenavigated',frame=>{if(frame===page.mainFrame())log('main-frame-navigated',{url:frame.url()})});
   page.on('domcontentloaded',()=>log('playwright-domcontentloaded'));page.on('load',()=>log('playwright-load'));page.on('crash',()=>log('renderer-crash'));page.on('pageerror',error=>log('page-error',{error:error.message}));
   page.on('console',message=>{const text=message.text();if(text.startsWith('__GW_LIFECYCLE__')){try{log('document-lifecycle',JSON.parse(text.slice('__GW_LIFECYCLE__'.length)))}catch{log('document-console',{text})}}});
   await context.addInitScript(()=>{
    localStorage.setItem('gw-platform','ios');
    const emit=event=>console.log('__GW_LIFECYCLE__'+JSON.stringify({event,url:location.href,timeOrigin:performance.timeOrigin,readyState:document.readyState}));
    emit('new-document-init');for(const name of ['beforeunload','pagehide','pageshow','DOMContentLoaded','load'])addEventListener(name,()=>emit(name));
   });
   if(scenario.noFonts){await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:'/* diagnostic: external font dependency removed */'}));await page.route('https://fonts.gstatic.com/**',route=>route.abort('blockedbyclient'))}
   const signIn=await context.request.get(origin+'/__test/signin?user=alice');assert.equal(signIn.status(),200);
   const bytes=createTestPng(),integrity=inspectPng(bytes);record.fixture={width:integrity.width,height:integrity.height,crcValid:true,sha256:createHash('sha256').update(bytes).digest('hex')};
   let mediaPath='',failedMedia=false,retried=0;
   if(scenario.retry)await page.route('**/api/media/*',route=>{if(route.request().method()==='GET'){const url=new URL(route.request().url());if(url.searchParams.has('_gw_retry'))retried++;if(!failedMedia){failedMedia=true;log('synthetic-media-503',{url:url.href});return route.fulfill({status:503,json:{error:'Synthetic transient storage failure'}})}}return route.continue()});
   if(['api','plain'].includes(scenario.kind)){
    const upload=await context.request.post(origin+'/api/media',{headers:{Origin:origin},multipart:{file:{name:'diagnostic.png',mimeType:'image/png',buffer:bytes}}});assert.equal(upload.status(),201,await upload.text());const media=await upload.json();mediaPath=media.url;
    if(scenario.kind==='api'){const memory={id:randomUUID(),title:'Diagnostic memory',image:mediaPath,mediaType:'image/png',authorId:'alice',category:'',tags:[],memberIds:[],event:'',year:'',milestone:''};const command=await context.request.post(origin+'/api/commands',{headers:{Origin:origin},data:{type:'ADD_MEMORY',requestId:randomUUID(),memory}});assert.equal(command.status(),200,await command.text())}
   }
   record.phase='load-before-action';
   if(scenario.kind==='plain')await page.route(origin+'/__diagnostic-image-document',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><img id="diagnostic-image" src="${mediaPath}" alt="Private image without app layers"></body></html>`}));
   await page.goto(origin+(scenario.kind==='api'?'/#/family?tab=memories':scenario.kind==='plain'?'/__diagnostic-image-document':'/'));
   if(scenario.kind!=='plain')await page.getByRole('navigation',{name:'Main navigation'}).waitFor();
   record.platform=await page.evaluate(async()=>({userAgent:navigator.userAgent,serviceWorkerController:navigator.serviceWorker?.controller?.scriptURL||null,serviceWorkerRegistrations:navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).map(r=>r.scope):[],readyState:document.readyState}));
   if(['ui','empty'].includes(scenario.kind)){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Family',exact:true}).click();await page.getByRole('tab',{name:'Memories',exact:true}).click()}
   if(scenario.kind==='ui'){
    record.phase='upload-and-modal';const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add a memory',exact:true}).click();await(await chooser).setFiles({name:'diagnostic.png',mimeType:'image/png',buffer:bytes});
    await page.getByText('Your memory is saved. Add any details you know, or close this window.').waitFor();
    await page.waitForFunction(()=>{const image=document.querySelector('dialog[open] .image-upload-preview img');return image?.complete&&image.naturalWidth===1});
    mediaPath=new URL(await page.locator('dialog[open] .image-upload-preview img').getAttribute('src'),origin).pathname;
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
   }
   if(mediaPath){
    record.phase='decoded-before-reload';
    await page.waitForFunction(path=>[...document.images].some(image=>new URL(image.src,location.href).pathname===path&&image.complete&&image.naturalWidth===1),mediaPath);
    const response=await context.request.get(origin+mediaPath),body=await response.body();assert.equal(response.status(),200);assert.deepEqual(body,bytes);inspectPng(body);record.media.push({url:mediaPath,status:response.status(),headers:safeHeaders(response.headers()),size:body.length,sha256:createHash('sha256').update(body).digest('hex'),crcValid:true});
   }
   if(scenario.retry){assert.equal(failedMedia,true);assert.ok(retried>0);await page.unroute('**/api/media/*')}
   record.retried=retried;record.before=await page.evaluate(()=>({url:location.href,readyState:document.readyState,images:[...document.images].map(image=>({src:image.getAttribute('src'),complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})),filters:document.querySelectorAll('filter').length,gallery:document.querySelector('.field-memory-gallery')?.getBoundingClientRect().toJSON()}));
   await page.screenshot({path:`${folder}/${scenario.name}-before.png`,timeout:1500}).catch(error=>log('before-screenshot-failed',{error:error.message}));
   await writeFile(`${folder}/${scenario.name}-before.json`,JSON.stringify(record,null,2));
   record.phase='reload-wait-for-commit';log('reload-start');
   const response=await page.reload({waitUntil:'commit',timeout:10000});log('reload-committed',{status:response?.status(),url:response?.url()});assert.equal(response?.status(),200);
   record.phase='reload-wait-for-domcontentloaded';await page.waitForLoadState('domcontentloaded',{timeout:10000});log('reload-domcontentloaded');
   record.phase='reload-wait-for-app';if(scenario.kind!=='plain')await page.getByRole('navigation',{name:'Main navigation'}).waitFor();
   if(mediaPath)await page.waitForFunction(path=>[...document.images].some(image=>new URL(image.src,location.href).pathname===path&&image.complete&&image.naturalWidth===1),mediaPath);
   record.status='passed';record.phase='complete';
  };
  try{await bounded(task(),29000,'Diagnostic case')}catch(error){record.status='failed';record.error=error.stack||error.message;record.inflightRequests=[...pending.values()];console.error('WEBKIT DIAGNOSTIC',scenario.name,record.phase,error.message)}
  record.elapsedMs=Date.now()-t0;await writeFile(`${folder}/${scenario.name}.json`,JSON.stringify(record,null,2));await persist();
  if(server){server.kill('SIGKILL');servers.delete(server)}
  if(browser){await bounded(browser.close(),1500,'Browser shutdown').catch(error=>log('browser-close-failed',{error:error.message}));browsers.delete(browser)}
  await persist();console.log('WEBKIT DIAGNOSTIC RESULT',JSON.stringify(summary(record)));
 }
} finally {
 clearTimeout(hardDeadline);for(const server of servers)server.kill('SIGKILL');await persist();
}
console.log('WEBKIT DIAGNOSTIC SUMMARY',JSON.stringify({playwrightVersion,browserManifest,results:results.map(summary)}));
// A hung renderer transport cannot keep this bounded hosted diagnostic alive.
process.exit(results.every(result=>result.status==='passed')?0:1);
