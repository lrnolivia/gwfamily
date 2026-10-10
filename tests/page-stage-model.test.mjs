import test from 'node:test';
import assert from 'node:assert/strict';
import {reunionStart,countdownLabel,greeting,birthdaysToday,birthdayLine,thisDayMemory} from '../src/page-stage-model.js';

const day=(y,m,d,h=10)=>new Date(y,m-1,d,h);

test('reads the free-text reunion date in the forms planners use',()=>{
 for(const text of ['July 18–20, 2027','Jul 18, 2027','July 18th - 20th, 2027','Saturday, July 18 2027','2027-07-18','7/18/2027','July 18 to July 20, 2027'])
  assert.deepEqual(reunionStart(text),day(2027,7,18,0),text);
 for(const text of ['','Dates to be announced','Summer 2027','February 30, 2027'])assert.equal(reunionStart(text),null,text);
});

test('counts down in whole days and goes quiet once the reunion has started',()=>{
 const now=day(2026,10,10);
 assert.equal(countdownLabel('2027-07-18',now),'281 days to go');
 assert.equal(countdownLabel('October 10, 2026',now),'Today!');
 assert.equal(countdownLabel('October 11, 2026',now),'Tomorrow!');
 assert.equal(countdownLabel('October 15, 2026',now),'This week!');
 assert.equal(countdownLabel('October 9, 2026',now),'');
 assert.equal(countdownLabel('Dates to be announced',now),'');
});

test('greets by time of day with the first name only',()=>{
 assert.equal(greeting(day(2026,10,10,7),'Ivy June Quill'),'Good morning, Ivy');
 assert.equal(greeting(day(2026,10,10,13),''),'Good afternoon');
 assert.equal(greeting(day(2026,10,10,22),'Ivy'),'Good evening, Ivy');
 assert.equal(greeting(day(2026,10,10,2),'Ivy'),'Good evening, Ivy');
});

test('birthdays come only from what the family can already see',()=>{
 const now=day(2026,10,10);
 const live={mode:'live',members:[{id:'a',name:'Private Person',birthday:'1990-10-10'}],birthdayCalendar:[{memberId:'b',name:'Shared Person',monthDay:'10-10'},{memberId:'c',name:'Other Day',monthDay:'10-11'}]};
 assert.deepEqual(birthdaysToday(live,now),[{id:'b',name:'Shared Person'}],'live uses the shared calendar, never member birthdays');
 const preview={mode:'preview',members:[{id:'x',name:'Fixture One',birthday:'1980-10-10'},{id:'y',name:'Fixture Two',birthday:null}]};
 assert.deepEqual(birthdaysToday(preview,now),[{id:'x',name:'Fixture One'}]);
 assert.equal(birthdayLine([{name:'Ann Lee'}]),'Happy birthday, Ann!');
 assert.equal(birthdayLine([{name:'Ann'},{name:'Bo'},{name:'Cy'}]),'Happy birthday, Ann, Bo and Cy!');
 assert.equal(birthdayLine([]),'');
});

test('this day in family history needs a photo from an earlier year',()=>{
 const now=day(2026,10,10);
 const memories=[{id:'1',image:'a.jpg',capturedDate:'2026-10-10'},{id:'2',image:'b.jpg',capturedDate:'2001-10-10'},{id:'3',image:null,capturedDate:'1999-10-10'},{id:'4',image:'d.jpg',capturedDate:'1998-10-10'}];
 assert.equal(thisDayMemory(memories,now).id,'4');
 assert.equal(thisDayMemory([{id:'5',image:'e.jpg'}],now),null);
});
