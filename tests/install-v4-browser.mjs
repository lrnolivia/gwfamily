// Actual built app with fictional preview data and normal UI interaction only.
// No physical install, push permission/subscription, sends or external writes.
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import assert from 'node:assert/strict';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {profilePalette} from '../src/profile-model.js';
import {THEME_PRESETS} from '../src/theme-presets.js';import {interfacePreset} from '../src/interface-accent.js';
const root=resolve('dist'),output=resolve(process.env.GW_V4_QA_OUTPUT||'docs/install-v4-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',errors=[],writes=[],results=[],loaded=new Set();
const manifest=JSON.parse(await readFile('docs/install-guide/approved-v4/manifest.json','utf8'));
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
async function chooseRadio(radio){await radio.focus();await radio.press('Space');await expect(radio).toBeChecked()}
const cases=[
 {device:'ios',width:390,height:844,ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',navPlatform:'iPhone'},
 {device:'ipad',width:820,height:1180,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',navPlatform:'MacIntel'},
 {device:'android',width:390,height:844,ua:'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',navPlatform:'Linux armv8l'},
 {device:'androidTablet',width:1000,height:800,ua:'Mozilla/5.0 (Linux; Android 16; Pixel Tablet) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',navPlatform:'Linux armv8l'}
];
try{
 await mkdir(output,{recursive:true});browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_CONSOLIDATED_CHROMIUM_PATH?{executablePath:process.env.GW_CONSOLIDATED_CHROMIUM_PATH}:{})});
 for(const item of cases){
  const context=await browser.newContext({viewport:{width:item.width,height:item.height},userAgent:item.ua,permissions:[],serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(url.pathname);return route.abort()}if(url.pathname==='/api/config')return route.fulfill({json:{configured:false,email:false,providers:[],pushEnrollmentPrompt:false}});if(url.pathname==='/api/session')return route.fulfill({json:{signedIn:false,configured:false}});if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);if(url.pathname.includes('/approved-v4/screens/'))loaded.add(url.pathname.split('/').pop());return route.continue()});
  const state={...initialState(),onboarding:'done',previewRoleView:'member'};state.members=state.members.map((m,i)=>({...m,name:'Fixture Person '+i,photo:null,profileColor:m.id===state.selfId?'#cc8844':m.profileColor}));
  await context.addInitScript(({key,state,item})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-platform',item.device.startsWith('android')?'android':'ios');localStorage.setItem('gw-theme','light');localStorage.setItem('gw-personal-themes','off')}Object.defineProperty(navigator,'platform',{value:item.navPlatform});Object.defineProperty(navigator,'maxTouchPoints',{value:5});Object.defineProperty(navigator,'userAgentData',{value:undefined})},{key:PREVIEW_KEY,state,item});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  for(const theme of ['light','dark'])for(const choice of [{id:'default',label:'Default',color:null},...THEME_PRESETS]){
   await page.goto(base+'/#/appearance');const appearance=page.locator('.appearance-page');await expect(appearance).toBeVisible();await chooseRadio(appearance.getByRole('group',{name:'Color theme',exact:true}).getByRole('radio',{name:theme==='light'?'Light':'Dark',exact:true}));
   if(choice.id==='default')await chooseRadio(appearance.getByRole('group',{name:'Interface colors',exact:true}).getByRole('radio',{name:'Default',exact:true}));else await appearance.getByRole('button',{name:choice.label,exact:true}).click();
   await page.goto(base+'/#/install');await expect(page.locator('.install-guide')).toBeVisible();const images=page.locator('.install-mobile-visual img'),count=manifest.deviceStepCounts[item.device];await expect(page.locator('.install-steps>li')).toHaveCount(count);await expect(images).toHaveCount(count);
   for(let i=0;i<count;i++)await expect(images.nth(i)).toHaveAttribute('src',`install-guide/approved-v4/screens/${choice.id}-${item.device}-${theme}-${i+1}.png`);
   await expect.poll(()=>images.evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
   const geometry=await images.evaluateAll(imgs=>imgs.map(img=>{const r=img.getBoundingClientRect(),s=getComputedStyle(img);return {natural:[img.naturalWidth,img.naturalHeight],ratio:r.width/r.height,naturalRatio:img.naturalWidth/img.naturalHeight,filter:s.filter,mask:s.maskImage,fit:s.objectFit,parentHeight:img.parentElement.getBoundingClientRect().height,height:r.height}}));
   for(const g of geometry){assert.equal(g.natural[1],item.device==='ios'||item.device==='android'?360:440);assert.ok(Math.abs(g.ratio-g.naturalRatio)<.01);assert.equal(g.filter,'none');assert.equal(g.mask,'none');assert.notEqual(g.fit,'cover');assert.ok(g.parentHeight-g.height<30,'No tall legacy wrapper');}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(choice.id==='default'){
    await expect(page.locator('.install-steps')).toContainText(item.device==='ios'?'Page Menu':item.device==='ipad'?'Share':'More');
    const alpha=await images.first().evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const p=x.getImageData(0,0,c.width,c.height).data;let low=255,high=0,partial=false;for(let i=3;i<p.length;i+=4){low=Math.min(low,p[i]);high=Math.max(high,p[i]);if(p[i]>0&&p[i]<255)partial=true}return {low,high,partial}});assert.deepEqual(alpha,{low:0,high:255,partial:true});
    const header=await page.locator('.header-actions').evaluate(node=>[...node.children].map(n=>{const target=n.matches('.profile-options-trigger')?n.querySelector('button'):n;const r=target.getBoundingClientRect();return {width:r.width,height:r.height,cy:r.y+r.height/2}}));assert.equal(header.length,3);for(const h of header){assert.ok(Math.abs(h.width-44)<1&&Math.abs(h.height-44)<1);assert.ok(Math.abs(h.cy-header[0].cy)<1)}
    await page.screenshot({path:output+'/'+engine+'-'+item.device+'-'+theme+'.png',fullPage:true});
   }
  }
  // Material choice must not change detected native artwork.
  await page.goto(base+'/#/appearance');await chooseRadio(page.getByRole('group',{name:'Interface style',exact:true}).getByRole('radio',{name:item.device.startsWith('android')?'Glass':'Flat',exact:true}));await page.goto(base+'/#/install');await expect(page.locator('.install-mobile-visual img').first()).toHaveAttribute('src',`install-guide/approved-v4/screens/stone-${item.device}-dark-1.png`);
  await page.goto(base+'/#/appearance');await page.getByLabel('Show personal colors on profiles').uncheck();await page.reload();await expect(page.getByLabel('Show personal colors on profiles')).not.toBeChecked();await page.getByLabel('Show personal colors on profiles').check();await chooseRadio(page.getByRole('group',{name:'Interface colors',exact:true}).getByRole('radio',{name:'Profile',exact:true}));
  await page.goto(base+'/#/edit-profile');await expect(page.getByLabel('Custom profile color',{exact:true})).toHaveValue('#cc8844');await expect(page.getByText(/interface uses the closest of the eight GW colors/)).toBeVisible();assert.equal(await page.locator('html').evaluate(n=>n.style.getPropertyValue('--accent')),profilePalette(interfacePreset('#cc8844').color,'dark')['--accent']);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.members.find(m=>m.id===JSON.parse(localStorage.getItem(key)).state.selfId).profileColor,PREVIEW_KEY);assert.equal(saved,'#cc8844');
  results.push({device:item.device,stepCount:manifest.deviceStepCounts[item.device],accents:9,themes:2,oppositeMaterialNativeIdentity:true,alphaAndIntrinsicHeight:true,avatar44AndAligned:true,personalColorsOptOutRetained:true,customProfileRetained:true});await context.close();
 }
 const desktop=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});await desktop.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());const page=await desktop.newPage();await page.goto(base+'/#/install');await expect(page.locator('.install-guide')).toHaveCount(0);await desktop.close();
 assert.equal(loaded.size,234);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);const receipt={engine,results,pngFilesLoaded:loaded.size,noExternalWrites:true,physicalDeviceInstallation:false,notificationDelivery:false,errors};await writeFile(output+'/'+engine+'-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({pass:true,...receipt}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
