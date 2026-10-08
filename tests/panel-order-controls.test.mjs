import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform} from 'esbuild';
import {sharedPanelTitle} from '../src/shared-panels.js';

// Render the actual inspector JSX, without mounting the app or making reads.
const source = await readFile(new URL('../src/page-panels.jsx', import.meta.url), 'utf8');
const start = source.indexOf('<div className="page-editor-order">');
assert.ok(start >= 0);
const markup = source.slice(start, source.indexOf('</div>', start) + 6);
const {code} = await transform(`
 const {React,Control,Glyph,title}=globalThis.__panelOrderSSR;
 export function Order({busy}) {
  const page='home',narrow=true,selectedPanel={id:'native-reunion',kind:'native'};
  const editor={busy,content:{text:{reunionTitle:'Spring & family'}},records:{}};
  const setNotice=()=>{};
  return (${markup});
 }`, {loader:'jsx',format:'esm'});
globalThis.__panelOrderSSR = {React,Control:'button',Glyph:({className})=>React.createElement('svg',{'aria-hidden':true,className}),title:(panel,page,content,records)=>sharedPanelTitle(page,panel,content,records)};
const {Order} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
delete globalThis.__panelOrderSSR;

test('selected-panel order uses only arrows with current panel and direction in accessible names', () => {
 const html=renderToStaticMarkup(React.createElement(Order,{busy:false}));
 const buttons=[...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)];
 assert.equal(buttons.length,2);
 for(const [index,[,attributes,content]] of buttons.entries()) {
  const direction=index?'later':'earlier';
  assert.ok(attributes.includes(`aria-label="Move Spring &amp; family ${direction}"`),attributes);
  assert.ok(attributes.includes(`title="Move Spring &amp; family ${direction}"`),attributes);
  assert.equal(content.replace(/<[^>]*>/g,'').trim(),'','Order arrows have no visible Earlier/Later labels.');
  assert.match(content,/<svg aria-hidden="true"/);
  assert.ok(!attributes.includes('disabled'));
 }
});
test('in-flight saves retain the disabled state of both inspector order controls', () => {
 const html=renderToStaticMarkup(React.createElement(Order,{busy:true}));
 const buttons=[...html.matchAll(/<button([^>]*)>/g)];
 assert.equal(buttons.length,2);
 assert.ok(buttons.every(([,attributes])=>attributes.includes('disabled=""')));
});
