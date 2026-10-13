import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeFamilyEvent,nextFamilyOccurrence,canEditFamilyEvent,familyCalendarEvents} from '../src/family-calendar-model.js';
const anniversary={title:'Fictional anniversary',description:'Fixture only',eventType:'anniversary',recurrence:'yearly',monthDay:'06-19',originYear:'',timezone:'UTC'};
test('yearly milestones preserve unknown original years, leap days and upcoming occurrence',()=>{
 const e=normalizeFamilyEvent(anniversary);assert.equal(e.originYear,null);assert.equal(e.startDate,undefined);assert.equal(nextFamilyOccurrence(e,'2026-10-08').startDate,'2027-06-19');
 const leap=normalizeFamilyEvent({...anniversary,monthDay:'02-29'});assert.equal(nextFamilyOccurrence(leap,'2026-10-08').startDate,'2028-02-29');
 assert.throws(()=>normalizeFamilyEvent({...anniversary,monthDay:'02-30'}));assert.throws(()=>normalizeFamilyEvent({...anniversary,originYear:'unknown'}));assert.equal(normalizeFamilyEvent({...anniversary,originYear:'1976'}).originYear,1976);
});
test('family events reuse timezone/DST validation, keep separate boundaries and creator authority',()=>{
 const ordinary=normalizeFamilyEvent({title:'Synthetic graduation',eventType:'graduation',recurrence:'none',allDay:true,startDate:'2027-05-18',timezone:'UTC'});assert.equal(ordinary.visibility,'family');
 assert.equal(canEditFamilyEvent({id:'a',roles:[]},{createdBy:'b'}),false);for(const actor of [{id:'a',roles:['moderator']},{id:'a',roles:['admin']},{id:'a',isLeader:true},{id:'b'}])assert.equal(canEditFamilyEvent(actor,{createdBy:'b'}),true);
 assert.deepEqual(familyCalendarEvents([{...ordinary,id:'one'},{...ordinary,id:'gone',deletedAt:'x'}],{today:'2026-10-08',type:'graduation'}).map(e=>e.id),['one']);
 assert.throws(()=>normalizeFamilyEvent({...ordinary,allDay:false,startDate:'2027-03-14',startTime:'02:30',endTime:'04:00',timezone:'America/New_York'}),/does not exist/);
});
