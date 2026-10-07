import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profilePalette,contrast} from '../src/profile-model.js';
const css=fs.readFileSync(new URL('../dist/react-ui.css',import.meta.url),'utf8');
test('hotfix action palette has readable text on opaque controls across personal colors',()=>{
 for(const theme of ['light','dark'])for(const color of ['#4f996c','#c9aa52','#efcf46','#d24978','#627bf0','#9a57dc','#000000','#ffffff']){
  const p=profilePalette(color,theme);assert.ok(contrast(p['--control'],p['--surface'])>=3);assert.ok(contrast(p['--control-text'],p['--control'])>=4.5);
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
