import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profilePalette,contrast} from '../src/profile-model.js';
const css=fs.readFileSync(new URL('../dist/react-ui.css',import.meta.url),'utf8');
test('hotfix action palette has readable text on opaque controls across personal colors',()=>{
 for(const theme of ['light','dark'])for(const color of ['#4f996c','#c9aa52','#efcf46','#d24978','#627bf0','#9a57dc','#000000','#ffffff']){
  const p=profilePalette(color,theme);assert.equal(p['--control-text'],'#ffffff');assert.equal(p['--ink'],'#ffffff');assert.ok(contrast(p['--control'],p['--surface'])>=3);assert.ok(contrast(p['--control-text'],p['--control'])>=4.5);
 }
 assert.match(css,/--gw-control-alpha:100%/);
});
test('shared red sign out stays readable independently of profile accents',()=>{
 const accountCss=fs.readFileSync(new URL('../src/account-actions.css',import.meta.url),'utf8');
 assert.ok(contrast('#c9283d','#ffffff')>=4.5);
 assert.match(accountCss,/\.sign-out\.sign-out\{background:#c9283d!important;color:#fff!important/);
});
test('menu endpoints share vertical padding and desktop action is beside navigation',()=>{
 assert.match(css,/\.list-row:first-child,\.list-row:last-child[^}]*align-items:center[^}]*padding:calc\(14px/);
 assert.match(css,/left:calc\(50% \+ 220px\)/);
 assert.match(css,/\.field-memory-caption\{[^}]*linear-gradient\(transparent,#000000e0\)/);
});

test('custom color stays outside scrolling palette on narrow screens',()=>{
 assert.match(css,/\.profile-color-options>\.profile-swatches-scroll\{[^}]*flex:1 1 0%[^}]*overflow-x:auto/);
 assert.match(css,/\.profile-color-options>\.profile-custom-color\{[^}]*flex:0 0 58px/);
});

test('light wordmark uses beige, warm white and a readable brown edge across personal surfaces',()=>{
 const source=fs.readFileSync(new URL('../src/visual-system.css',import.meta.url),'utf8');
 for(const color of ['#c9b68d','#fffaf0','#603b26'])assert.ok(source.includes('color:'+color+'!important'));
 assert.match(source,/-webkit-text-stroke:1px #603b26;paint-order:stroke fill/);
 for(const accent of ['#4f996c','#c7a64a','#bc7060','#6b91b0','#936b91','#8a8178','#000000','#ffffff']){
  const palette=profilePalette(accent,'light');
  for(const background of ['--bg','--surface'])assert.ok(contrast('#603b26',palette[background])>=4.5,'wordmark edge on '+accent+' '+background);
 }
});
