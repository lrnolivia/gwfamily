import './test-environment-guard.mjs';
// Hosted fixture only. Authoring/syntax checking is not browser evidence.
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw Error('Run only in the authorized hosted shared-page fixture.');
const base=process.env.GW_PAGE_CONTENT_URL||'http://127.0.0.1:4176';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):4176$/);
const browser=await (process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{localStorage.setItem('gw-platform','android');localStorage.setItem('gw-install-dismissed','true')});
const panel=id=>page.locator('[data-panel-page="home"] [data-panel-id="'+id+'"]');
const getRecord=async key=>{const response=await page.request.get(base+'/api/page-content/'+key);assert.equal(response.status(),200);return response.json()};
const position=async(frame,x,y)=>{const preview=frame.getByRole('group',{name:'Photo framing preview',exact:true});await zoom(frame,1.5);await frame.getByRole('button',{name:'Center',exact:true}).click();for(const [delta,key] of [[x-50,x<50?'ArrowLeft':'ArrowRight'],[y-50,y<50?'ArrowUp':'ArrowDown']])for(let i=0;i<Math.abs(delta)/2;i++)await preview.press(key)};
const zoom=async(frame,value)=>{const output=frame.getByLabel('Photo zoom percentage',{exact:true}),current=Number((await output.innerText()).replace('%',''))/100;for(let i=0;i<Math.round(Math.abs(value-current)/.05);i++)await frame.getByRole('button',{name:value<current?'Zoom out':'Zoom in',exact:true}).click()};
const touch=async(locator,{dx=0,dy=0,cancel=false}={})=>locator.evaluate((element,{dx,dy,cancel})=>{const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2,send=(type,clientX,clientY)=>element.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:77,isPrimary:true,button:0,buttons:1,clientX,clientY}));send('pointerdown',x,y);send('pointermove',x+dx,y+dy);send(cancel?'pointercancel':'pointerup',x+dx,y+dy);},{dx,dy,cancel});
const save=async()=>{await expect(page.locator('.page-edit-toolbar .page-edit-mode-label').getByRole('status')).toHaveText(/^(Saved for the family|Changes save automatically)$/)};
try{
 await page.goto(base+'/__test/signin?user=owner');await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
 // The preceding suite deliberately leaves a video selected. Restore only
 // this synthetic page through the revisioned API before testing photo tools.
 const framingBaseline=await getRecord('home');
 const reset=await page.request.post(base+'/api/page-content/home/restore',{data:{requestId:'framing-fixture-reset-'+Date.now(),expectedRevision:framingBaseline.revision,revision:0},headers:{Origin:base}});
 assert.equal(reset.status(),200);await page.reload();
 assert.equal((await getRecord('home')).content.hero.mode,'default');
 await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await page.locator('.page-edit-toolbar').locator('.page-edit-tools > summary').click();await page.locator('.page-edit-toolbar').getByRole('button',{name:'Arrange page',exact:true}).click();
 const hero=panel('hero');if(await hero.getAttribute('data-panel-locked')==='true')await hero.getByRole('button',{name:/^Unlock /}).click();
 await hero.getByRole('button',{name:/^Full width for /}).click();await save();
 const wide=await hero.evaluate(element=>({hero:element.getBoundingClientRect().width,page:element.closest('.page-panel-layout').getBoundingClientRect().width}));assert.ok(Math.abs(wide.hero-wide.page)<=1,JSON.stringify(wide));
 assert.equal((await getRecord('home')).content.panelLayout.panels.find(panel=>panel.id==='hero').fullWidth,true);
 const reunion=panel('native-reunion');if(await reunion.getAttribute('data-panel-locked')==='true')await reunion.getByRole('button',{name:'Unlock Your reunion',exact:true}).click();
 await reunion.getByRole('button',{name:'Main for Your reunion',exact:true}).click();await expect(reunion).toHaveAttribute('data-panel-zone','main');
 await reunion.locator('.page-panel-drag').focus();await page.keyboard.press('ArrowRight');await expect(reunion).toHaveAttribute('data-panel-zone','side');await save();
 const desktop=(await getRecord('home')).content.panelLayout;await page.reload();await expect(panel('native-reunion')).toHaveAttribute('data-panel-zone','side');assert.deepEqual((await getRecord('home')).content.panelLayout,desktop);await expect(page.locator('.page-panel-full-width')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.page-panel-full-width')).toHaveCount(0);await expect(page.locator('.page-panel-mobile-stack [data-panel-id=hero]')).toBeVisible();await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await page.locator('.page-edit-toolbar').locator('.page-edit-tools > summary').click();await page.locator('.page-edit-toolbar').getByRole('button',{name:'Arrange page',exact:true}).click();await page.getByRole('button',{name:'Reorder panels',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Reorder panels'}),row=dialog.locator('[data-panel-id="native-reunion"]');
 const ids=()=>dialog.locator('.page-order-card[data-panel-id]').evaluateAll(elements=>elements.map(node=>node.dataset.panelId));
 const initial=await ids();await row.focus();await page.keyboard.press('ArrowUp');const moved=await ids();assert.notDeepEqual(moved,initial);await row.focus();await page.keyboard.press('ArrowDown');assert.deepEqual(await ids(),initial);
 // Complete both keyboard writes before starting a separate pointer gesture.
 // An in-flight autosave intentionally disables dragging and cancels an active drag.
 await save();await expect(row).toHaveAttribute('draggable','true');
 // Playwright scrolls both targets into view before the real mouse gesture.
 // Mobile modal rows may begin below the viewport; stale offscreen coordinates
 // cannot establish whether the application's drop handlers work.
 const target=dialog.locator('.page-order-card[data-panel-id="native-feed"]');
 await row.dragTo(target,{targetPosition:{x:20,y:8}});
 await expect.poll(ids).not.toEqual(initial);
 await dialog.getByRole('button',{name:'Done',exact:true}).click();await save();
 const mobile=(await getRecord('home')).content.panelLayout;assert.deepEqual(mobile.desktopOrder,desktop.desktopOrder);assert.notDeepEqual(mobile.mobileOrder,desktop.mobileOrder);await page.reload();assert.deepEqual((await getRecord('home')).content.panelLayout.mobileOrder,mobile.mobileOrder);
 // Save/cancel/reset framing on the original image, then reload to prove durability.
 await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await panel('hero').getByRole('button',{name:'Edit Home page media',exact:true}).click();
 await page.locator('.page-object-tools').getByRole('region',{name:'Photo framing',exact:true}).getByRole('button',{name:'Replace media',exact:true}).click();
 let media=page.getByRole('region',{name:'Page media',exact:true});const originalButton=media.getByRole('button',{name:'Use original media',exact:true});if(await originalButton.isEnabled())await originalButton.click();const beforeFraming=(await getRecord('home')).content.hero;
 await media.getByRole('button',{name:'Adjust original photo framing',exact:true}).click();let frame=page.locator('.page-object-tools').getByRole('region',{name:'Photo framing',exact:true});
 await position(frame,24,76);await zoom(frame,1.5);await frame.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await getRecord('home')).content.hero,beforeFraming);
 await panel('hero').getByRole('button',{name:'Edit Home page media',exact:true}).click();frame=page.locator('.page-object-tools').getByRole('region',{name:'Photo framing',exact:true});await position(frame,24,76);await zoom(frame,1.5);await touch(frame.getByRole('group',{name:'Photo framing preview',exact:true}),{dx:18,dy:-12,cancel:true});await expect(frame.locator('img')).toHaveCSS('object-position','24% 76%');
 await expect(panel('hero').locator('.page-editable-media img')).toHaveCount(1);
 const crop=await frame.getByRole('group',{name:'Photo framing preview',exact:true}).boundingBox();await page.mouse.move(crop.x+crop.width/2,crop.y+crop.height/2);await page.mouse.down();await page.mouse.move(crop.x+crop.width/2+20,crop.y+crop.height/2-15,{steps:6});await page.mouse.up();
 await frame.getByRole('button',{name:'Reset frame',exact:true}).click();await expect(frame.locator('img')).toHaveCSS('object-position','50% 50%');await expect(frame.getByLabel('Photo zoom percentage',{exact:true})).toHaveText('100%');
 await zoom(frame,1.5);
 const framingPreview=frame.getByRole('group',{name:'Photo framing preview',exact:true});
 // Wait for the rendered zoom and decoded photo before dispatching the gesture.
 // React's zoom update and synthetic pointer events run in separate batches.
 await expect(framingPreview.locator('img')).toHaveCSS('transform','matrix(1.5, 0, 0, 1.5, 0, 0)');
 await expect.poll(()=>framingPreview.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 await touch(framingPreview,{dx:18,dy:-12});await expect(frame.locator('img')).not.toHaveCSS('object-position','50% 50%');
 await position(frame,24,76);await zoom(frame,1.5);await frame.getByRole('button',{name:'Apply image',exact:true}).click();await save();await page.reload();assert.deepEqual((await getRecord('home')).content.hero.frame,{x:50,y:50,zoom:1,mobile:{x:24,y:76,zoom:1.5}});
 await expect(panel('hero').locator('.page-media-content img').first()).toHaveCSS('object-position','24% 76%');
 await page.setViewportSize({width:1280,height:900});
 await expect(panel('hero').locator('.page-media-content img').first()).toHaveCSS('object-position','50% 50%');
 await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();
 await panel('hero').getByRole('button',{name:'Edit Home page media',exact:true}).click();
 await page.locator('.page-object-tools').getByRole('region',{name:'Photo framing',exact:true}).getByRole('button',{name:'Replace media',exact:true}).click();
 await page.getByRole('region',{name:'Page media',exact:true}).getByRole('button',{name:'Adjust original photo framing',exact:true}).click();
 frame=page.locator('.page-object-tools').getByRole('region',{name:'Photo framing',exact:true});
 await position(frame,80,20);await frame.getByRole('button',{name:'Apply image',exact:true}).click();
 await save();await page.reload();
 assert.deepEqual((await getRecord('home')).content.hero.frame.mobile,{x:24,y:76,zoom:1.5});
 assert.deepEqual((await getRecord('home')).content.hero.frame.desktop,{x:80,y:20,zoom:1.5});
 await expect(panel('hero').locator('.page-media-content img').first()).toHaveCSS('object-position','80% 20%');
 await page.setViewportSize({width:390,height:844});await expect(panel('hero').locator('.page-media-content img').first()).toHaveCSS('object-position','24% 76%');
 // Intrinsic-height regression: You profile stays at its content height beside taller groups.
 await page.setViewportSize({width:1280,height:900});await page.goto(base+'/#/you');const profile=page.locator('[data-panel-page="you"] [data-panel-id="native-profile"] .profile-overview');await expect(profile).toBeVisible();const intrinsic=await profile.evaluate(element=>{const box=element.getBoundingClientRect(),last=element.lastElementChild.getBoundingClientRect(),style=getComputedStyle(element);return {unused:box.bottom-last.bottom-parseFloat(style.paddingBottom)-parseFloat(style.borderBottomWidth),height:box.height}});assert.ok(intrinsic.unused<24,'You profile must not stretch to match the taller column: '+JSON.stringify(intrinsic));
 await page.setViewportSize({width:390,height:844});await expect(page.locator('[data-panel-page="you"]')).toHaveClass(/is-mobile/);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert.ok(overflow<=1,'You remains a single non-overflowing mobile column');
 assert.deepEqual(errors,[]);console.log('PASS granular desktop/mobile pointer and keyboard moves; saved framing and cancel; reload');
}finally{await context.close();await browser.close()}
