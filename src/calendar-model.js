// One calendar extends reunion_settings. Dates are calendar dates; timed events
// also retain their IANA zone and unambiguous UTC instants.
export const CALENDAR_COMMANDS=new Set(['SAVE_CALENDAR','SAVE_EVENT','ARCHIVE_EVENT','RESTORE_EVENT']);
export class CalendarError extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status)=>{throw new CalendarError(message,status)};
const string=(value,max,label,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail('Check '+label+'.');return value.trim()};
export function validCalendarDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9998-12-31')return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value}
export function calendarTimezone(value){const zone=string(value,100,'the time zone',true);try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return zone}catch{fail('Enter an IANA time zone, such as America/New_York or UTC.')}}
function localParts(instant,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))}
export function eventInstant(date,time,zone,occurrence=''){
 if(!validCalendarDate(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Enter a valid event date and time.');calendarTimezone(zone);
 if(!['','earlier','later'].includes(occurrence))fail('Choose an earlier or later clock-time occurrence.');
 const target=date+'T'+time,guess=Date.parse(target+':00Z'),offsets=new Set();
 for(const hours of [-36,-24,-12,0,12,24,36]){const instant=guess+hours*3600000,p=localParts(instant,zone);offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)-instant)}
 const matches=[...offsets].map(offset=>guess-offset).filter(instant=>{const p=localParts(instant,zone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===target}).sort((a,b)=>a-b);
 if(!matches.length)fail('That clock time does not exist in this time zone because the clocks change. Choose another time.');
 if(matches.length>1&&!occurrence)fail('That clock time occurs twice when the clocks change. Choose its first or second occurrence.');
 return new Date(occurrence==='later'?matches.at(-1):matches[0]).toISOString();
}
export function calendarRecord(details={}){const c=details.calendar||{};return {revision:Number.isSafeInteger(c.revision)?c.revision:0,visibility:c.visibility==='leaders'?'leaders':'family',timezone:c.timezone||'UTC',schedule:details.schedule||'',events:Array.isArray(c.events)?c.events:[]}}
export function canManageCalendar(state){return state.mode==='preview'||state.capabilities?.manageCalendar===true}
export function visibleCalendar(details={},leader=false){const c=calendarRecord(details);return {...c,events:leader?c.events:c.visibility==='family'?c.events.filter(e=>!e.archivedAt&&e.visibility==='family'):[],schedule:leader||c.visibility==='family'?c.schedule:''}}
export function normalizeEvent(value,defaultZone='UTC'){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Enter event details.');
 const title=string(value.title,160,'the event title',true),description=string(value.description||'',4000,'the event description'),location=string(value.location||'',300,'the event location'),timezone=calendarTimezone(value.timezone||defaultZone);
 if(typeof value.allDay!=='boolean')fail('Choose an all-day or timed event.');
 if(!['family','leaders'].includes(value.visibility))fail('Choose Family or Leaders-only event visibility.');
 const startDate=value.startDate,endDate=value.endDate||startDate;if(!validCalendarDate(startDate)||!validCalendarDate(endDate)||endDate<startDate)fail('Choose valid dates, with the end on or after the start.');
 const event={title,description,location,timezone,visibility:value.visibility,allDay:value.allDay,startDate,endDate,startTime:'',endTime:'',startOccurrence:'',endOccurrence:'',startsAt:null,endsAt:null};
 if(!event.allDay){event.startTime=value.startTime;event.endTime=value.endTime;event.startOccurrence=value.startOccurrence||'';event.endOccurrence=value.endOccurrence||'';event.startsAt=eventInstant(startDate,event.startTime,timezone,event.startOccurrence);event.endsAt=eventInstant(endDate,event.endTime,timezone,event.endOccurrence);if(event.endsAt<=event.startsAt)fail('The end time must be after the start time.');}
 return event;
}
export function applyCalendarCommand(details,input,{id,now=new Date().toISOString(),actorId='preview'}={}){
 const current=calendarRecord(details);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail('A calendar revision is required.');
 if(input.expectedRevision!==current.revision)fail('The calendar changed while you were editing. Load the latest version before saving.',409);
 let next={...current,events:[...current.events]};
 if(input.type==='SAVE_CALENDAR'){
  const settings=input.settings||{};if(!['family','leaders'].includes(settings.visibility))fail('Choose Family or Leaders-only calendar visibility.');
  next={...next,visibility:settings.visibility,timezone:calendarTimezone(settings.timezone),schedule:string(settings.schedule||'',4000,'the schedule')};
 }else if(input.type==='SAVE_EVENT'){
  const existing=input.event?.id?next.events.find(e=>e.id===input.event.id):null;
  if(input.event?.id&&!existing)fail('This event is no longer available.',404);if(existing?.archivedAt)fail('Restore this event before editing it.',409);
  const value=normalizeEvent(input.event,current.timezone);if(!existing&&next.events.length>=1000)fail('This calendar has reached its event limit. Existing events are still available.');
  const event={...value,id:existing?.id||id,createdAt:existing?.createdAt||now,createdBy:existing?.createdBy||actorId,updatedAt:now,archivedAt:null};if(!event.id)fail('The event needs an identifier.');
  next.events=existing?next.events.map(e=>e.id===event.id?event:e):[...next.events,event];
 }else if(['ARCHIVE_EVENT','RESTORE_EVENT'].includes(input.type)){
  const event=next.events.find(e=>e.id===input.id);if(!event)fail('This event is no longer available.',404);
  next.events=next.events.map(e=>e.id===input.id?{...e,updatedAt:now,archivedAt:input.type==='ARCHIVE_EVENT'?now:null}:e);
 }else fail('Unsupported calendar action.');
 next.revision++;const {schedule,...calendar}=next;return {...details,schedule,calendar};
}
export function eventWhen(event,locale){
 const date=value=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(value+'T12:00:00Z'));
 if(event.allDay)return date(event.startDate)+(event.endDate!==event.startDate?' – '+date(event.endDate):'')+' · All day';
 const format=value=>new Intl.DateTimeFormat(locale,{timeZone:event.timezone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
 return format(event.startsAt)+' – '+format(event.endsAt)+' · '+event.timezone;
}
export function sortedEvents(events){return [...events].sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.startTime||'').localeCompare(b.startTime||'')||a.title.localeCompare(b.title))}
