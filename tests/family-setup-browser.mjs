import './test-environment-guard.mjs';
// Ordinary built app in preview mode with fictional people only; every non-GET
// request is blocked and recorded, so nothing can leave the browser.
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
const root=resolve('dist'),output=resolve(process.env.GW_FAMILY_SETUP_QA_OUTPUT||'docs/family-setup-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',errors=[],writes=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
function fixtureState(){
 const state={...initialState(),onboarding:'done',previewRoleView:'member'};
 state.members=state.members.map((m,i)=>({...m,name:m.id===state.selfId?'Ivy June Quill':'Fixture Person '+i,photo:null}));
 const other=state.members.find(m=>m.id!==state.selfId).id;
 state.households=[{id:'fixture-cottage',name:'Quill Cottage',color:null,colorMode:'inherit',photo:null,founderId:other,memberIds:[other],headIds:[other],canManage:false,heritage:[]}];
 state.branches=[{id:'fixture-marsh',name:'Marsh Branch',createdBy:other,householdIds:['fixture-cottage']}];
 return state;
}
async function sheetGeometry(dialog){
 const close=await dialog.locator('.sheet-head .sheet-close').boundingBox(),done=await dialog.locator('.sheet-head .sheet-complete').boundingBox();
 assert.ok(close&&done,'sheet shows close and confirm');assert.ok(close.x<done.x,'close on the left, confirm on the right');
 const footer=await dialog.locator('.sheet-footer').last().boundingBox();assert.ok(footer,'sticky footer row present');
}
try{
 await mkdir(output,{recursive:true});browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_FAMILY_SETUP_CHROMIUM_PATH?{executablePath:process.env.GW_FAMILY_SETUP_CHROMIUM_PATH}:{})});
 for(const [width,theme] of [[390,'light'],[1024,'dark']]){
  const context=await browser.newContext({viewport:{width,height:880},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(url.pathname);return route.abort()}if(url.pathname==='/api/config')return route.fulfill({json:{configured:false,email:false,providers:[],pushEnrollmentPrompt:false}});if(url.pathname==='/api/session')return route.fulfill({json:{signedIn:false,configured:false}});if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);return route.continue()});
  await context.addInitScript(({key,state,theme})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-platform','ios');localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-font','dm-serif')}},{key:PREVIEW_KEY,state:fixtureState(),theme});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/family-setup');
  await expect(page.getByRole('heading',{name:'Branches & households',level:1})).toBeVisible();
  const suggested=page.getByRole('region',{name:'Suggestions'});
  await expect(suggested.getByText('Based on the last name Quill.',{exact:false})).toBeVisible();
  await expect(suggested.getByText('Quill Cottage',{exact:true})).toBeVisible();
  // A suggestion alone changes nothing; joining needs an explicit confirmation.
  let stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,PREVIEW_KEY);assert.equal(stored.householdRequests.length,0);
  await suggested.getByRole('button',{name:'Ask to join',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Ask to join',exact:true});await expect(dialog).toBeVisible();await sheetGeometry(dialog);
  await dialog.locator('.sheet-footer').getByRole('button',{name:'Send request',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(suggested.getByText('Request sent',{exact:true})).toBeVisible();
  stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,PREVIEW_KEY);
  assert.equal(stored.householdRequests.length,1);assert.deepEqual(stored.householdIds,[],'a pending request is not a membership');
  // Create the suggested branch, confirmed with the right-hand check.
  await suggested.getByRole('button',{name:/Create the Quill Branch/}).click();dialog=page.getByRole('dialog',{name:'Create a branch',exact:true});
  await expect(dialog.getByRole('textbox',{name:'Branch name',exact:true})).toHaveValue('Quill');await sheetGeometry(dialog);
  await page.screenshot({path:`${output}/${engine}-${width}-${theme}-create-branch.png`});
  await dialog.locator('.sheet-head .sheet-complete').click();await expect(dialog).toHaveCount(0);
  // Duplicate names are refused before submit.
  await page.getByRole('searchbox',{name:'Search by name',exact:true}).fill('the quill family');
  await expect(page.getByRole('button',{name:/as a branch/})).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search by name',exact:true}).fill('');
  // Start a household inside the branch; the founding-head role is disclosed.
  await suggested.getByRole('button',{name:/^Quill/}).first().click();dialog=page.getByRole('dialog',{name:'Quill',exact:true});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:/Start a household in this branch/}).click();await expect(page.getByRole('dialog',{name:'Start a household',exact:true})).toBeVisible();dialog=page.getByRole('dialog',{name:'Start a household',exact:true});
  await expect(dialog.getByText('You’ll be the founding head of this household.',{exact:false})).toBeVisible();await sheetGeometry(dialog);
  await dialog.getByRole('textbox',{name:'Household name',exact:true}).fill('Fixture Hearth');await dialog.locator('.sheet-footer').getByRole('button',{name:'Create household',exact:true}).click();await expect(dialog).toHaveCount(0);
  stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,PREVIEW_KEY);
  const hearth=stored.households.find(h=>h.name==='Fixture Hearth');assert.deepEqual(hearth.headIds,[stored.selfId]);
  assert.deepEqual(stored.branches.find(b=>b.name==='Quill').householdIds,[hearth.id]);assert.deepEqual(stored.branches.find(b=>b.name==='Marsh Branch').householdIds,['fixture-cottage'],'other branches untouched');
  await expect(page.getByRole('region',{name:'Branches & households'}).getByText('Fixture Hearth',{exact:true}).first()).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal page scroll');
  await page.screenshot({path:`${output}/${engine}-${width}-${theme}-setup.png`,fullPage:true});
  await context.close();
 }
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('family setup browser checks passed ('+engine+')');
}finally{await browser?.close();server.close()}
