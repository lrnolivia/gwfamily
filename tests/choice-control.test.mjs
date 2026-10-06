import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {profilePalette,contrast} from '../src/profile-model.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=fs.readFileSync(new URL('../src/choice-control.jsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/choice-control.css',import.meta.url),'utf8');
const built=buildSync({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ChoiceControl} from './src/choice-control.jsx';export {normalizeChoices,filterChoices,nextChoiceIndex} from './src/choice-control.jsx';export function render(props){return renderToStaticMarkup(React.createElement(ChoiceControl,props))}`,resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false,loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {render,normalizeChoices,filterChoices,nextChoiceIndex}=module.exports;

test('choice values match native select strings and retain labels and disabled state',()=>{
 assert.deepEqual(normalizeChoices([1,'2',{value:'3',label:'Three',disabled:true}]),[{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'Three',disabled:true}]);
 assert.deepEqual(normalizeChoices([{value:'',label:'All'}]),[{value:'',label:'All'}]);
});
test('search is accent-insensitive, matches all words, and never searches hidden values',()=>{
 const options=normalizeChoices([{value:'secret-id',label:'José Williams'},{value:'b',label:'Robin Jones',searchText:'R.J.'}]);
 assert.equal(filterChoices(options,'jose will')[0].value,'secret-id');
 assert.equal(filterChoices(options,'R.J.')[0].value,'b');
 assert.equal(filterChoices(options,'secret-id').length,0);
 assert.equal(filterChoices(options,'not found').length,0);
});
test('keyboard movement wraps, skips disabled entries, and handles empty results',()=>{
 const options=normalizeChoices(['One',{value:'2',label:'Unavailable',disabled:true},'Three']);
 assert.equal(nextChoiceIndex(options,0,'ArrowDown'),2);
 assert.equal(nextChoiceIndex(options,2,'ArrowDown'),0);
 assert.equal(nextChoiceIndex(options,0,'ArrowUp'),2);
 assert.equal(nextChoiceIndex(options,2,'Home'),0);
 assert.equal(nextChoiceIndex(options,0,'End'),2);
 assert.equal(nextChoiceIndex(options,-1,'ArrowUp'),2);
 assert.equal(nextChoiceIndex([],-1,'ArrowDown'),-1);
 assert.equal(nextChoiceIndex([{disabled:true}],0,'Home'),-1);
});
test('short choices use native grouped radios with selected and required semantics',()=>{
 const html=render({label:'Your plans',options:['Coming','Deciding','Cannot come'],value:'Deciding',name:'plans',required:true});
 assert.match(html,/<fieldset[^>]*choice-control-chips/);
 assert.match(html,/<legend[^>]*>Your plans/);
 assert.equal((html.match(/type="radio"/g)||[]).length,3);
 assert.equal((html.match(/name="plans"/g)||[]).length,3);
 assert.match(html,/required=""[^>]*checked=""[^>]*value="Deciding"|checked=""[^>]*value="Deciding"/);
 assert.doesNotMatch(html,/<select|role="dialog"/);
});
test('optional blank selections stay selectable; required blank options cannot bypass validation',()=>{
 const options=[{value:'',label:'Not specified'},'Woman','Man'];
 assert.match(render({label:'Gender',options,value:''}),/checked=""[^>]*value=""/);
 const required=render({label:'Gender',options,value:'',required:true});
 assert.doesNotMatch(required,/Not specified|checked=""/);
 assert.equal((required.match(/required=""/g)||[]).length,2);
});
test('long and dynamic lists provide labelled searchable comboboxes with form values',()=>{
 const html=render({id:'people',label:'How many people?',options:Array.from({length:20},(_,i)=>i+1),value:3,name:'count',required:true});
 assert.match(html,/role="combobox"/);
 assert.match(html,/aria-autocomplete="list"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/aria-controls="people-list"/);
 assert.match(html,/popover="manual"/);
 assert.match(html,/role="listbox"/);
 assert.match(html,/<input type="hidden"[^>]*name="count"[^>]*value="3"/);
 assert.match(render({label:'Dynamic',variant:'search',options:['Only one']}),/role="combobox"/);
 assert.match(render({label:'Empty required',options:[],required:true}),/role="combobox"[^>]*required=""/);
});
test('disabled state and error descriptions reach native controls and screen readers',()=>{
 const chips=render({label:'Plans',options:['One','Two'],value:'One',disabled:true,error:'Please review this choice.',help:'Choose one.'});
 assert.match(chips,/<fieldset[^>]*disabled=""/);
 assert.match(chips,/aria-invalid="true"/);
 assert.match(chips,/role="alert">Please review this choice/);
 const search=render({label:'Owner',options:['One','Two'],variant:'search',disabled:true,name:'owner',value:'One'});
 assert.match(search,/role="combobox"[^>]*disabled=""/);
 assert.match(search,/type="hidden"[^>]*disabled=""/);
});
test('search selection is explicit, required queries do not count as a selected value',()=>{
 assert.match(source,/setCustomValidity\(required&&!validSelection/);
 assert.match(source,/event\.nativeEvent\.isComposing/);
 assert.match(source,/event\.key==='Escape'&&open[^\n]*event\.stopPropagation\(\)/);
 assert.match(source,/event\.key==='Tab'\)close\(\)/);
 assert.match(source,/showPopover\(\)/);
 assert.match(source,/visualViewport/);
 assert.doesNotMatch(source,/<select|aria-modal/);
});
test('migrated forms no longer render classic selects',()=>{
 for(const file of ['family','planner','profiles','memories','merchandise-manager','households']){
  const text=fs.readFileSync(new URL(`../src/${file}.jsx`,import.meta.url),'utf8');
  assert.match(text,/import \{ChoiceControl\}/,file);
  assert.doesNotMatch(text,/<select\b/,file);
 }
});
test('Send preserves geometry, current palette, visible empty state, and busy accent',()=>{
 const send=css.slice(css.indexOf('/* The supplied screenshot'));
 assert.match(send,/\.send-button\.send-button\[aria-busy=true\]/);
 assert.match(send,/:disabled:not\(\[aria-busy=true\]\)[^{]*\{background:var\(--surface\)!important;color:var\(--control,var\(--accent\)\)!important/);
 assert.match(send,/--gw-control-alpha:100%/);
 assert.doesNotMatch(send,/(?:width|height|border-radius):/);
 assert.doesNotMatch(send,/#[0-9a-f]{3,8}/i);
 for(const theme of ['light','dark'])for(const color of ['#c9aa52','#4f996c','#d24978','#627bf0','#9a57dc','#000000','#ffffff']){
  const palette=profilePalette(color,theme);
  assert.ok(contrast(palette['--control'],palette['--surface'])>=3,`${theme} ${color} empty-state icon contrast`);
  assert.ok(contrast(palette['--control-text'],palette['--control'])>=4.5,`${theme} ${color} enabled foreground contrast`);
 }
});
