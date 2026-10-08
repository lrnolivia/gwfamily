// Ordinary built app, fictional anonymous session, no remote API or writes.
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('dist'),output=resolve(process.env.GW_ONBOARDING_QA_OUTPUT||'../push-fix-intake/onboarding-source-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',results=[],writes=[],externalBlocked=[],errors=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error('path');const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(data)}catch{res.statusCode=404;res.end('Not found')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let browser;
try{
 await mkdir(output,{recursive:true});browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_ONBOARDING_CHROMIUM_PATH?{executablePath:process.env.GW_ONBOARDING_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base){externalBlocked.push(url.origin);return route.abort()}if(!['GET','HEAD'].includes(request.method())){writes.push(url.pathname);return route.abort()}if(url.pathname==='/api/config')return route.fulfill({json:{configured:true,email:true,providers:[]}});if(url.pathname==='/api/session')return route.fulfill({json:{status:'anonymous',signedIn:false,configured:true}});if(url.pathname.startsWith('/api/'))throw Error('Unexpected anonymous API read '+url.pathname);return route.continue()});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('gw-font','serif');localStorage.setItem('gw-theme','light');localStorage.setItem('gw-platform','ios')});
 for(const [width,height]of [[430,780],[1280,1000],[375,600]]){
  await page.setViewportSize({width,height});await page.goto(base+'/');await expect(page.getByRole('button',{name:'Email me a code',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Good to see you',exact:true})).toHaveCount(0);
  const geometry=await page.evaluate(()=>{
   const frame=document.querySelector('.onboarding-frame'),card=frame?.querySelector(':scope > .onboard.card'),preview=frame?.querySelector(':scope > .onboarding-preview-button'),mark=card?.querySelector('.wordmark'),form=card?.querySelector('.sign-in-form');
   if(!frame||!card||!preview||!mark||!form)return null;
   const a=card.getBoundingClientRect(),b=preview.getBoundingClientRect(),f=frame.getBoundingClientRect();return {display:getComputedStyle(frame).display,top:a.top-f.top,bottom:f.bottom-b.bottom,groupHeight:b.bottom-a.top,frameHeight:f.height,previewOutside:preview.parentNode===frame,overflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(mark).fontFamily,rootFont:document.documentElement.dataset.font,separator:getComputedStyle(form).borderTopWidth};
  });
  assert.ok(geometry,'Ordinary source includes onboarding frame and outside preview');assert.equal(geometry.display,'flex');assert.equal(geometry.previewOutside,true);assert.equal(geometry.overflow,false);assert.equal(geometry.separator,'0px');assert.match(geometry.font,/Momo Trust Display/);assert.equal(geometry.rootFont,'serif');
  if(geometry.groupHeight+32<=height)assert.ok(Math.abs(geometry.top-geometry.bottom)<=2,JSON.stringify(geometry));else assert.ok(geometry.top>=15&&geometry.top<=17,JSON.stringify(geometry));
  await page.getByRole('button',{name:'Explore the preview',exact:true}).focus();await expect(page.getByRole('button',{name:'Explore the preview',exact:true})).toBeFocused();
  await page.screenshot({path:output+'/'+engine+'-'+width+'x'+height+'.png',fullPage:false});results.push({width,height,...geometry});
 }
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);await writeFile(output+'/'+engine+'-receipt.json',JSON.stringify({engine,ordinarySource:true,fictionalAnonymousSession:true,results,writes,errors,externalRequestsBlocked:[...new Set(externalBlocked)],limits:'Headless source geometry; no actual iOS Safari, mail, push, enrollment or delivery proof.'},null,2));console.log('Onboarding source PASS:',results.length,'viewports, Momo override preserves root font, preview outside, no writes/errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
