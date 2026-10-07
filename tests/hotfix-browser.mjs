import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {parsePaintColor} from './page-save-contrast.mjs';
const browser=await (process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({headless:true}),results=[],errors=[];
await mkdir('docs/recovery-qa',{recursive:true});
async function pageFor(width,theme,platform,mode='browser'){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(mode=>{Object.defineProperty(navigator,'standalone',{get:()=>mode==='standalone'});const original=window.matchMedia.bind(window);window.matchMedia=query=>{const media=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(media,'matches',{get:()=>mode==='standalone'});return media}},mode);
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>!!document.documentElement.dataset.platform);
 const state=initialState();state.onboarding='done';state.members.find(m=>m.id===state.selfId).profileColor='#c9aa52';
 await page.evaluate(({state,key,theme,platform})=>{localStorage.setItem(key,JSON.stringify({schema:2,mode:'preview',state}));
  sessionStorage.setItem('gw-active-mode','preview');localStorage.setItem('gw-theme',theme);localStorage.setItem('gw-platform',platform);localStorage.setItem('gw-preview-notice:v1','seen');localStorage.setItem('gw-install-dismissed','true')},{state,key:PREVIEW_KEY,theme,platform});
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'Main navigation'}).waitFor();return page;
}
async function verifyFilterPlatter(page,locator,label){
 await expect(locator).toBeVisible();
 const paint=await locator.evaluate(element=>{
  const probe=document.createElement('span');probe.style.background='var(--raised)';probe.style.color='var(--text)';element.append(probe);
  const actual=getComputedStyle(element),expected=getComputedStyle(probe),box=element.getBoundingClientRect();
  const result={background:actual.backgroundColor,raised:expected.backgroundColor,color:actual.color,text:expected.color,padding:parseFloat(actual.paddingLeft),radius:parseFloat(actual.borderRadius),width:box.width,rowGap:actual.rowGap,overflow:document.documentElement.scrollWidth-innerWidth};probe.remove();return result;
 });
 assert.equal(paint.background,paint.raised,label+' follows the active raised surface');assert.equal(paint.color,paint.text,label+' follows active text');
 const search=locator.locator('input[type="search"]');if(await search.count()){
  const placeholder=await search.evaluate(element=>{const probe=document.createElement('span');probe.style.color='var(--work-control-muted)';element.parentElement.append(probe);const trigger=element.closest('.browse-controls').querySelector('.browse-menu-trigger');const result={actual:getComputedStyle(element,'::placeholder').color,expected:getComputedStyle(probe).color,opacity:getComputedStyle(element,'::placeholder').opacity,search:getComputedStyle(element).backgroundColor,filter:getComputedStyle(trigger).backgroundColor};probe.remove();return result});assert.equal(placeholder.actual,placeholder.expected,label+' search hint follows theme text');assert.equal(placeholder.opacity,'1');
  const tone=color=>parsePaintColor(color).slice(0,3).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);
  assert.ok(tone(placeholder.search)>tone(placeholder.filter)+.001,label+' search field is lighter than Filter & sort: '+JSON.stringify(placeholder));
 }
 assert.ok(paint.padding>=12&&paint.radius>=12&&paint.width>200,label+' has its own padded platter');if(await locator.evaluate(element=>element.classList.contains('browse-controls')))assert.equal(parseFloat(paint.rowGap),8,label+' keeps a compact search/filter gap');assert.ok(paint.overflow<=1,label+' stays within viewport');
 // Changing a theme token must immediately repaint the shell without remounting.
 const custom=await locator.evaluate(element=>{const root=document.documentElement,previous=root.style.getPropertyValue('--raised');root.style.setProperty('--raised','rgb(93, 71, 108)');const background=getComputedStyle(element).backgroundColor;if(previous)root.style.setProperty('--raised',previous);else root.style.removeProperty('--raised');return background;});
 assert.equal(custom,'rgb(93, 71, 108)',label+' follows custom theme tokens');
}
async function verifyFilterPlatters(page,width,theme){
 const nav=page.getByRole('navigation',{name:'Main navigation'}),feed=page.locator('.inline-filters.filter-platter'),feedTrigger=feed.getByRole('button',{name:'Filter family feed',exact:true});
 await verifyFilterPlatter(page,feed,'Feed');await feedTrigger.click();await expect(feedTrigger).toHaveAttribute('aria-expanded','true');await expect(feed.locator('.filter-option').first()).toBeVisible();await feed.locator('.filter-option').first().focus();await page.keyboard.press('Escape');await expect(feedTrigger).toHaveAttribute('aria-expanded','false');await expect(feedTrigger).toBeFocused();
 await page.screenshot({path:`docs/recovery-qa/filter-feed-${width}-${theme}.png`,fullPage:true});
 await nav.getByRole('button',{name:'Family',exact:true}).click();await page.getByRole('tab',{name:'People',exact:true}).click();
 const people=page.getByRole('region',{name:'Family directory',exact:true});await verifyFilterPlatter(page,people,'People');await people.getByRole('button',{name:'Filter & sort',exact:true}).click();await expect(people.getByRole('button',{name:'Done',exact:true})).toBeVisible();
 const peopleTrigger=people.getByRole('button',{name:'Filter & sort',exact:true}),peopleDone=people.getByRole('button',{name:'Done',exact:true});
 await peopleDone.scrollIntoViewIfNeeded();await expect(peopleTrigger).toHaveAttribute('aria-expanded','true');await expect(peopleDone).toBeVisible();
 await page.screenshot({path:`docs/recovery-qa/filter-people-${width}-${theme}.png`});await expect(peopleTrigger).toHaveAttribute('aria-expanded','true');await peopleDone.click();await expect(people.getByRole('button',{name:'Filter & sort',exact:true})).toBeFocused();
 await page.getByRole('tab',{name:'Memories',exact:true}).click();const memories=page.getByRole('region',{name:'Memory',exact:true});await verifyFilterPlatter(page,memories,'Memories');await memories.getByRole('button',{name:'Filter & sort',exact:true}).click();await expect(memories.getByRole('button',{name:'Done',exact:true})).toBeVisible();
 // Capture the interactive panel in its normal viewport, and prove that
 // scrolling and capture leave its controls open and usable.
 const memoryTrigger=memories.getByRole('button',{name:'Filter & sort',exact:true}),memoryDone=memories.getByRole('button',{name:'Done',exact:true});
 await memoryDone.scrollIntoViewIfNeeded();await expect(memoryTrigger).toHaveAttribute('aria-expanded','true');await expect(memoryDone).toBeVisible();
 await page.screenshot({path:`docs/recovery-qa/filter-memories-${width}-${theme}.png`});await expect(memoryTrigger).toHaveAttribute('aria-expanded','true');await memoryDone.click();await nav.getByRole('button',{name:'Home',exact:true}).click();
 results.push({width,theme,check:'raised theme-token filter platters',status:'passed'});
}
try{
 for(const width of [390,768,1280])for(const theme of ['dark','light'])for(const platform of ['ios','android']){
  const p=await pageFor(width,theme,platform),nav=p.getByRole('navigation',{name:'Main navigation'}),fab=p.getByRole('button',{name:'Post an update',exact:true});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page stays within viewport');
  const editEntry=p.locator('.page-edit-toolbar.is-entry'),mainBox=await p.locator('main').boundingBox(),footerBox=await p.locator('.app>footer').boundingBox(),entryBox=await editEntry.boundingBox();
  assert.ok(entryBox&&entryBox.y>=mainBox.y+mainBox.height-1&&entryBox.y+entryBox.height<=footerBox.y+1,'Edit Page sits after page content and before footer');
  const editButton=await editEntry.getByRole('button',{name:'Edit page',exact:true}).boundingBox();assert.ok(Math.abs(editButton.x+editButton.width/2-entryBox.x-entryBox.width/2)<2,'Edit Page is centered');

  if(width<=768&&platform==='android')await verifyFilterPlatters(p,width,theme);
  if(width>=700){const a=await nav.boundingBox(),b=await fab.boundingBox();assert.ok(b.x>=a.x+a.width+8,'FAB clears navigation');assert.ok(b.x+b.width<=width-12,'FAB stays onscreen');if(platform==='android'){assert.ok(a.x<=1&&a.width<=100&&a.height>700,'Flat uses the full-height left rail');assert.ok(b.y<200&&width-b.x-b.width>=23,'Flat Post stays at the top right');}else assert.ok(Math.abs((a.y+a.height/2)-(b.y+b.height/2))<20,'Glass FAB aligned with dock');}
  if(platform==='android'){
   const home=nav.getByRole('button',{name:'Home',exact:true}),family=nav.getByRole('button',{name:'Family',exact:true});
   await family.click();await home.hover();
   const paint=await home.evaluate(e=>({background:getComputedStyle(e).backgroundColor,capsule:getComputedStyle(e.querySelector('.glyph')).backgroundColor}));assert.equal(paint.background,'rgba(0, 0, 0, 0)','Unselected hover never fills the destination rectangle');assert.notEqual(paint.capsule,'rgba(0, 0, 0, 0)','Hover remains visible inside icon capsule');
   await p.keyboard.press('Tab');await home.focus();assert.ok(await home.evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth)>=2),'Keyboard navigation keeps visible focus');await home.click();
  }
  await p.getByRole('button',{name:'Profile and appearance'}).click();
  const signOut=p.getByRole('button',{name:'Sign out',exact:true});await expect(signOut).toBeVisible();
  const exitPaint=await signOut.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,tint:e.querySelector('.liquid-glass-tint')?getComputedStyle(e.querySelector('.liquid-glass-tint')).backgroundColor:null}));assert.equal(exitPaint.background,theme==='light'?'rgb(212, 57, 67)':'rgb(212, 53, 65)','Sign out uses the Red accent for this theme');assert.equal(exitPaint.color,'rgb(255, 250, 240)');if(exitPaint.tint)assert.equal(exitPaint.tint,exitPaint.background,'Glass tint preserves destructive red');
  const rows=await p.locator('.profile-menu .list-row').evaluateAll(rows=>rows.map(e=>{const s=getComputedStyle(e);return {top:s.paddingTop,bottom:s.paddingBottom,align:s.alignItems}}));assert.ok(rows.length);assert.ok(rows.every(r=>r.top===r.bottom&&r.align==='center'));
  await p.screenshot({path:`docs/recovery-qa/hotfix-menu-${width}-${theme}-${platform}.png`});
  await p.getByRole('button',{name:/^Appearance Style/}).click();const appearanceBack=p.getByRole('button',{name:'Back to profile menu',exact:true});await expect(appearanceBack).toBeVisible();
  const backPaint=await appearanceBack.evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,radius:parseFloat(getComputedStyle(e).borderRadius),path:e.querySelector('path').getAttribute('d'),sticky:getComputedStyle(e.parentElement).position}});assert.ok(backPaint.width>=44&&backPaint.height>=44&&backPaint.radius>=24);assert.equal(backPaint.path,'M20 12H4m6-6-6 6 6 6');assert.equal(backPaint.sticky,'sticky');await appearanceBack.click();await p.keyboard.press('Escape');
  await fab.click();await p.getByText('Tag family',{exact:false}).first().click();const picker=p.getByRole('combobox',{name:'Family in this post'});await picker.fill('Shirley');await p.getByRole('option',{name:/Shirley Thomas/}).click();await p.getByRole('textbox',{name:"What's on your mind"}).fill('A family memory from the hotfix test');await p.getByRole('button',{name:'Send post',exact:true}).click();await p.getByText('A family memory from the hotfix test',{exact:true}).waitFor();const savedPost=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.posts.find(post=>post.text==='A family memory from the hotfix test'),PREVIEW_KEY);assert.ok(savedPost?.memberIds?.includes('shirley'),'saved post retains selected ancestor ID');assert.equal(await p.locator('.ancestor-tag').filter({hasText:'Shirley Thomas'}).count(),1,'ancestor tag is rendered with its memorial description');
  await nav.getByRole('button',{name:'You',exact:true}).click();
  const neutral=p.getByRole('button',{name:'Edit profile',exact:true});await expect(neutral).toHaveClass(/\bsecondary\b/);await expect(neutral).toBeVisible();
  const stroke=await neutral.evaluate(element=>{const probe=document.createElement('span');probe.style.color='var(--decorative-line)';element.append(probe);const result={actual:getComputedStyle(element).borderTopColor,expected:getComputedStyle(probe).color};probe.remove();return result});assert.deepEqual(parsePaintColor(stroke.actual),parsePaintColor(stroke.expected),'Neutral secondary stroke follows 30% active-theme token');
  await neutral.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');await expect(neutral).toBeFocused();assert.ok(await neutral.evaluate(element=>{const style=getComputedStyle(element);return style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2}),'Keyboard focus retains a visible ring');
  await neutral.click();
  const profileField=p.getByRole('textbox',{name:'Name',exact:true});await expect(profileField).toBeVisible();
  const fieldStroke=await profileField.evaluate(element=>{const probe=document.createElement('span');probe.style.color='var(--decorative-line)';element.parentElement.append(probe);const result={actual:getComputedStyle(element).borderTopColor,expected:getComputedStyle(probe).color};probe.remove();return result});assert.deepEqual(parsePaintColor(fieldStroke.actual),parsePaintColor(fieldStroke.expected),'Neutral field stroke follows 30% active-theme token');
  await p.screenshot({path:`docs/recovery-qa/hotfix-profile-${width}-${theme}-${platform}.png`,fullPage:true});
  results.push({width,theme,platform,status:'passed'});await p.close();
 }
 // Regular members retain profile editing but have no shared-page tools.
 {
  const p=await pageFor(390,'dark','android');await p.evaluate(key=>{const stored=JSON.parse(localStorage.getItem(key));stored.state.selfId='sheldon';localStorage.setItem(key,JSON.stringify(stored))},PREVIEW_KEY);await p.reload({waitUntil:'domcontentloaded'});
  const nav=p.getByRole('navigation',{name:'Main navigation'});await nav.getByRole('button',{name:'You',exact:true}).click();
  await expect(p.getByRole('button',{name:'Edit profile',exact:true})).toBeVisible();await expect(p.getByRole('heading',{name:'Leader Tools',exact:true})).toHaveCount(0);
  for(const name of ['Home','Reunion','Family']){await nav.getByRole('button',{name,exact:true}).click();await expect(p.getByRole('button',{name:'Edit page',exact:true})).toHaveCount(0);}
  results.push({check:'regular member profile editing and hidden shared-page tools',status:'passed'});await p.close();
 }
 // Photos and fallback initials retain the approved compact 44px square even with multi-line names/badges.
 for(const platform of ['ios','android']){
  const p=await pageFor(390,'dark',platform);await expect(p.locator('.post-head .identity-info').first()).toBeVisible();
  const identities=await p.locator('.post-head').evaluateAll(nodes=>nodes.map(node=>{const avatar=node.querySelector('.identity-avatar'),info=node.querySelector('.identity-info');if(!avatar||!info)return null;const a=avatar.getBoundingClientRect(),b=info.getBoundingClientRect(),v=avatar.querySelector('.avatar').getBoundingClientRect();return {height:a.height,textHeight:b.height,width:a.width,visibleHeight:v.height,gap:parseFloat(getComputedStyle(info).rowGap)}}).filter(Boolean));
  assert.ok(identities.length);for(const identity of identities){assert.ok(Math.abs(identity.height-44)<=1,JSON.stringify(identity));assert.ok(Math.abs(identity.width-identity.height)<=1,JSON.stringify(identity));assert.ok(Math.abs(identity.visibleHeight-identity.height)<=1,JSON.stringify(identity));assert.ok(identity.gap<=3);}
  results.push({check:'compact post identity sizing',platform,identities});await p.close();
 }
 // Both materials retain the selected heading font and editable font controls.
 for(const platform of ['ios','android']){
  const p=await pageFor(390,'light',platform);await p.getByRole('button',{name:'Profile and appearance'}).click();await p.getByRole('button',{name:/^Appearance Style/}).click();
  const fonts=p.getByRole('group',{name:'GW heading fonts'});await expect(fonts).toBeVisible();await fonts.getByRole('button',{name:/Momo Trust Display/}).click();
  await expect.poll(()=>p.locator('.appearance-panel-heading').getByRole('heading',{name:'Appearance',exact:true}).evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Momo Trust Display');
  const selected=p.getByRole('group',{name:'Color theme',exact:true}).locator('.choice-chip').filter({has:p.getByRole('radio',{checked:true})}).locator('.choice-chip-face');
  const paint=await selected.evaluate(e=>{const c=getComputedStyle(e);return {border:c.borderTopColor,shadow:c.boxShadow}});assert.equal(paint.border,'rgba(0, 0, 0, 0)');assert.notEqual(paint.shadow,'none');
  results.push({check:'heading fonts in both materials and strokeless accent shadows',platform,paint});await p.close();
 }
 // Inspect the requested yellow at real control size, without treating its
 // soft shadow as proof of WCAG text contrast on the bright fill.
 for(const theme of ['light','dark'])for(const platform of ['ios','android']){
  const p=await pageFor(390,theme,platform);
  await p.evaluate(()=>localStorage.setItem('gw-interface-accent:v1',JSON.stringify({mode:'custom',color:'#ec9d00'})));await p.reload({waitUntil:'domcontentloaded'});
  await p.getByRole('button',{name:'Profile and appearance'}).click();
  const action=p.getByRole('button',{name:'Go to You',exact:true});await expect(action).toBeVisible();
  const paint=await action.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,shadow:s.textShadow,width:r.width,height:r.height}});
  assert.equal(paint.background,'rgb(236, 157, 0)','Yellow keeps the exact approved fill');assert.equal(paint.color,'rgb(255, 255, 255)','Yellow labels stay white');assert.notEqual(paint.shadow,'none','Yellow receives its soft warm-brown shadow');assert.ok(paint.width>=44&&paint.height>=44);
  await p.screenshot({path:`docs/recovery-qa/yellow-white-label-${theme}-${platform}.png`});results.push({check:'yellow white label paint, visual review required',theme,platform,paint});await p.close();
 }
 // Exercise the real display-mode listener and CSS; this is a simulation, not a physical-device install check.
 for(const width of [390,768]){
  const p=await pageFor(width,'dark','ios','standalone');
  assert.equal(await p.locator('html').getAttribute('data-display-mode'),'standalone','Real navigation listener observes simulated installed mode');
  const nav=await p.locator('.bottom').boundingBox();assert.ok(nav.y+nav.height<=900&&900-nav.y-nav.height<=8,'standalone nav close to bottom');
  await p.screenshot({path:`docs/recovery-qa/hotfix-standalone-simulation-${width}.png`});results.push({width,check:'standalone CSS simulation',status:'passed'});await p.close();
 }
 const draft=await pageFor(390,'dark','ios');let fresh=false;const current=await draft.locator('meta[name="gw-build"]').getAttribute('content');
 await draft.route('**/build.json',route=>route.fulfill({json:{version:fresh?'ffffffffffffffffffff':current}}));
 await draft.getByRole('button',{name:'Post an update',exact:true}).click();await draft.getByRole('textbox',{name:"What's on your mind"}).fill('Keep this unsaved family story');fresh=true;
 await draft.evaluate(()=>window.dispatchEvent(new Event('online')));await draft.getByRole('button',{name:'Reload updated app',exact:true}).waitFor({state:'attached'});
 assert.equal(await draft.getByRole('textbox',{name:"What's on your mind"}).inputValue(),'Keep this unsaved family story');assert.equal(await draft.locator('dialog[open]').count(),1,'update does not dismiss the draft');await draft.getByRole('button',{name:'Close dialog',exact:true}).click();await draft.getByRole('button',{name:'Reload updated app'}).waitFor();await draft.getByRole('button',{name:'Post an update',exact:true}).click();assert.equal(await draft.getByRole('textbox',{name:"What's on your mind"}).inputValue(),'Keep this unsaved family story','draft survives dismissing and reopening the composer with an update ready');
 results.push({check:'new build notice preserves unsaved composer',status:'passed'});await draft.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}catch(error){console.error(error);console.log('::error title=GW hotfix browser::'+String(error.stack||error.message).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));throw error}finally{await writeFile('docs/recovery-qa/hotfix-results.json',JSON.stringify({results,errors},null,2));await browser.close()}

