// Real source components, rendered offline. Interactive and device checks remain
// separate gates; these tests never write family records or contact a service.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {FAMILY_EVENT_TYPES} from '../src/family-calendar-model.js';
const root=new URL('../',import.meta.url).pathname;
const source=readFileSync(root+'src/family-calendar.jsx','utf8');
const css=readFileSync(root+'src/family-calendar.css','utf8');
const bundle=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {AppContext,FloatingSurfaceContext} from './src/ui-core.jsx';import {FamilyCalendarFilters,FamilyEventForm,DeleteFamilyEvent} from './src/family-calendar.jsx';export function render(name,props){const components={FamilyCalendarFilters,FamilyEventForm,DeleteFamilyEvent};return renderToStaticMarkup(<AppContext.Provider value={{platform:'android',state:{mode:'preview',selfId:'fictional-adult',members:[]},data:{pending:false}}}><FloatingSurfaceContext.Provider value={true}>{React.createElement(components[name],props)}</FloatingSurfaceContext.Provider></AppContext.Provider>)}`,resolveDir:root,loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'expose-calendar-test-boundaries',setup(b){b.onLoad({filter:/family-calendar\.jsx$/},()=>({contents:source+'\nexport {FamilyCalendarFilters,FamilyEventForm,DeleteFamilyEvent};',loader:'jsx',resolveDir:root+'src'}));}}]});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const {render}=module.exports;
const noop=()=>{};
const event={id:'fictional-event',createdBy:'fictional-adult',title:'Fictional gathering',eventType:'gathering',recurrence:'none',allDay:true,startDate:'2027-06-19',endDate:'',timezone:'UTC',description:'',location:'',revision:4};

test('fixed event filters use all eight native radio choices, with no Change/Done search menu',()=>{
 const html=render('FamilyCalendarFilters',{filter:'all',onFilter:noop,query:'',onQuery:noop});
 assert.equal((html.match(/type="radio"/g)||[]).length,8);
 for(const value of ['all',...FAMILY_EVENT_TYPES,'birthday'])assert.match(html,new RegExp('value="'+value+'"'));
 assert.match(html,/type="search"[^>]*placeholder="Search event titles"/);
 assert.match(html,/aria-expanded="false"[^>]*aria-controls=/);
 assert.match(html,/family-calendar-type-options" hidden="" inert=""/);
 assert.doesNotMatch(html,/role="combobox"|choice-change|choice-popover|Clear filters/);
});

test('the collapsed filter always names the selected event type and exposes reset only for active filters',()=>{
 for(const [filter,query,label] of [['anniversary','','Anniversaries'],['all','fictional','All events']]){
  const html=render('FamilyCalendarFilters',{filter,query,onFilter:noop,onQuery:noop});
  assert.match(html,new RegExp('id="[^"]+-selection">'+label));
  assert.match(html,/Clear filters/);
  assert.match(html,new RegExp('checked="" value="'+filter+'"'));
 }
 assert.match(source,/event\.key==='Escape'[\s\S]*setOpen\(false\);trigger\.current\?\.focus\(\)/);
 assert.match(source,/const reset=\(\)=>\{onFilter\('all'\);onQuery\(''\);search\.current\?\.focus\(\)\}/);
});

test('event creation displays the six supported types directly without adding birthday creation',()=>{
 const html=render('FamilyEventForm',{busy:false,uncertain:false,moderated:false,onSave:noop,onClose:noop});
 const types=html.match(/<div class="family-event-type-platter">([\s\S]*?)<\/fieldset><\/div>/)?.[1];
 assert.ok(types);assert.equal((types.match(/type="radio"/g)||[]).length,6);
 for(const value of FAMILY_EVENT_TYPES)assert.match(types,new RegExp('value="'+value+'"'));
 assert.match(types,/checked="" value="gathering"/);assert.doesNotMatch(types,/birthday|combobox|choice-change/);
 assert.match(html,/Published events are visible to approved family members/);
});

test('existing type, recurrence, moderation and ambiguous-save recovery stay explicit',()=>{
 const html=render('FamilyEventForm',{event:{...event,eventType:'anniversary',recurrence:'yearly',monthDay:'06-19',originYear:null},busy:false,uncertain:true,moderated:true,onSave:noop,onClose:noop});
 assert.match(html,/checked="" value="anniversary"/);assert.match(html,/checked="" value="yearly"/);
 assert.match(html,/Month and day \(MM-DD\)/);assert.match(html,/Original year · If known/);
 assert.match(html,/Explain the change to the contributor<textarea required=""/);
 assert.match(html,/The earlier save is unconfirmed/);
 assert.match(source,/normalizeFamilyEvent\(value\);await onSave\(\{action:'save',event:value,reason,expectedRevision:event\?\.revision\|\|0\}\)/);
});

test('timed events retain both clock-change occurrence choices and time zone fields',()=>{
 const html=render('FamilyEventForm',{event:{...event,allDay:false,startTime:'01:15',endTime:'02:15'},busy:false,uncertain:false,moderated:false,onSave:noop,onClose:noop});
 for(const label of ['Start time','End time','Start clock-change occurrence','End clock-change occurrence','Time zone'])assert.ok(html.includes(label),label);
 assert.equal((html.match(/First occurrence/g)||[]).length,2);assert.equal((html.match(/Second occurrence/g)||[]).length,2);
});

test('busy forms disable all choices and preserve one sticky cancel/submit row',()=>{
 const html=render('FamilyEventForm',{event,busy:true,uncertain:false,moderated:false,onSave:noop,onClose:noop});
 assert.match(html,/family-event-type-choices" disabled=""/);
 assert.equal((html.match(/sheet-footer family-event-footer/g)||[]).length,1);
 assert.match(html,/<form id="[^"]+" class="gw-form family-event-form"/);
 assert.ok(html.indexOf('>Cancel<')<html.indexOf('>Saving…<'));
 assert.match(source,/useSheetForm\(\{label:event\?'Save family event':'Publish family event',busy\}\)/);
 const removal=render('DeleteFamilyEvent',{event,busy:true,moderated:true,onSave:noop,onClose:noop});
 assert.match(removal,/Explain the removal to the contributor<textarea required=""/);
 assert.match(removal,/sheet-footer family-event-footer/);assert.match(removal,/>Keep event</);assert.match(removal,/>Removing…</);
});

test('calendar refinement stays scoped, token-based and keyboard-visible',()=>{
 assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|font-family:|backdrop-filter|--accent\s*:/i);
 for(const token of ['--raised','--surface','--text','--muted','--control'])assert.ok(css.includes(token),token);
 assert.match(css,/family-calendar-type-options\[hidden\]\{display:none\}/);
 assert.match(css,/min-height:44px/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(source,/className="row family-calendar-event-actions"/);assert.match(css,/family-calendar-event-actions\.row>\.button\{width:auto;flex:0 1 auto/);
 assert.match(source,/<Birthdays\/>/);assert.match(source,/state\.birthdayCalendar\|\|\[\]/);
});
