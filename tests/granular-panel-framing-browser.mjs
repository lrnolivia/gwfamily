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
const range=async(locator,value)=>locator.evaluate((element,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},String(value));
const touch=async(locator,{dx=0,dy=0,cancel=false}={})=>locator.evaluate((element,{dx,dy,cancel})=>{const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2,send=(type,clientX,clientY)=>element.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:77,isPrimary:true,button:0,buttons:1,clientX,clientY}));send('pointerdown',x,y);send('pointermove',x+dx,y+dy);send(cancel?'pointercancel':'pointerup',x+dx,y+dy);},{dx,dy,cancel});
const save=async()=>{await page.locator('.page-edit-toolbar').getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('.page-edit-toolbar')).toContainText('Saved for the family')};
try{
 await page.goto(base+'/__test/signin?user=owner');await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
 await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();
 const hero=panel('hero');if(await hero.getAttribute('data-panel-locked')==='true')await hero.getByRole('button',{name:'Unlock Primary hero',exact:true}).click();
 const reunion=panel('native-reunion');if(await reunion.getAttribute('data-panel-locked')==='true')await reunion.getByRole('button',{name:'Unlock Your reunion',exact:true}).click();
 await reunion.getByLabel('Location for Your reunion',{exact:true}).selectOption('main');await expect(reunion).toHaveAttribute('data-panel-zone','main');
 await reunion.locator('.page-panel-drag').focus();await page.keyboard.press('ArrowRight');await expect(reunion).toHaveAttribute('data-panel-zone','side');await save();
 const desktop=(await getRecord('home')).content.panelLayout;await page.reload();await expect(panel('native-reunion')).toHaveAttribute('data-panel-zone','side');assert.deepEqual((await getRecord('home')).content.panelLayout,desktop);
 await page.setViewportSize({width:390,height:844});await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await page.getByRole('button',{name:'Reorder for mobile',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Reorder for mobile'}),row=dialog.locator('[data-panel-id="native-reunion"]');
 const ids=()=>dialog.locator('li[data-panel-id]').evaluateAll(elements=>elements.map(node=>node.dataset.panelId));
 const initial=await ids();await row.getByRole('button',{name:'Move Your reunion earlier on mobile',exact:true}).click();const moved=await ids();assert.notDeepEqual(moved,initial);await row.locator('.page-panel-drag').focus();await page.keyboard.press('ArrowDown');assert.deepEqual(await ids(),initial);
 // Real pointer events exercise the same touch-capable PointerEvent handlers.
 const handle=await row.locator('.page-panel-drag').boundingBox(),target=await dialog.locator('li[data-panel-id="native-feed"]').boundingBox();assert.ok(handle&&target);
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(target.x+20,target.y+8,{steps:12});await page.mouse.up();await dialog.getByRole('button',{name:'Done',exact:true}).click();await save();
 const mobile=(await getRecord('home')).content.panelLayout;assert.deepEqual(mobile.desktopOrder,desktop.desktopOrder);assert.notDeepEqual(mobile.mobileOrder,desktop.mobileOrder);await page.reload();assert.deepEqual((await getRecord('home')).content.panelLayout.mobileOrder,mobile.mobileOrder);
 // Save/cancel/reset framing on the original image, then reload to prove durability.
 await page.locator('.page-edit-toolbar').getByRole('button',{name:/^(Edit page|Resume page edits)$/}).click();await panel('hero').getByRole('button',{name:'Edit Home page media',exact:true}).click();
 const media=page.getByRole('region',{name:'Page media',exact:true});const originalButton=media.getByRole('button',{name:'Use original media',exact:true});if(await originalButton.isEnabled())await originalButton.click();const beforeFraming=(await getRecord('home')).content.hero;
 await media.getByRole('button',{name:'Adjust original photo framing',exact:true}).click();let frame=media.getByRole('region',{name:'Photo framing',exact:true});
 await range(frame.getByLabel('Horizontal focus',{exact:true}),'25');await range(frame.getByLabel('Vertical focus',{exact:true}),'75');await range(frame.getByLabel('Zoom',{exact:true}),'1.5');await frame.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await getRecord('home')).content.hero,beforeFraming);
 await media.getByRole('button',{name:'Adjust original photo framing',exact:true}).click();frame=media.getByRole('region',{name:'Photo framing',exact:true});await range(frame.getByLabel('Horizontal focus',{exact:true}),'25');await range(frame.getByLabel('Vertical focus',{exact:true}),'75');await range(frame.getByLabel('Zoom',{exact:true}),'1.5');await touch(frame.getByRole('group',{name:'Photo framing preview',exact:true}),{dx:18,dy:-12,cancel:true});await expect(frame.getByLabel('Horizontal focus',{exact:true})).toHaveValue('25');
 const crop=await frame.getByRole('group',{name:'Photo framing preview',exact:true}).boundingBox();await page.mouse.move(crop.x+crop.width/2,crop.y+crop.height/2);await page.mouse.down();await page.mouse.move(crop.x+crop.width/2+20,crop.y+crop.height/2-15,{steps:6});await page.mouse.up();
 await frame.getByRole('button',{name:'Reset framing',exact:true}).click();await expect(frame.getByLabel('Horizontal focus',{exact:true})).toHaveValue('50');await expect(frame.getByLabel('Zoom',{exact:true})).toHaveValue('1');
 await range(frame.getByLabel('Zoom',{exact:true}),1.5);await touch(frame.getByRole('group',{name:'Photo framing preview',exact:true}),{dx:18,dy:-12});assert.notEqual(await frame.getByLabel('Horizontal focus',{exact:true}).inputValue(),'50');
 await range(frame.getByLabel('Horizontal focus',{exact:true}),25);await range(frame.getByLabel('Vertical focus',{exact:true}),75);await frame.getByRole('button',{name:'Save framing',exact:true}).click();await media.getByRole('button',{name:'Done',exact:true}).click();await save();await page.reload();assert.deepEqual((await getRecord('home')).content.hero.frame,{x:25,y:75,zoom:1.5});
 await expect(panel('hero').locator('.page-media-content img').first()).toHaveCSS('object-position','25% 75%');
 // Intrinsic-height regression: You profile stays at its content height beside taller groups.
 await page.setViewportSize({width:1280,height:900});await page.goto(base+'/#/you');const profile=page.locator('[data-panel-page="you"] [data-panel-id="native-profile"] .profile-overview');await expect(profile).toBeVisible();const intrinsic=await profile.evaluate(element=>{const box=element.getBoundingClientRect(),last=element.lastElementChild.getBoundingClientRect(),style=getComputedStyle(element);return {unused:box.bottom-last.bottom-parseFloat(style.paddingBottom)-parseFloat(style.borderBottomWidth),height:box.height}});assert.ok(intrinsic.unused<24,'You profile must not stretch to match the taller column: '+JSON.stringify(intrinsic));
 await page.setViewportSize({width:390,height:844});await expect(page.locator('[data-panel-page="you"]')).toHaveClass(/is-mobile/);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert.ok(overflow<=1,'You remains a single non-overflowing mobile column');
 assert.deepEqual(errors,[]);console.log('PASS granular desktop/mobile pointer and keyboard moves; saved framing and cancel; reload');
}finally{await context.close();await browser.close()}
