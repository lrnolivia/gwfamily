import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profilePalette,contrast} from '../src/profile-model.js';
const css=fs.readFileSync(new URL('../dist/react-ui.css',import.meta.url),'utf8');
test('hotfix action palette has readable text on opaque controls across personal colors',()=>{
 for(const theme of ['light','dark'])for(const color of ['#e64f59','#f08091','#ed8b32','#ec9d00','#36a267','#3985e6','#a267d5','#8a8178','#000000','#ffffff']){
  const p=profilePalette(color,theme);assert.equal(p['--control-text'],'#ffffff');assert.equal(p['--ink'],p['--control-text']);assert.ok(Math.max(contrast(p['--control'],p['--surface']),contrast(p['--control-edge'],p['--surface']))>=3);assert.ok(contrast(p['--control-text'],p['--accent-label-glow-core']||p['--control'])>=4.5);
 }
 assert.match(css,/--gw-control-alpha:100%/);
});
test('shared red sign out stays readable independently of profile accents',()=>{
 const accountCss=fs.readFileSync(new URL('../src/account-actions.css',import.meta.url),'utf8');
 assert.ok(contrast('#e52236','#ffffff')>=4.5);
 assert.match(accountCss,/\.sign-out\.sign-out\{background:#e52236!important;color:#fff!important/);
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

test('approved yellow preserves its exact fill and white lettering with a warm glow',()=>{
 for(const theme of ['light','dark']){
  const palette=profilePalette('#ec9d00',theme);
  assert.equal(palette['--control'],'#ec9d00');assert.equal(palette['--control-text'],'#ffffff');
  assert.ok(contrast('#ffffff',palette['--control'])<4.5,'Raw yellow alone is not a contrast pass.');
  assert.ok(contrast('#ffffff',palette['--accent-label-glow-core'])>=4.5,'White separates from the opaque glow core.');
  assert.match(palette['--accent-label-glow'],/^0 0 1px #714300,/);
  assert.ok(contrast(palette['--control-edge'],palette['--surface'])>=3);
 }
});
