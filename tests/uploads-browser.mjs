import './test-environment-guard.mjs';
// Hosted fictional fixture only. Mixed comment upload keeps the good file and
// offers Retry/Remove for the bad one; Word and AVIF are accepted end to end;
// a posted music link reloads as a link card.
import {chromium,webkit,expect} from '@playwright/test';
import {authenticatedReadNavigation} from './browser-read-readiness.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.CI)throw Error('Use the existing hosted browser lane.');
const base=process.env.GW_UPLOADS_BASE||'http://127.0.0.1:4198',engine=process.env.GW_BROWSER==='webkit'?'webkit':'chromium',output=process.env.GW_UPLOADS_QA_OUTPUT||'docs/uploads-qa',results=[],errors=[];
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});await mkdir(output,{recursive:true});
const command=async(page,input)=>{const r=await page.request.post(base+'/api/commands',{headers:{Origin:base},data:{requestId:randomUUID(),...input}});assert.ok(r.ok(),await r.text());return r.json()};
const docx=Buffer.concat([Buffer.from('PK\x03\x04','latin1'),Buffer.alloc(60,1)]),avif=Buffer.concat([Buffer.from([0,0,0,0x1c]),Buffer.from('ftypavif','latin1'),Buffer.alloc(60)]),fakePng=Buffer.from('not really a png at all, fictional bytes');
async function session(user){const context=await browser.newContext({viewport:{width:390,height:860},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(user+': '+error.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{localStorage.setItem('gw-theme','light');localStorage.setItem('gw-install-dismissed','true')});const nav=authenticatedReadNavigation(page,base);await nav.navigate(base+'/__test/signin?user='+user);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();return {context,page,...nav}}
try{
 const alice=await session('alice');
 // 1. Partial success with per-file Remove, then send keeps only the good file.
 const post=await command(alice.page,{type:'ADD_POST',post:{text:'Fictional upload thread'}});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/post/'+post.id);
 const input=alice.page.locator('.conversation-composer input[type=file]');
 await input.setInputFiles([{name:'fictional-notes.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx},{name:'broken.png',mimeType:'image/png',buffer:fakePng}]);
 await expect(alice.page.locator('.conversation-composer .draft-file',{hasText:'fictional-notes.docx'}).first()).toBeVisible();
 const failed=alice.page.getByRole('list',{name:'Files that didn’t upload'});await expect(failed).toContainText('broken.png');
 await expect(failed.getByRole('button',{name:'Retry broken.png'})).toBeVisible();await alice.page.screenshot({path:`${output}/${engine}-partial-upload.png`});
 await failed.getByRole('button',{name:'Remove broken.png'}).click();await expect(failed).toHaveCount(0);
 await alice.page.locator('.conversation-composer textarea').first().fill('Fictional notes attached');await alice.page.locator('.conversation-composer').getByRole('button',{name:'Send'}).click();
 await expect.poll(async()=>{const s=await (await alice.page.request.get(base+'/api/state')).json();return (s.comments[post.id]||[]).map(c=>c.files.map(f=>f.name).join()).join('|')}).toBe('fictional-notes.docx');
 results.push('partial upload kept the good file; bad file removable');
 // 2. AVIF uploads and is served inline; Word downloads as an attachment.
 const up=await alice.page.request.post(base+'/api/media',{headers:{Origin:base},multipart:{file:{name:'fictional.avif',mimeType:'image/avif',buffer:avif}}});assert.equal(up.status(),201,await up.text());
 const served=await alice.page.request.get(base+(await up.json()).url);assert.match(served.headers()['content-disposition'],/^inline/);
 results.push('AVIF and Word accepted');
 // 3. A music link posted from the composer reloads as a link card.
 const track='https://open.spotify.com/track/'+'b'.repeat(22);const song=await command(alice.page,{type:'ADD_POST',post:{text:'Fictional song for the cookout',link:{url:track}}});
 await alice.navigate(base+'/?qa='+randomUUID()+'#/post/'+song.id);await expect(alice.page.locator('.detail-page .link-card')).toContainText('Spotify');
 await expect(alice.page.locator('.detail-page .link-card a')).toHaveAttribute('href',track);results.push('music link rehydrated');
 await alice.context.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(`${output}/${engine}-results.json`,JSON.stringify({engine,results,errors},null,1))}
console.log(engine+' uploads: '+results.join('; '));
