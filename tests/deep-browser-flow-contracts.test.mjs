import {NOTIFICATION_SCOPES} from '../src/notification-model.js';
// Pure/source contracts only. Never import or launch the browser fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('fulfillment is a labelled searchable choice with the stored delivered value', () => {
  const manager = read('src/merchandise-manager.jsx');
  assert.match(manager, /\['delivered','Delivered \/ picked up'\]/);
  assert.match(manager, /<ChoiceControl required variant="search" label="Fulfillment" aria-label=\{'Fulfillment for order '\+String\(order\.id\)\.slice\(0,8\)\}/);
  assert.match(manager, /dispatch\(\{type:'UPDATE_CLAIM',id:order\.id,status\}\)/);
});

test('preview fulfillment retains identity and updates both persisted order records', () => {
  const adapter = read('src/data-adapter.js'), projection = read('src/leader-preview.js');
  assert.match(adapter, /case 'CLAIM_ORDER':\{const order=\{memberId:state\.selfId,id:'preview-order-'\+Date\.now\(\),status:'claimed',claimedAt:Date\.now\(\),items:state\.bag\}/);
  assert.match(adapter, /previewOrders:\[order,\.\.\.\(state\.previewOrders\|\|\[\]\)\]/);
  assert.match(adapter, /case 'UPDATE_CLAIM':return \{\.\.\.state,order:state\.order\?\.id===action\.id\?\{\.\.\.state\.order,status:action\.status\}:state\.order,previewOrders:\(state\.previewOrders\|\|\[\]\)\.map\(o=>o\.id===action\.id\?\{\.\.\.o,status:action\.status\}:o\)\}/);
  assert.match(projection, /orders=state\.previewOrders\|\|\[\]/);
  assert.match(projection, /claims:orders\.map\(o=>\(\{\.\.\.o,/);
  const browser = read('tests/recovery-browser.mjs');
  assert.match(browser, /orderId=createdOrder\.id/);
  assert.match(browser, /name:'Fulfillment for order '\+orderId\.slice\(0,8\),exact:true/);
  assert.match(browser, /claim=\(state\.previewOrders\|\|\[\]\)\.find\(order=>order\.id===id\)/);
  assert.match(browser, /toEqual\(\{claimId:orderId,claimStatus:'delivered',orderId,orderStatus:'delivered'\}\)/);
  assert.doesNotMatch(browser, /getByRole\('group',\{name:'Fulfillment'/);
});

test('canonical page galleries render real navigation and status only for multiple images', () => {
  const page = read('src/page-content.jsx'), controls = read('src/carousel-controls.jsx');
  assert.match(page, /carousel=hero\.mode==='gallery'&&media\.length>1/);
  assert.match(page, /carousel&&<><CarouselControls previousLabel="Previous page photo" nextLabel="Next page photo"/);
  assert.match(page, /className="gw-carousel-status page-gallery-status"/);
  assert.match(controls, /className="gw-carousel-controls" role="group" aria-label="Photo navigation"/);
});

test('Photo mode verifies a present Home hero and absence of actual gallery controls', () => {
  const browser = read('tests/page-content-browser.mjs');
  assert.match(browser, /const photoHero = primaryHero\(bob, 'home'\);/);
  assert.match(browser, /expect\(photoHero\)\.toHaveCount\(1\)/);
  assert.match(browser, /expect\(photoHero\.locator\('img\.page-hero-asset'\)\)\.toHaveCount\(1\)/);
  assert.match(browser, /photoHero\.locator\('\.gw-carousel-controls, \.page-gallery-status'\)\)\.toHaveCount\(0\)/);
  assert.match(browser, /\['Previous page photo', 'Next page photo', 'Play page photos', 'Pause page photos'\]/);
  assert.match(browser, /photoHero\.getByRole\('button', \{name, exact: true\}\)\)\.toHaveCount\(0\)/);
  assert.doesNotMatch(browser, /\.page-gallery-controls/);
});

test('Appearance is selected within the actual profile menu for either material',()=>{
 const browser=read('tests/recovery-browser.mjs'),app=read('src/react-app.jsx');
 assert.match(app,/className="stack pop-content profile-menu"/);
 assert.match(browser,/page\.locator\('\.profile-menu'\)\.getByRole\('button',\{name:\/\^Appearance\/\}\)\.click\(\)/);
 assert.match(browser,/themePage\.locator\('\.profile-menu'\)\.getByRole\('button',\{name:\/\^Appearance\/\}\)\.click\(\)/);
 assert.doesNotMatch(browser,/(?:page|themePage)\.getByRole\('button',\{name:\/\^Appearance\/\}\)\.click\(\)/);
});


test('Delivered search matches the actual fulfillment label without committing a typed query', () => {
  const choice = read('src/choice-control.jsx'), manager = read('src/merchandise-manager.jsx');
  const pure = choice.slice(choice.indexOf('// Values stay strings'), choice.indexOf('function ChoiceMark'));
  assert.ok(pure.includes('export function filterChoices'), 'Inspect the actual pure filter implementation');
  const {filterChoices} = new Function(pure.replaceAll('export ', '') + ';return {filterChoices};')();
  const expression = manager.match(/const fulfillment=(.+);\n/)[1];
  const options = new Function('return (' + expression + ');')();
  assert.deepEqual(filterChoices(options, 'Delivered').map(({value,label})=>({value,label})), [{value:'delivered',label:'Delivered / picked up'}]);
  assert.equal(filterChoices(options, 'Not a fulfillment choice').length, 0);
  assert.match(choice, /onChange=\{event=>\{setQuery\(event.target.value\);setActive\(-1\);setOpen\(true\)\}\}/, 'Typing changes the query, not the stored fulfillment');
  assert.match(choice, /close\(\);onChange\?\.\(option.value\)/, 'Only deliberate selection commits the stored value');
});

test('below-fold fulfillment opens through a real visible pointer choice before persisted same-ID assertions', () => {
  const choice = read('src/choice-control.jsx'), browser = read('tests/recovery-browser.mjs');
  assert.match(choice, /if\(!anchor.isConnected\|\|rect.bottom<top\|\|rect.top>top\+height\)\{close\(\);return\}/, 'Offscreen anchors do not leave stray popovers visible');
  assert.match(browser, /fulfillment\.scrollIntoViewIfNeeded\(\);await fulfillment\.click\(\);await expect\(fulfillment\)\.toHaveAttribute\('aria-expanded','true'\)/);
  assert.match(browser, /fulfillment\.fill\('Delivered'\);const fulfillmentChoices=expanded.getByRole\('listbox',\{name:'Fulfillment for order '\+orderId.slice\(0,8\),exact:true\}\)/);
  assert.match(browser, /expect\(deliveredChoice\)\.toHaveCount\(1\);await expect\(deliveredChoice\)\.toBeVisible\(\);await deliveredChoice\.click\(\)/);
  assert.match(browser, /toEqual\(\{claimId:orderId,claimStatus:'delivered',orderId,orderStatus:'delivered'\}\)/);
  assert.doesNotMatch(browser, /(?:selectOption\(|\.click\(\{force:|evaluate\([^;]*\.value\s*=)/);
});


test('Recovery Following verifies every real scope and keeps Off separate from preserved history',()=>{
 const choices=NOTIFICATION_SCOPES.filter(option=>option.value!=='off'),browser=read('tests/recovery-browser.mjs'),ui=read('src/notifications.jsx');
 assert.deepEqual(choices.map(option=>option.label),['Everyone','Family','Loved Ones','Selected people','Leaders']);
 assert.match(ui,/options=\{NOTIFICATION_SCOPES.filter\(option=>option.value!=='off'\)\}/);
 assert.match(browser,/followingLabels=\['Everyone','Family','Loved Ones','Selected people','Leaders'\]/);
 assert.match(browser,/NOTIFICATION_SCOPES.filter\(option=>option.value!=='off'\).map\(option=>option.label\),followingLabels/);
 assert.match(browser,/expect\(following.getByRole\('radio'\)\).toHaveCount\(5\)/);
 assert.match(browser,/for\(const label of followingLabels\)await expect\(following.getByRole\('radio',\{name:label,exact:true\}\)\).toBeVisible\(\)/);
 assert.match(browser,/following.getByRole\('radio',\{name:'Off',exact:true\}\).count\(\),0/);
 assert.match(browser,/pausedSettings.globalOff,true/);assert.match(browser,/pausedSettings.scope,'leaders'/);
 assert.doesNotMatch(browser,/following.getByRole\('radio'\).count\(\),4/);
});


test('fresh preview asserts the actual welcome and observes exceptions/writes through reload',()=>{
 const app=read('src/react-app.jsx'),browser=read('tests/recovery-browser.mjs'),welcome=browser.slice(browser.indexOf('const welcome=await browser.newPage'),browser.indexOf('// Field gallery geometry'));
 assert.match(app,/className="stack preview-welcome"/);
 assert.match(welcome,/welcome.on\('pageerror',error=>errors.push\(error.message\)\)/);
 assert.match(welcome,/welcome.on\('request',request=>\{if\(!\['GET','HEAD'\].includes\(request.method\(\)\)\)writes.push\(request.url\(\)\)\}\)/);
 assert.match(welcome,/expect\(welcome.locator\('\.preview-welcome'\)\).toBeVisible\(\)/);
 assert.match(welcome,/expect\(welcome.locator\('\.preview-welcome'\)\).toHaveCount\(0\)/);
 assert.doesNotMatch(welcome,/\.preview-notice/);
 assert.match(welcome,/await welcome.reload\(\)/);assert.match(welcome,/name:'Continue using preview',exact:true\}\).count\(\),0/);
});


test('Recovery gallery Home verifies first focus after the same real End navigation',()=>{
 const browser=read('tests/recovery-browser.mjs'),keyboard=read('src/carousel-model.js');
 assert.match(keyboard,/key==='Home'\)return 0/);
 assert.match(browser,/await p.keyboard.press\('Home'\);assert.equal\(await p.locator\('\.field-memory-open'\).first\(\).evaluate\(e=>document.activeElement===e\),true,'Home restores first gallery item focus'\)/);
 assert.match(browser,/await p.locator\('\.field-memory-open'\).last\(\).evaluate\(e=>document.activeElement===e\),true/);
});
