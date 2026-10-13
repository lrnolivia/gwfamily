import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyCalendarCommand,calendarRecord,eventInstant,eventWhen,normalizeEvent,validCalendarDate,visibleCalendar} from '../src/calendar-model.js';
import {initialState,reducer,resetPreview} from '../src/data-adapter.js';
const event={title:'Synthetic family picnic',description:'Isolated test fixture',location:'Synthetic park',allDay:false,startDate:'2027-06-19',endDate:'2027-06-19',startTime:'12:00',endTime:'14:00',timezone:'America/New_York',visibility:'family'};
const save=(details,value,revision=0)=>applyCalendarCommand(details,{type:'SAVE_EVENT',event:value,expectedRevision:revision},{id:'fixture-event',now:'2026-10-06T19:00:00Z',actorId:'fixture-leader'});
test('real dates, IANA zones, intervals and text limits are validated',()=>{
 assert.equal(validCalendarDate('2027-02-29'),false);assert.equal(validCalendarDate('2028-02-29'),true);
 for(const patch of [{title:''},{title:'x'.repeat(161)},{startDate:'2027-02-30'},{endDate:'2027-06-18'},{startTime:'25:00'},{endTime:'12:00'},{timezone:'Bad/Zone'},{allDay:'false'},{visibility:'public'}])assert.throws(()=>normalizeEvent({...event,...patch}));
 assert.equal(normalizeEvent(event).startsAt,'2027-06-19T16:00:00.000Z');
});
test('spring gaps reject; repeated hours require an explicit occurrence',()=>{
 assert.throws(()=>eventInstant('2026-03-08','02:30','America/New_York'),/does not exist/);
 assert.throws(()=>eventInstant('2026-11-01','01:30','America/New_York'),/occurs twice/);
 assert.equal(eventInstant('2026-11-01','01:30','America/New_York','earlier'),'2026-11-01T05:30:00.000Z');
 assert.equal(eventInstant('2026-11-01','01:30','America/New_York','later'),'2026-11-01T06:30:00.000Z');
 assert.equal(eventInstant('2027-06-19','12:00','Asia/Kathmandu'),'2027-06-19T06:15:00.000Z');
});
test('all-day dates are timezone-independent and end date is inclusive',()=>{
 const value=normalizeEvent({...event,allDay:true,startDate:'2027-06-19',endDate:'2027-06-21',timezone:'Pacific/Kiritimati',startTime:'bad'});
 assert.equal(value.startsAt,null);assert.equal(value.endDate,'2027-06-21');assert.match(eventWhen(value,'en-US'),/Jun 19, 2027.*Jun 21, 2027.*All day/);
});
test('same record serves member calendar; drafts and archive never appear',()=>{
 let details=save({schedule:'Shared overview',payment:{amount:'unchanged'}},event);
 assert.equal(calendarRecord(details).revision,1);assert.equal(visibleCalendar(details).events.length,1);assert.equal(details.payment.amount,'unchanged');
 details=applyCalendarCommand(details,{type:'ARCHIVE_EVENT',id:'fixture-event',expectedRevision:1});assert.equal(visibleCalendar(details).events.length,0);assert.equal(visibleCalendar(details,true).events.length,1);
 details=applyCalendarCommand(details,{type:'RESTORE_EVENT',id:'fixture-event',expectedRevision:2});assert.equal(visibleCalendar(details).events.length,1);
 details=applyCalendarCommand(details,{type:'SAVE_CALENDAR',expectedRevision:3,settings:{visibility:'leaders',timezone:'UTC',schedule:'Private plan'}});assert.deepEqual(visibleCalendar(details).events,[]);assert.equal(visibleCalendar(details).schedule,'');assert.equal(visibleCalendar(details,true).schedule,'Private plan');
 assert.equal(visibleCalendar(save({}, {...event,visibility:'leaders'})).events.length,0);
 assert.throws(()=>applyCalendarCommand(details,{type:'ARCHIVE_EVENT',id:'fixture-event',expectedRevision:0}),e=>e.status===409);
});
test('preview mutations are isolated and resettable; legacy details retain events',()=>{
 const state={...initialState(),previewRoleView:'leader'},next=reducer(state,{type:'SAVE_EVENT',expectedRevision:0,event});assert.equal(next.details.calendar.events.length,1);assert.equal(state.details.calendar,undefined);
 const edited=reducer(next,{type:'DETAILS',value:{schedule:'Updated overview'}});assert.equal(edited.details.calendar.events.length,1);assert.equal(edited.details.calendar.revision,2);
 assert.equal(resetPreview({removeItem(){}}).details.calendar,undefined);
});
test('UI integration exposes full-page manager without a modal or event sends',()=>{
 const ui=readFileSync(new URL('../src/calendar-events.jsx',import.meta.url),'utf8'),leader=readFileSync(new URL('../src/leader-tools.jsx',import.meta.url),'utf8'),app=readFileSync(new URL('../src/react-app.jsx',import.meta.url),'utf8');
 assert.match(leader,/\['calendar','Schedule','calendar'\]/);assert.match(app,/<MemberCalendar\/>/);assert.match(ui,/Use latest revision with my changes/);assert.doesNotMatch(ui,/openSheet|window\.confirm|sendInvit|notificationApi/);
 assert.match(ui,/disabled=\{stale\}/);assert.match(ui,/Retry same save/);assert.match(ui,/role="alert"/);assert.match(ui,/type="date"/);
});
