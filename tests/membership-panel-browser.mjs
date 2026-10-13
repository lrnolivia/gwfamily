// Real component/CSS, deterministic fictional identity and captured local actions.
import './test-environment-guard.mjs';import {build} from 'esbuild';import {chromium,webkit,expect} from '@playwright/test';import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';
const engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium';const output=resolve(process.env.GW_MEMBERSHIP_QA_OUTPUT||'docs/membership-qa');await mkdir(output,{recursive:true});
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MembershipFixture} from './tests/fixtures/membership-review-queue.jsx';createRoot(document.getElementById('fixture')).render(<MembershipFixture/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',outfile:'fixture.js'});const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=await readFile('dist/react-app.css','utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':req.url==='/fixture.css'?'text/css':'text/html');res.end(req.url==='/fixture.js'?js:req.url==='/fixture.css'?css:'<!doctype html><html data-theme="light" data-platform="ios" data-font="dm-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture" class="app"></div><script src="/fixture.js"></script></body></html>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;const errors=[];
try{browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.GW_CONSOLIDATED_CHROMIUM_PATH?{executablePath:process.env.GW_CONSOLIDATED_CHROMIUM_PATH}:{})});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.route('**/*',route=>{const req=route.request();if(!['GET','HEAD'].includes(req.method()))throw Error('No fixture network mutation allowed');return new URL(req.url()).origin===base?route.continue():route.abort()});const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await expect(page.getByRole('button',{name:'Approve membership',exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Can post updates'})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:'Allow family-feed posts'})).toHaveCount(0);for(const role of ['Admin','Moderator','Planner','Treasurer'])await expect(page.getByRole('checkbox',{name:new RegExp('^'+role)})).not.toBeChecked();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:output+'/'+engine+'-phone-pending.png'});await page.getByRole('button',{name:'Approve membership',exact:true}).click();assert.deepEqual(await page.evaluate(()=>fixtureActions[0]),{type:'APPROVE_MEMBER',id:'fictional-member',status:'active',roles:[],canPost:true});await page.evaluate(()=>setFixtureStatus('active'));await expect(page.getByRole('checkbox',{name:'Allow family-feed posts',exact:true})).not.toBeChecked();await page.getByRole('button',{name:'Save membership',exact:true}).click();assert.equal(await page.evaluate(()=>fixtureActions.at(-1).canPost),false);await page.getByText('More actions',{exact:true}).click();await expect(page.getByRole('button',{name:'Remove member',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Pause access',exact:true})).toBeVisible();
// Same real component at phone and desktop widths; all actions are captured locally.
await page.evaluate(()=>resetQueue());
await expect(page.getByRole('heading',{name:'Active Members',exact:true})).toBeVisible();
await expect(page.getByRole('button',{name:'Manage Membership',exact:true})).toHaveCount(1);
await expect(page.getByRole('button',{name:/^Approve/})).toHaveCount(0);
const taskCard=page.getByRole('complementary',{name:'Member management'}),memberList=page.getByRole('region',{name:'Active Members',exact:true});
assert.ok((await taskCard.boundingBox()).y<(await memberList.boundingBox()).y,'Phone task card is first');
await page.setViewportSize({width:1280,height:900});
assert.ok((await taskCard.boundingBox()).x<(await memberList.boundingBox()).x,'Desktop task card is the sidebar');
await page.setViewportSize({width:390,height:844});
await page.getByRole('link',{name:/^Waiting for approval/}).click();
await expect(page.getByRole('heading',{name:'Waiting for approval',exact:true})).toBeVisible();
await page.getByRole('button',{name:'Filter & sort',exact:true}).click();
await page.getByRole('button',{name:'Name Z–A',exact:true}).click();
await page.getByRole('button',{name:'Done',exact:true}).click();
await expect(page.getByRole('article').first()).toContainText('Fixture Cara');
await page.getByRole('article').filter({hasText:'fixture-amy@example.test'}).getByRole('button',{name:'Review Membership',exact:true}).click();
assert.equal(await page.evaluate(()=>fixtureReview),'fixture-amy');
await page.getByRole('checkbox',{name:'Select Fixture Ben',exact:true}).check();
await page.getByRole('button',{name:'Approve Selected (1)',exact:true}).click();
await expect(page.getByText('1 of 1 memberships now active. 0 still waiting.',{exact:false})).toBeVisible();
assert.deepEqual(await page.evaluate(()=>fixtureActions.map(a=>a.id)),['fixture-ben']);
await page.getByRole('article').filter({hasText:'fixture-amy@example.test'}).getByRole('button',{name:'Approve',exact:true}).click();
await expect(page.getByRole('article').filter({hasText:'fixture-amy@example.test'})).toHaveCount(0);
await page.screenshot({path:output+'/'+engine+'-phone-waiting.png'});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
for(const scenario of ['normal','late-arrival','fail-second','account-change']){
 await page.evaluate(value=>{resetQueue();window.fixtureScenario=value},scenario);
 await page.getByRole('link',{name:/^Waiting for approval/}).click();
 await page.getByRole('button',{name:'Approve All (3)',exact:true}).click();
 if(scenario==='account-change'){await expect.poll(()=>page.evaluate(()=>fixtureActions.length)).toBe(1);await expect(page.getByRole('button',{name:'Approve All (2)',exact:true})).toBeVisible()}
 else {await expect(page.getByText(scenario==='fail-second'?'1 of 3 memberships now active. 2 still waiting.':'3 of 3 memberships now active. 0 still waiting.',{exact:false})).toBeVisible();assert.deepEqual(await page.evaluate(()=>fixtureActions.map(a=>a.id)),scenario==='fail-second'?['fixture-amy','fixture-ben']:['fixture-amy','fixture-ben','fixture-cara'])}
 if(scenario==='late-arrival')await expect(page.getByRole('article').filter({hasText:'fixture-late@example.test'})).toBeVisible();
}
await page.evaluate(()=>resetQueue());for(const [label,email] of [['Paused memberships','fixture-paused@example.test'],['Removed memberships','fixture-removed@example.test']]){await page.getByRole('link',{name:new RegExp('^'+label)}).click();await expect(page.getByRole('article').filter({hasText:email})).toBeVisible();await expect(page.getByRole('button',{name:'Manage Membership',exact:true})).toBeVisible()}
assert.deepEqual(errors,[]);await writeFile(output+'/'+engine+'-phone-receipt.json',JSON.stringify({engine,phone:390,realComponentAndCSS:true,pendingApprovalPosting:true,organizerRolesUnchanged:true,existingRestrictionPreserved:true,moreActionsReachable:true,noExternalMutations:true,approvalQueue:true,capturedPendingScope:true,sortAndSelection:true,individualReviewAndApprove:true,partialFailure:true,accountChange:true,responsiveTaskCard:true,errors},null,2));console.log('Membership phone and approval semantics PASS; fictional captured actions only');await context.close();}finally{await browser?.close();await new Promise(r=>server.close(r))}
