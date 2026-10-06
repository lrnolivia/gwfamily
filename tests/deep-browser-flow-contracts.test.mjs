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
