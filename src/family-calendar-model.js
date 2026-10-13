import {CalendarError,normalizeEvent,validCalendarDate,eventWhen} from './calendar-model.js';
export const FAMILY_EVENT_TYPES=Object.freeze(['gathering','graduation','wedding','anniversary','milestone','other']);
const fail=message=>{throw new CalendarError(message)};
export function normalizeFamilyEvent(value){
 if(!value||!FAMILY_EVENT_TYPES.includes(value.eventType))fail('Choose an event type.');
 const recurrence=value.recurrence||'none';if(!['none','yearly'].includes(recurrence))fail('Choose one-time or yearly recurrence.');
 if(recurrence==='yearly'){
  const monthDay=value.monthDay;if(typeof monthDay!=='string'||!/^\d{2}-\d{2}$/.test(monthDay)||!validCalendarDate('2000-'+monthDay))fail('Enter a valid month and day.');
  const originYear=value.originYear==null||value.originYear===''?null:Number(value.originYear);
  if(originYear!==null&&(!Number.isInteger(originYear)||originYear<1900||originYear>9998))fail('Enter a known four-digit year or leave it blank.');
  // 2000 is a leap-year validation anchor, not the original milestone year.
  // Only month/day and an explicitly supplied original year are stored.
  const normalized=normalizeEvent({...value,visibility:'family',allDay:true,startDate:'2000-'+monthDay,endDate:'2000-'+monthDay,timezone:value.timezone||'UTC'});
  const {startDate,endDate,startsAt,endsAt,...details}=normalized;
  return {...details,eventType:value.eventType,recurrence,monthDay,originYear};
 }
 return {...normalizeEvent({...value,visibility:'family'},'UTC'),eventType:value.eventType,recurrence,originYear:null};
}
export function canModerateFamilyCalendar(actor){return actor?.isLeader===true||(actor?.roles||[]).some(role=>['admin','moderator'].includes(role))}
export function canEditFamilyEvent(actor,event){return !!actor?.id&&(event?.createdBy===actor.id||canModerateFamilyCalendar(actor))}
export function nextFamilyOccurrence(event,today){
 if(event.recurrence!=='yearly')return event;
 const year=Number(today.slice(0,4));
 for(let n=year;n<=Math.min(9998,year+8);n++){
  const date=n+'-'+event.monthDay;if(date>=today&&validCalendarDate(date)&&(event.originYear==null||n>=event.originYear))return {...event,startDate:date,endDate:date};
 }
 return null;
}
export function familyEventWhen(event,today){const occurrence=nextFamilyOccurrence(event,today);return occurrence?eventWhen(occurrence)+(event.recurrence==='yearly'?' · Yearly'+(event.originYear?' · Since '+event.originYear:''):''):''}
export function familyCalendarEvents(events,{today,type='all',query=''}={}){
 return events.filter(e=>!e.deletedAt&&(type==='all'||e.eventType===type)&&(!query||e.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
  .map(e=>nextFamilyOccurrence(e,today)).filter(Boolean).sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.startTime||'').localeCompare(b.startTime||''));
}
