import './test-environment-guard.mjs';
// Ordinary built app, preview data with fictional people; non-GET requests are
// blocked and recorded. Covers the first-run welcome over the authorized Home.
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
const root=resolve('dist'),output=resolve(process.env.GW_WELCOME_QA_OUTPUT||'docs/welcome-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',errors=[],writes=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
const fixture=(overrides={})=>{const state={...initialState(),onboarding:'done',prompts:{welcome:{version:1,status:'due'}},...overrides};state.members=state.members.map((m,i)=>({...m,name:m.id===state.selfId?'Ivy June Quill':'Fixture Person '+i,photo:null}));state.drafts={...state.drafts,post:'An unsent fictional draft'};return state};
async function open(state,{reducedMotion='reduce',width=390,theme='light'}={}){
 const context=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block',reducedMotion});
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(url.pathname);return route.abort()}if(url.pathname==='/api/config')return route.fulfill({json:{configured:false,email:false,providers:[],pushEnrollmentPrompt:false}});if(url.pathname==='/api/session')return route.fulfill({json:{signedIn:false,configured:false}});if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);return route.continue()});
 await context.addInitScript(({key,state,theme})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-platform','ios');localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-font','dm-serif');localStorage.setItem('gwfamily:preview-notice','seen')}},{key:PREVIEW_KEY,state,theme});
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));return {context,page};
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,PREVIEW_KEY);
try{
 await mkdir(output,{recursive:true});browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_WELCOME_CHROMIUM_PATH?{executablePath:process.env.GW_WELCOME_CHROMIUM_PATH}:{})});
 // 1. Before entry nothing private mounts: no Home, no welcome.
 {const {context,page}=await open({...initialState()});await page.goto(base+'/');await expect(page.locator('.onboarding-frame')).toBeVisible();await expect(page.locator('.react-home')).toHaveCount(0);await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);await context.close();}
 for(const [width,theme] of [[390,'light'],[1024,'dark']]){
  // 2. Due welcome: solid card over a blurred, already-authorized Home.
  const {context,page}=await open(fixture(),{width,theme,reducedMotion:'no-preference'});await page.goto(base+'/');
  const dialog=page.getByRole('dialog',{name:'Welcome to the family, Ivy',exact:true});await expect(dialog).toBeVisible();await expect(page.locator('.react-home')).toBeAttached();
  const look=await page.evaluate(()=>{const d=document.querySelector('dialog.welcome-overlay'),card=d.querySelector('.welcome-card'),b=getComputedStyle(d.querySelector('.welcome-scrim'));return {card:getComputedStyle(card).backgroundColor,blur:b.backdropFilter||b.webkitBackdropFilter||'',focused:d.contains(document.activeElement),modal:d.matches(':modal')}});
  assert.doesNotMatch(look.card,/rgba\([^)]*,\s*0?\.\d+\)|transparent/,'the card is opaque: '+look.card);assert.match(look.blur,/blur\(/);assert.equal(look.focused,true);assert.equal(look.modal,true);
  await page.waitForTimeout(600);await page.screenshot({path:`${output}/${engine}-${width}-${theme}-welcome.png`});
  const historyBefore=await page.evaluate(()=>history.length);
  await dialog.getByRole('button',{name:'Get started',exact:true}).click();await expect(page.getByRole('heading',{name:'Find your family',exact:true})).toBeVisible();const card=page.locator('dialog.welcome-overlay');await expect(card.getByRole('button',{name:/^Join your household/})).toBeVisible();await expect(card.getByRole('button',{name:/^Start a household/})).toBeVisible();
  await page.screenshot({path:`${output}/${engine}-${width}-${theme}-family.png`});
  await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('heading',{name:'Take a quick look around',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show me around',exact:true}).click();
  await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);await expect(page.locator('.contextual-tour')).toBeVisible();await expect(page.locator('.tour-spotlight')).toBeVisible();
  await page.screenshot({path:`${output}/${engine}-${width}-${theme}-tour.png`});
  let saved=await stored(page);assert.equal(saved.prompts.welcome.status,'completed');assert.equal(saved.drafts.post,'An unsent fictional draft','drafts are untouched');
  assert.equal(await page.evaluate(()=>history.length),historyBefore,'the welcome adds no history entries');
  await page.getByRole('button',{name:'Skip guide',exact:true}).click();await expect(page.locator('.contextual-tour')).toHaveCount(0);
  await page.reload();await expect(page.locator('.react-home')).toBeVisible();await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);
  await context.close();
 }
 // 3. Escape means Not now: recorded once, no repeat; manual replay records nothing.
 {const {context,page}=await open(fixture());await page.goto(base+'/');const dialog=page.locator('dialog.welcome-overlay');await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);assert.equal((await stored(page)).prompts.welcome.status,'dismissed');
  await page.reload();await expect(page.locator('.react-home')).toBeVisible();await expect(dialog).toHaveCount(0);
  await page.goto(base+'/#/tutorial');await page.getByRole('button',{name:'Replay the welcome',exact:true}).click();await expect(dialog).toBeVisible();
  await page.getByRole('button',{name:'Not now',exact:true}).first().click();await expect(dialog).toHaveCount(0);assert.equal((await stored(page)).prompts.welcome.status,'dismissed');
  await expect(page.getByRole('button',{name:'Replay the welcome',exact:true})).toBeFocused();
  await context.close();}
 // 4. Existing members: one-time optional family refinement reusing the setup UI.
 {const {context,page}=await open(fixture({prompts:{'family-setup':{version:1,status:'due'}}}));await page.goto(base+'/');
  const dialog=page.getByRole('dialog',{name:'Your households',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:/^Join your household/})).toBeVisible();
  await page.screenshot({path:`${output}/${engine}-390-light-refine.png`});
  await dialog.locator('.welcome-footer').getByRole('button',{name:'Not now',exact:true}).click();await expect(dialog).toHaveCount(0);
  let saved=await stored(page);assert.deepEqual(saved.prompts,{'family-setup':{version:1,status:'dismissed'}});
  await page.reload();await expect(page.locator('.react-home')).toBeVisible();await page.waitForTimeout(300);await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);
  await page.goto(base+'/#/family-setup');await expect(page.getByRole('heading',{name:'Branches & households',level:1})).toBeVisible();
  await context.close();}
 // 5. A new member who finishes the welcome is not asked to refine again.
 {const {context,page}=await open(fixture({prompts:{welcome:{version:1,status:'due'},'family-setup':{version:1,status:'due'}}}));await page.goto(base+'/');
  await page.getByRole('button',{name:'Get started',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Maybe later',exact:true}).click();
  await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);assert.deepEqual((await stored(page)).prompts,{welcome:{version:1,status:'completed'},'family-setup':{version:1,status:'completed'}});
  await page.reload();await expect(page.locator('.react-home')).toBeVisible();await page.waitForTimeout(300);await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);
  await context.close();}
 // 6. Guided refinement, one question per screen: households, a branch for the
 // household you head, which household shows first, then review. Not now saves
 // nothing; Done saves the branch and main household together.
 {const households=[{id:'fx-home',name:'Fixture Hearth',color:null,colorMode:'inherit',photo:null,founderId:'lauren',memberIds:['lauren','monique'],headIds:['lauren'],canManage:true,heritage:[]},{id:'fx-two',name:'Juniper House',color:null,colorMode:'inherit',photo:null,founderId:'monique',memberIds:['monique','lauren'],headIds:['monique'],canManage:false,heritage:[]}];
  const branches=[{id:'fx-quill',name:'Quill Branch',createdBy:'monique',householdIds:[]},{id:'fx-other',name:'Juniper Branch',createdBy:'monique',householdIds:['fx-two']}];
  const state=()=>fixture({prompts:{'family-setup':{version:1,status:'due'}},households,householdIds:['fx-home','fx-two'],householdId:'fx-two',branches});
  for(const save of [false,true]){
   const {context,page}=await open(state());await page.goto(base+'/');const dialog=page.locator('dialog.welcome-overlay');
   await expect(dialog.getByRole('heading',{name:'Your households',exact:true})).toBeVisible();await expect(dialog.locator('.family-step-row')).toHaveCount(2);
   await dialog.getByRole('button',{name:'Continue',exact:true}).click();
   await expect(dialog.getByRole('heading',{name:'Which family branch is Fixture Hearth part of?',exact:true})).toBeVisible();
   await expect(dialog.getByRole('radio',{name:/^Quill Branch/})).toBeChecked();await expect(dialog.getByText('Suggested',{exact:true})).toBeVisible();
   await dialog.getByRole('button',{name:'Continue',exact:true}).click();
   await expect(dialog.getByRole('heading',{name:'Which household should show first?',exact:true})).toBeVisible();await expect(dialog.getByRole('radio',{name:/^Juniper House/})).toBeChecked();
   await dialog.getByRole('radio',{name:/^Fixture Hearth/}).check();await dialog.getByRole('button',{name:'Continue',exact:true}).click();
   await expect(dialog.getByRole('heading',{name:'Look right?',exact:true})).toBeVisible();
   if(save){await page.screenshot({path:`${output}/${engine}-390-light-refine-review.png`});await dialog.locator('.welcome-footer').getByRole('button',{name:'Done',exact:true}).click()}
   else await dialog.getByRole('button',{name:'Not now',exact:true}).click();
   await expect(dialog).toHaveCount(0);const saved=await stored(page);
   assert.deepEqual(saved.branches.find(b=>b.id==='fx-quill').householdIds,save?['fx-home']:[]);assert.equal(saved.householdId,save?'fx-home':'fx-two');
   assert.equal(saved.prompts['family-setup'].status,save?'completed':'dismissed');assert.equal(saved.branches.length,2,'no branch is created when one matches');
   await context.close();
  }}
 // 7. A member without a due prompt never sees either automatically.
 {const {context,page}=await open(fixture({prompts:{}}));await page.goto(base+'/');await expect(page.locator('.react-home')).toBeVisible();await page.waitForTimeout(300);await expect(page.locator('dialog.welcome-overlay')).toHaveCount(0);await context.close();}
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('welcome browser checks passed ('+engine+')');
}finally{await browser?.close();server.close()}
