// Run only on the authorized hosted executor. This fixture uses no production
// data, no external APIs, and cannot send a post or change a family record.
import {chromium,webkit,expect} from '@playwright/test';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw new Error('Choice browser QA runs only in the authorized hosted CI environment.');
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ChoiceControl} from './src/choice-control.jsx';import {profilePalette} from './src/profile-model.js';
function Fixture(){
 const [plan,setPlan]=useState('Coming'),[count,setCount]=useState('3'),[owner,setOwner]=useState(''),[disabled,setDisabled]=useState(false),[sent,setSent]=useState(0),[text,setText]=useState(''),[submits,setSubmits]=useState(0),[busy,setBusy]=useState(false);
 window.fixture={disable:setDisabled,busy:setBusy,palette:(theme,color)=>{Object.assign(document.documentElement.style,{});for(const [key,value] of Object.entries(profilePalette(color,theme)))document.documentElement.style.setProperty(key,value);document.documentElement.dataset.theme=theme},material:material=>document.documentElement.dataset.platform=material};
 return <main><h1>Choice controls</h1><p>Isolated keyboard and contrast fixture.</p><form onSubmit={e=>{e.preventDefault();setSubmits(n=>n+1);window.formValues=Object.fromEntries(new FormData(e.currentTarget));}}>
 <ChoiceControl label="Your plans" name="plans" value={plan} onChange={setPlan} options={['Coming','Deciding','Cannot come']} required/>
 <ChoiceControl label="How many people?" name="count" value={count} onChange={setCount} options={Array.from({length:20},(_,i)=>i+1)}/>
 <ChoiceControl label="New owner" variant="search" name="owner" value={owner} onChange={setOwner} disabled={disabled} required options={[{value:'one',label:'José Williams'},{value:'two',label:'Unavailable family member',disabled:true},{value:'three',label:'Alex Green'},{value:'four',label:'A very long family member name which should wrap safely on a narrow screen'}]}/>
 <button type="submit">Save choices</button><output aria-label="Saved choices">{submits}</output></form>
 <button type="button" onClick={()=>document.querySelector('dialog').showModal()}>Open sheet</button>
 <dialog><h2>Choices in a sheet</h2><ChoiceControl label="Sheet count" variant="search" options={Array.from({length:20},(_,i)=>i+1)} value={count} onChange={setCount}/><button type="button" onClick={()=>document.querySelector('dialog').close()}>Close sheet</button></dialog>
 <div className="writing-box"><textarea aria-label="Test message" value={text} onChange={e=>setText(e.target.value)}/><button className="send-button" aria-label="Send" aria-busy={busy} disabled={!text.trim()||busy} onClick={()=>setSent(n=>n+1)}><svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg></button></div><output aria-label="Sent messages">{sent}</output>
 </main>
}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
const bundle=await build({stdin:{contents:fixture,loader:'jsx',resolveDir:root},bundle:true,format:'iife',write:false,outfile:'fixture.js',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
const styles=(await Promise.all(['dist/style.css','dist/review.css','dist/liquid-glass-core.css','dist/ui-pass.css','dist/react-ui.css','src/choice-control.css'].map(file=>readFile(root+file,'utf8')))).join('\n');
const html=`<!doctype html><html data-theme="dark" data-platform="ios"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}\nmain{max-width:620px;margin:auto;padding:24px}main form{display:grid;gap:24px;margin:24px 0}main>button,main form>button,dialog>button{min-height:44px;padding:12px;background:var(--raised);border-radius:12px}dialog{max-width:calc(100vw - 32px);width:420px;padding:24px;border:1px solid var(--line);background:var(--surface);color:var(--text)}dialog .choice-control{margin:24px 0}.writing-box{position:relative;margin-top:30px}.writing-box>.send-button{position:absolute;right:8px;bottom:8px;border-radius:12px;width:38px;height:38px}.writing-box textarea{width:100%;min-height:100px;padding:14px 60px 14px 14px;background:var(--surface);color:var(--text)}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`;
const engine=process.env.GW_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true});
const output=root+'docs/choice-control-qa';await mkdir(output,{recursive:true});
const results=[],errors=[];
try{
 for(const width of [390,1024]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://choice-fixture.local/',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://choice-fixture.local/');
  await page.evaluate(()=>window.fixture.palette('dark','#c9aa52'));
  await page.getByRole('radio',{name:'Coming',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('radio',{name:'Deciding',exact:true})).toBeChecked();
  const count=page.getByRole('combobox',{name:'How many people?'});await count.focus();await expect(count).toHaveAttribute('aria-expanded','true');await count.fill('20');await count.press('Enter');await expect(count).toHaveValue('20');await expect(count).toHaveAttribute('aria-expanded','false');
  const owner=page.getByRole('combobox',{name:'New owner'});await owner.focus();await owner.fill('not a family member');await page.getByRole('button',{name:'Save choices'}).click();await expect(page.getByLabel('Saved choices')).toHaveText('0');await expect(owner).toHaveAttribute('aria-invalid','true');
  await owner.fill('jose');await expect(page.getByRole('option',{name:'José Williams'})).toBeVisible();await owner.press('Enter');await page.getByRole('button',{name:'Save choices'}).click();await expect(page.getByLabel('Saved choices')).toHaveText('1');assert.deepEqual(await page.evaluate(()=>window.formValues),{plans:'Deciding',count:'20',owner:'one'});
  await owner.focus();await owner.press('Home');await owner.press('ArrowDown');const active=await owner.getAttribute('aria-activedescendant');assert.equal(await page.locator(`[id="${active}"]`).innerText(),'Alex Green');await owner.press('Escape');await expect(owner).toHaveValue('José Williams');
  await owner.click();await page.evaluate(()=>window.fixture.disable(true));await expect(owner).toBeDisabled();await expect(owner).toHaveAttribute('aria-expanded','false');await page.evaluate(()=>window.fixture.disable(false));
  await page.getByRole('button',{name:'Open sheet'}).click();const sheetCount=page.getByRole('combobox',{name:'Sheet count'});await sheetCount.click();await expect(page.locator('.choice-popover:popover-open')).toBeVisible();await sheetCount.press('Escape');await expect(page.locator('dialog')).toBeVisible();await expect(sheetCount).toHaveAttribute('aria-expanded','false');await page.getByRole('button',{name:'Close sheet'}).click();
  await owner.focus();await owner.fill('A very long');await page.screenshot({path:`${output}/choices-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal document overflow');await owner.press('Escape');
  for(const material of ['ios','android'])for(const theme of ['light','dark'])for(const color of ['#c9aa52','#d24978','#627bf0']){
   await page.evaluate(({material,theme,color})=>{window.fixture.material(material);window.fixture.palette(theme,color)},{material,theme,color});
   const send=page.getByRole('button',{name:'Send',exact:true});await page.getByLabel('Test message').fill('');await expect(send).toBeDisabled();
   const disabled=await send.evaluate(element=>{const style=getComputedStyle(element);return {opacity:style.opacity,color:style.color,bg:style.backgroundColor,border:style.borderTopColor,radius:style.borderRadius}});assert.equal(disabled.opacity,'1');assert.notEqual(disabled.color,disabled.bg);assert.equal(disabled.radius,'12px');
   await page.getByLabel('Test message').fill('Preview only');await expect(send).toBeEnabled();const enabled=await send.evaluate(element=>{const style=getComputedStyle(element);const probe=document.createElement('span');probe.style.color='var(--control)';element.appendChild(probe);const expected=getComputedStyle(probe).color;probe.remove();return {color:style.color,bg:style.backgroundColor,expected,opacity:style.opacity,radius:style.borderRadius}});assert.equal(enabled.bg,enabled.expected);assert.equal(enabled.opacity,'1');assert.equal(enabled.radius,disabled.radius);assert.notEqual(enabled.bg,disabled.bg);
   await page.evaluate(()=>window.fixture.busy(true));await expect(send).toBeDisabled();assert.equal(await send.evaluate(element=>getComputedStyle(element).backgroundColor),enabled.bg);await page.evaluate(()=>window.fixture.busy(false));
   if(color==='#c9aa52')await page.screenshot({path:`${output}/send-${width}-${material}-${theme}.png`,fullPage:true});
  }
  await expect(page.getByLabel('Sent messages')).toHaveText('0');results.push({width,checks:['native radio keyboard','search and explicit selection','required validation','FormData parity','disabled choice skipping','Escape preserves sheet','disabled closes popup','mobile overflow','Send empty/enabled/busy palette matrix'],status:'passed'});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({engine:process.env.GW_BROWSER||'chromium',results,errors},null,2));console.log('Choice control hosted QA passed',results);
}finally{await browser.close()}
