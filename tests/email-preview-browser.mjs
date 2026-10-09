import './test-environment-guard.mjs';
// Headless local fictional email previews only; outbound requests are forbidden.
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {notificationEmail} from '../backend/src/family-update-email.mjs';
import {EMAIL_FONT_ASSETS} from '../backend/src/family-email-theme.mjs';
const root=resolve('docs/family-email-preview'),output=resolve(process.env.GW_EMAIL_QA_OUTPUT||'../email-preview-evidence');
const fixtures=JSON.parse(await readFile(root+'/fixtures.json','utf8')).fixtures;
const server=createServer(async(req,res)=>{
 try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root+'/'))throw Error('path');const body=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.json':'application/json','.ttf':'font/ttf','.png':'image/png','.txt':'text/plain; charset=utf-8'})[extname(path)]||'application/octet-stream');res.end(body)}catch{res.statusCode=404;res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,results=[],errors=[],outbound=[];let browser;
try{
 await mkdir(output,{recursive:true});browser=await chromium.launch({headless:true,...(process.env.GW_EMAIL_CHROMIUM_PATH?{executablePath:process.env.GW_EMAIL_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({reducedMotion:'reduce'});await context.route('**/*',async route=>{if(route.request().url().startsWith(base+'/'))await route.continue();else{outbound.push(route.request().url());await route.abort()}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const inspect=async(fixture,width,fallback=false)=>{
  const id=fixture.id+(fallback?'-fallback':'');await page.setViewportSize({width,height:1000});await page.goto(`${base}/${id}.html`);await page.evaluate(()=>document.fonts.ready);
  await expect(page.getByRole('heading',{level:1})).toHaveText(fixture.subject);await expect(page.getByRole('link',{name:'Open family app'})).toHaveAttribute('href','https://greenwhitefamily.com/');
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,fonts:[...document.fonts].map(x=>({family:x.family,status:x.status})),tables:[...document.querySelectorAll('table')].every(x=>x.getAttribute('role')==='presentation'),images:[...document.images].map(x=>x.complete&&x.naturalWidth>0)}));
  assert.equal(geometry.overflow,false,`${id} ${width} overflow`);assert.equal(geometry.tables,true);assert.ok(geometry.images.every(Boolean));
  if(!fallback){const name=fixture.headingFont==='sans'?'Momo Trust Display':'DM Serif Text';assert.ok(geometry.fonts.some(x=>x.family===name&&x.status==='loaded'),`${id} heading font`);assert.ok(geometry.fonts.some(x=>x.family==='Inter'&&x.status==='loaded'))}else{assert.equal(geometry.fonts.length,0);assert.equal(geometry.images.length,0)}
  await page.getByRole('link',{name:'Open family app'}).focus();assert.equal(await page.evaluate(()=>document.activeElement.tagName),'A');
  results.push({id,width,overflow:false,fontsLoaded:!fallback,fallback,linksChecked:true});
  await page.evaluate(()=>document.activeElement.blur());
  if(width===390&&['green-light-sans-notification','green-dark-sans-announcement','blue-dark-serif-announcement','yellow-light-sans-notification'].includes(fixture.id))await page.screenshot({path:`${output}/${id}-${width}.png`,fullPage:true});
 };
 for(const fixture of fixtures)for(const width of [320,800])await inspect(fixture,width);
 for(const fixture of fixtures.filter(x=>['green','yellow'].includes(x.name)))await inspect(fixture,390,true);
 for(const id of ['green-light-sans-notification','green-dark-sans-announcement','blue-dark-serif-announcement','yellow-light-sans-notification'])await inspect(fixtures.find(x=>x.id===id),390);
 // Long unbroken copy and markup-like text cannot widen the fluid email or create active HTML.
 const stress=notificationEmail({title:'Family'.repeat(40),preview:'Long fictional copy',paragraphs:['A'.repeat(250),'<img src=x onerror="bad()"> is literal sample text.'],action:{label:'Read'.repeat(30),url:'https://greenwhitefamily.com'}});
 let stressHTML=stress.html.replaceAll('https://greenwhitefamily.com/tree-artwork.png',base+'/assets/tree-artwork.png');for(const [name,font]of Object.entries(EMAIL_FONT_ASSETS))stressHTML=stressHTML.replaceAll(font.url,base+`/assets/${name}.ttf`);
 await page.setViewportSize({width:320,height:1000});await page.setContent(stressHTML);await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('[onerror]').count(),0);results.push({id:'long-copy-and-escaped-markup',width:320,overflow:false});
 await page.setViewportSize({width:1280,height:1000});await page.goto(base+'/index.html');await page.getByLabel('Content',{exact:true}).selectOption('announcement');await page.getByLabel('Heading',{exact:true}).selectOption('serif');await page.getByLabel('Accent',{exact:true}).selectOption('blue');await page.getByLabel('Appearance',{exact:true}).selectOption('dark');await expect(page.locator('iframe')).toHaveAttribute('src','blue-dark-serif-announcement.html');await page.getByLabel('Client fallback',{exact:true}).selectOption('-fallback');await expect(page.locator('iframe')).toHaveAttribute('src','green-dark-serif-announcement-fallback.html');await expect(page.getByRole('link',{name:'Plain text'})).toHaveAttribute('href','green-dark-serif-announcement.txt');
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 await writeFile(output+'/results.json',JSON.stringify({engine:'local-headless-chromium',fictional:true,mailboxClientValidation:false,sends:0,outboundRequests:outbound.length,errors,results,selectorChecks:true},null,2)+'\n');console.log(`Email preview PASS: ${results.length} render checks, selector checks, zero overflow/errors/outbound requests/sends. Mailbox clients and native Safari not tested.`);
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
