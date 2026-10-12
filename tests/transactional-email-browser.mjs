import './test-environment-guard.mjs';
// Fictional transactional emails rendered in a local page only. Outbound
// requests are blocked except the public font/oak assets, which the
// fallback pass blocks too. Nothing is sent.
import {chromium,webkit,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
import {signInCodeEmail,signInLinkEmail,familyInviteEmail,householdInviteEmail} from '../backend/src/transactional-email.mjs';
const engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_TRANSACTIONAL_EMAIL_QA_OUTPUT||'docs/transactional-email-qa',results=[],errors=[];
const origin='https://greenwhitefamily.com';
const mails={code:signInCodeEmail('482913'),link:signInLinkEmail(origin+'/api/auth/magic-link/verify?token=fictional-only'),family:familyInviteEmail({url:origin+'/#/family-invite/'+'a'.repeat(64)}),household:householdInviteEmail({householdName:'Fictional Oak household with a long, long name for wrapping',url:origin+'/#/household-invite/'+'b'.repeat(64)})};
const oak=await readFile(new URL('../dist/tree-artwork.png',import.meta.url));
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
try{
 for(const fallback of [false,true])for(const scheme of ['light','dark'])for(const width of [320,390,800]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  // Full pass may fetch only the public brand assets; fallback blocks everything.
  await context.route('**/*',route=>{const url=route.request().url();if(!fallback&&url==='https://greenwhitefamily.com/tree-artwork.png')return route.fulfill({status:200,contentType:'image/png',body:oak});if(!fallback&&url.startsWith('https://fonts.gstatic.com/'))return route.fulfill({status:204,body:''});return url.startsWith('data:')||url==='about:blank'?route.continue():route.abort()});
  for(const [name,mail] of Object.entries(mails)){
   await page.setContent(mail.html,{waitUntil:'domcontentloaded'});
   await expect(page.getByRole('heading',{level:1})).toBeVisible();
   const g=await page.evaluate(()=>{const table=document.querySelector('table.gw-surface'),cell=table.rows[0].cells[0],t=getComputedStyle(table),c=getComputedStyle(cell),bg=c.backgroundColor,ink=getComputedStyle(document.querySelector('h1')).color;return {overflow:document.documentElement.scrollWidth>innerWidth,bg,ink,radius:[t,c].flatMap(s=>[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius]),borderCollapse:t.borderCollapse,background:getComputedStyle(document.body).backgroundColor,tableBackground:t.backgroundColor}});
   assert.equal(g.overflow,false,`${name} ${scheme} ${width}: no horizontal scroll`);
   assert.deepEqual(g.radius,Array(8).fill('24px'),`${name}: all table/cell corners`);assert.equal(g.borderCollapse,'separate');assert.equal(g.tableBackground,g.bg,`${name}: dark mode changes both fills together`);
   const png=PNG.sync.read(await page.locator('table.gw-surface').screenshot()),pixel=(x,y)=>[...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3)],background=g.background.match(/\d+/g).map(Number);
   for(const [x,y] of [[1,1],[png.width-2,1],[1,png.height-2],[png.width-2,png.height-2]])assert.deepEqual(pixel(x,y),background,`${name} ${scheme} ${width}: painted rounded corner`);
   assert.deepEqual(pixel(Math.floor(png.width/2),1),g.bg.match(/\d+/g).map(Number),`${name}: center surface fill`);
   const lum=c=>{const [r,g2,b]=c.match(/\d+/g).map(Number);return .2126*r+.7152*g2+.0722*b};
   if(scheme==='dark')assert.ok(lum(g.bg)<lum(g.ink),`${name}: dark mode uses a dark surface`);else assert.ok(lum(g.bg)>lum(g.ink),`${name}: light surface`);
   if(name==='code')await expect(page.getByText('482913')).toBeVisible();else await expect(page.getByRole('link',{name:/Sign in to Green & White|View invitation/})).toBeVisible();
   if(width===390&&!fallback)await page.screenshot({path:`${output}/${engine}-${name}-${scheme}-390.png`,fullPage:true});
  }
  await context.close();
 }
 results.push('4 templates x light/dark x 320/390/800 x fonts on/off: four painted rounded corners match the background, no overflow, readable surfaces, actions visible');
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors,sends:0},null,1))}
console.log(engine+' transactional email: '+results.join('; '));
