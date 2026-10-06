// Hosted-only isolated component fixture: no production identity, API writes,
// device permission grants, actual installation, or notification subscription.
import {chromium,webkit,expect} from '@playwright/test';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw new Error('Help browser QA runs only in the authorized hosted CI environment.');
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AppContext,Button,Sheet,GlassSystem}from'./src/ui-core.jsx';import{InstallGuide}from'./src/install.jsx';import{Tutorial}from'./src/tutorial.jsx';import{profilePalette}from'./src/profile-model.js';
function Fixture(){const[sheet,setSheet]=useState(null),[platform,setPlatform]=useState('ios'),[account,setAccount]=useState('fixture-a');window.fixture={account:setAccount,theme:(theme,color)=>{document.documentElement.dataset.theme=theme;for(const[k,v]of Object.entries(profilePalette(color,theme)))document.documentElement.style.setProperty(k,v)},material:value=>{document.documentElement.dataset.platform=value;setPlatform(value)}};const context={platform,state:{mode:'live',selfId:account},route:{type:'home'},data:{pending:false},openSheet:setSheet,go:route=>{window.lastRoute=route;setSheet(null)}};return <AppContext.Provider value={context}>{platform==='ios'&&<GlassSystem/>}<main><h1>Isolated help fixture</h1><textarea aria-label="Preserved draft" defaultValue="An unsent family update"/><Button onClick={()=>setSheet({type:'install'})}>Install help</Button><Button onClick={()=>setSheet({type:'tutorial'})}>Quick guide</Button></main>{sheet&&<Sheet title={sheet.type==='install'?'Add to Homescreen':'Find your way around'} onClose={()=>setSheet(null)}>{sheet.type==='install'?<InstallGuide/>:<Tutorial key={account}/>}</Sheet>}</AppContext.Provider>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const bundle=await build({stdin:{contents:fixture,loader:'jsx',resolveDir:root},bundle:true,format:'iife',write:false,outfile:'fixture.js',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
const styles=(await Promise.all(['dist/style.css','dist/review.css','dist/liquid-glass-core.css','dist/ui-pass.css','dist/react-ui.css','src/choice-control.css','src/help.css','src/sheet-geometry.css'].map(file=>readFile(root+file,'utf8')))).join('\n');
const html=`<!doctype html><html data-theme="dark" data-platform="ios" data-device-os="apple" data-font="serif"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}\nmain{padding:24px;max-width:680px;margin:auto}main>.button{margin:12px}main textarea{width:100%}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`;
const browser=await(process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
const output=root+'docs/help-qa';await mkdir(output,{recursive:true});const results=[],errors=[],writes=[];
try{
 for(const width of [320,768]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const request=route.request();if(request.method()!=='GET')writes.push(request.url());if(request.url()==='http://help-fixture.local/')return route.fulfill({contentType:'text/html',body:html});if(request.url().endsWith('/tree-artwork.png'))return route.fulfill({contentType:'image/png',body:await readFile(root+'dist/tree-artwork.png')});return route.abort()});
  await page.goto('http://help-fixture.local/');
  for(const material of ['ios','android'])for(const theme of ['light','dark']){
   await page.evaluate(({material,theme})=>{window.fixture.material(material);window.fixture.theme(theme,'#627bf0')},{material,theme});
   await page.getByRole('button',{name:'Install help',exact:true}).click();await chooseRadio(page.getByRole('radio',{name:'Android',exact:true}));await expect(page.locator('.install-steps>li')).toHaveCount(3);
   await page.evaluate(()=>{window.promptCalls=0;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.promptCalls++};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event)});
   await expect(page.getByRole('button',{name:'Install Green & White'})).toBeVisible();await expect(page.locator('.install-steps>li')).toHaveCount(3);await page.getByRole('button',{name:'Install Green & White'}).click();assert.equal(await page.evaluate(()=>window.promptCalls),1);await expect(page.getByRole('status')).toContainText('install later');await expect(page.locator('.install-steps>li')).toHaveCount(3);
   await chooseRadio(page.getByRole('radio',{name:'iPhone / iPad',exact:true}));await expect(page.locator('.install-steps')).toContainText('Page Menu');await expect(page.locator('.install-steps')).toContainText('if that switch appears');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:output+'/install-'+width+'-'+material+'-'+theme+'.png',fullPage:true});
   await page.getByRole('button',{name:'Not now',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.getByRole('button',{name:'Quick guide',exact:true}).click();await chooseRadio(page.getByRole('radio',{name:'Messages',exact:true}));await expect(page.locator('.tutorial-topic')).toContainText('Start a private conversation');await page.screenshot({path:output+'/tutorial-'+width+'-'+material+'-'+theme+'.png',fullPage:true});await page.getByRole('button',{name:'I’ll explore on my own'}).click();await expect(page.getByLabel('Preserved draft')).toHaveValue('An unsent family update');
   results.push({width,material,theme,result:'passed'});
  }
  // Resume, reset, account isolation, Escape dismissal and a real navigation action.
  await page.getByRole('button',{name:'Quick guide',exact:true}).click();await page.getByRole('button',{name:'Start over',exact:true}).click();await page.getByRole('button',{name:'Next topic',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'Quick guide',exact:true}).click();await expect(page.getByRole('radio',{name:'Messages',exact:true})).toBeChecked();await page.evaluate(()=>window.fixture.account('fixture-b'));await expect(page.getByRole('radio',{name:'Home',exact:true})).toBeChecked();await page.getByRole('button',{name:'Explore Home',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.lastRoute),{type:'home'});await expect(page.getByLabel('Preserved draft')).toHaveValue('An unsent family update');
  // Failed prompt is consumed once and the guide remains usable. Appinstalled is a separate truth signal.
  await page.getByRole('button',{name:'Install help',exact:true}).click();await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{throw Error('fixture rejection')};window.dispatchEvent(e)});await page.getByRole('button',{name:'Install Green & White'}).click();await expect(page.getByRole('status')).toContainText('could not open');await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await expect(page.getByRole('button',{name:'Done',exact:true})).toBeVisible();await page.getByRole('button',{name:'Done',exact:true}).click();await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await writeFile(output+'/results.json',JSON.stringify({browser:process.env.GW_BROWSER||'chromium',results,errors,writes,physicalDeviceValidation:false},null,2));console.log('Help hosted fixture passed',results);
}catch(error){console.error(error);throw error}finally{await browser.close()}

async function chooseRadio(radio){await expect(radio).toBeEnabled();await radio.locator('..').click();await expect(radio).toBeChecked();}
