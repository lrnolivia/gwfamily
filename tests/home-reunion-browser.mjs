import './test-environment-guard.mjs';
// Real built Home and Family, fictional preview only. No external writes/payments.
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {derivePlanning} from '../src/planning-model.js';
import {sharedPageDefaults} from '../src/shared-content-schema.js';
import {removeSharedPanel} from '../src/shared-panels.js';
const root=resolve('dist'),output=resolve(process.env.GW_HOME_QA_OUTPUT||'docs/home-reunion-qa'),engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',errors=[],writes=[],results=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://fixture').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
const snapshot=page=>page.evaluate(key=>({family:localStorage.getItem(key),layout:localStorage.getItem('gw-shared-pages-preview:v1')}),PREVIEW_KEY);
async function checkChecklist(root,state){
 await expect(root.locator('.planning-checklist')).toHaveCount(1);
 await expect(root.locator('.planning-summary')).toHaveText(derivePlanning(state).summary);
 for(const name of [/^My RSVP/,/^My Shirt selection/,/^My Reunion fees/])await expect(root.getByRole('button',{name})).toHaveCount(1);
 await expect(root.getByRole('button',{name:'Family member checklist',exact:true})).toBeVisible();
 assert.equal(await root.evaluate(n=>n.scrollWidth>n.clientWidth),false);
}
try{
 await mkdir(output,{recursive:true});browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_CONSOLIDATED_CHROMIUM_PATH?{executablePath:process.env.GW_CONSOLIDATED_CHROMIUM_PATH}:{})});
 for(const width of [390,700,701,820,1280])for(const platform of ['ios','android']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(url.pathname);return route.abort()}if(url.pathname==='/api/config')return route.fulfill({json:{configured:false,email:false,providers:[],pushEnrollmentPrompt:false}});if(url.pathname==='/api/session')return route.fulfill({json:{signedIn:false,configured:false}});if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);return route.continue()});
  const state={...initialState(),onboarding:'done',previewRoleView:'leader',rsvp:{status:'Planning to come',count:2},fees:'reported',order:{id:'fixture-order',status:'claimed',items:[{name:'Fictional shirt',quantity:2}]}};
  state.members=state.members.map((m,i)=>({...m,name:'Fixture Person '+i,photo:null}));
  const home=sharedPageDefaults('home');home.text.heading='Fixture arranged Home';home.panelLayout.panels.find(p=>p.id==='native-reunion').zone=width===820?'side':'main';
  for(const key of ['desktopOrder','mobileOrder']){const order=home.panelLayout[key],a=order.indexOf('native-reunion'),b=order.indexOf('native-feed');[order[a],order[b]]=[order[b],order[a]];}
  const family=sharedPageDefaults('family');if(width!==820)family.panelLayout=removeSharedPanel(family.panelLayout,'native-invitations');
  const people=sharedPageDefaults('people');people.text.heading='Fixture Address Book';
  // An old saved People layout gains only the new native identity; the retired
  // Family panel, whether still present or already deleted, never reappears.
  people.panelLayout.panels=people.panelLayout.panels.filter(p=>p.id!=='native-invitations');
  for(const key of ['desktopOrder','mobileOrder'])people.panelLayout[key]=people.panelLayout[key].filter(id=>id!=='native-invitations');
  const pages=Object.fromEntries(Object.entries({home,family,people}).map(([page,content])=>[page,{record:{page,revision:4,content,updatedAt:null},revisions:[]}]));
  await context.addInitScript(({key,state,platform,pages})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));localStorage.setItem('gw-platform',platform);localStorage.setItem('gw-theme','light');localStorage.setItem('gw-shared-pages-preview:v1',JSON.stringify(pages))}},{key:PREVIEW_KEY,state,platform,pages});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#/home');
  const trigger=page.getByRole('button',{name:'Your Reunion Plan',exact:true}),homePanel=page.locator('.react-home [data-panel-id="native-reunion"]'),inline=homePanel.locator('.planning-checklist');
  await expect(page.getByRole('heading',{name:'Fixture arranged Home',exact:true})).toBeVisible();
  await expect(trigger).toHaveCount(width<=700?1:0);await expect(inline).toHaveCount(width<=700?0:1);
  if(width>700)await checkChecklist(homePanel,state);else await expect(trigger).toHaveAttribute('aria-haspopup','dialog');
  await page.screenshot({path:output+'/'+engine+'-home-'+width+'-'+platform+'.png'});
  const before=await snapshot(page);
  // Both directions of the canonical 700px boundary retain keyboard focus.
  if(width>700){await inline.getByRole('button').first().focus();await page.setViewportSize({width:390,height:900});await expect(trigger).toBeFocused();}
  await trigger.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Your Reunion Plan',exact:true});await expect(dialog).toBeVisible();await checkChecklist(dialog,state);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await trigger.click();await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(trigger).toBeFocused();
  await trigger.click();const activePlanAction=dialog.getByRole('button',{name:/^My Shirt selection/});await activePlanAction.focus();
  await dialog.evaluate(el=>{el.dataset.fixtureContinuity='same-open-sheet'});
  await page.setViewportSize({width:820,height:900});
  await expect(dialog).toHaveAttribute('data-fixture-continuity','same-open-sheet');await expect(activePlanAction).toBeFocused();
  await expect(trigger).toHaveCount(0);await expect(inline).toHaveCount(0);await expect(page.locator('.planning-checklist')).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(inline.getByRole('button').first()).toBeFocused();
  await page.setViewportSize({width:390,height:900});await expect(trigger).toBeFocused();
  await page.setViewportSize({width:1280,height:900});await expect(inline.getByRole('button').first()).toBeFocused();
  assert.deepEqual(await snapshot(page),before,'Presentation changes keep saved state and Home layout');
  await inline.getByRole('button',{name:'Family member checklist',exact:true}).click();await expect(page.getByRole('heading',{name:'Family member checklist',level:1,exact:true})).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0);await page.locator('.page-back').click();await expect(inline).toBeVisible();
  await page.setViewportSize({width,height:900});await page.reload();await expect(trigger).toHaveCount(width<=700?1:0);await expect(inline).toHaveCount(width<=700?0:1);

  // The invitation is a real People slot, alongside contact cards. It never
  // escapes to Memories/Tree and the Address Book no longer embeds a roster.
  await page.goto(base+'/#/family');const peopleLayout=page.locator('[data-panel-page="people"]'),invitation=peopleLayout.locator('[data-panel-id="native-invitations"]');
  await expect(invitation).toBeVisible();await expect(invitation).toHaveAttribute('data-panel-zone','side');await expect(invitation).not.toHaveClass(/page-featured-panel/);
  await expect(page.locator('.family-household-group,.family-household-unassigned,.family-people-directory')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Fixture Address Book',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'All family',exact:true})).toBeVisible();
  for(const name of ['Memories','Family tree']){await page.getByRole('tab',{name,exact:true}).click();await expect(page.locator('.invitation-sidebar-card')).toHaveCount(0);}
  await page.getByRole('tab',{name:'People',exact:true}).click();await expect(invitation).toBeVisible();
  await page.screenshot({path:output+'/'+engine+'-people-'+width+'-'+platform+'.png'});
  if(width===1280){
   const oldFamily=await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1')).family));
   await page.getByRole('button',{name:'Edit page',exact:true}).click();
   await expect(page.locator('[data-panel-page="family"] > .page-removed-panels')).toHaveCount(0);
   await invitation.getByRole('button',{name:'Panel options for Bring your people.',exact:true}).click();
   const tools=page.getByRole('dialog',{name:'Panel · Bring your people.',exact:true});await expect(tools).toBeVisible();
   await expect(tools.getByRole('button',{name:/^Hero/})).toHaveAttribute('aria-pressed','false');
   for(const [label,zone] of [['Main','main'],['Full width','full'],['Side','side'],['Main','main']]){
    // Choose through the visible chip label, as a person does; the radio stays the checked state.
    const choice=tools.getByRole('radio',{name:label,exact:true});await choice.locator('..').click();await expect(tools,'Panel tools stay open after changing page area').toBeVisible();
    if(zone==='full')await expect(invitation.locator('xpath=..')).toHaveClass('page-panel-full-width');
    else{await expect(invitation).toHaveAttribute('data-panel-zone',zone);assert.equal(await invitation.evaluate(el=>el.closest('.page-panel-zone')?.classList.contains('page-panel-zone-'+el.dataset.panelZone)),true);}
    await expect(invitation).not.toHaveClass(/page-featured-panel/);
   }
   await tools.getByRole('button',{name:'Done editing',exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1')).people.record.content.panelLayout.panels.find(p=>p.id==='native-invitations')?.zone)).toBe('main');
   await page.reload();await expect(invitation).toHaveAttribute('data-panel-zone','main');await expect(invitation).not.toHaveClass(/page-featured-panel/);
   assert.equal(await invitation.evaluate(el=>el.getBoundingClientRect().width<el.closest('[data-panel-page="people"]').getBoundingClientRect().width*.8),true,'Main is a normal column, not the page-width hero');
   await page.getByRole('button',{name:'Edit page',exact:true}).click();await invitation.getByRole('button',{name:'Panel options for Bring your people.',exact:true}).click();await tools.getByRole('button',{name:'Remove panel',exact:true}).click();
   await expect(invitation).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1')).people.record.content.panelLayout.panels.find(p=>p.id==='native-invitations')?.removed)).toBe(true);
   await page.reload();await expect(invitation).toHaveCount(0);assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('gw-shared-pages-preview:v1')).family)),oldFamily,'People edits never restore or rewrite the old Family panel');
  }
  results.push({width,platform,inlineOnTabletDesktop:true,mobileSheetOnly:true,canonicalChecklistUnique:true,resizeFocusAndOpenSheetPreserved:true,savedStateLayoutUnchanged:true,peopleOnlyInvitation:true,addressBookRosterRemoved:true,ordinaryPlacementAndRemoval:width===1280});
  await context.close();
 }
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await writeFile(output+'/'+engine+'-receipt.json',JSON.stringify({engine,results,noExternalWrites:true,errors},null,2));console.log(JSON.stringify({pass:true,engine,results}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
