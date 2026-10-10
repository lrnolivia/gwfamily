// Live lines for the page stage (the full-bleed hero at the top of each main
// page). Pure functions so the wording can be tested without a browser.
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const pad=n=>String(n).padStart(2,'0');
const monthDay=date=>pad(date.getMonth()+1)+'-'+pad(date.getDate());
const firstName=name=>String(name||'').trim().split(/\s+/)[0]||'';

// The reunion date is free text ("July 18–20, 2027", "2027-07-18", "7/18/2027").
// Returns the first day as a local date, or null when it can't be read.
export function reunionStart(text){
 const s=String(text||'').toLowerCase();
 let m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
 if(m)return valid(+m[1],+m[2]-1,+m[3]);
 m=s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:[–—-]|to|through)\s*(?:[a-z]+\.?\s+)?\d{1,2}(?:st|nd|rd|th)?)?,?\s+(\d{4})\b/);
 if(m)return valid(+m[3],MONTHS.indexOf(m[1]),+m[2]);
 m=s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
 if(m)return valid(+m[3],+m[1]-1,+m[2]);
 return null;
}
function valid(y,mo,d){const date=new Date(y,mo,d);return date.getFullYear()===y&&date.getMonth()===mo&&date.getDate()===d?date:null}

// "214 days to go", "This week!", "Tomorrow!", "Today!"; '' when unknown or past.
export function countdownLabel(text,now=new Date()){
 const start=reunionStart(text);if(!start)return '';
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),days=Math.round((start-today)/864e5);
 if(days<0)return '';if(days===0)return 'Today!';if(days===1)return 'Tomorrow!';if(days<7)return 'This week!';
 return days.toLocaleString('en-US')+' days to go';
}

export function greeting(now=new Date(),name=''){
 const h=now.getHours(),part=h>=5&&h<12?'morning':h>=12&&h<17?'afternoon':'evening',first=firstName(name);
 return 'Good '+part+(first?', '+first:'');
}

// Only birthdays the family can already see: the shared calendar when live,
// preview members in the preview.
export function birthdaysToday(state,now=new Date()){
 const md=monthDay(now);
 if(state?.mode==='live')return (state.birthdayCalendar||[]).filter(b=>b.monthDay===md).map(b=>({id:b.memberId||b.id,name:b.name}));
 return (state?.members||[]).filter(m=>/^\d{4}-\d{2}-\d{2}$/.test(m.birthday||'')&&m.birthday.slice(5)===md).map(m=>({id:m.id,name:m.name}));
}
export function birthdayLine(people){
 const names=people.map(p=>firstName(p.name)).filter(Boolean);
 if(!names.length)return '';
 return 'Happy birthday, '+(names.length===1?names[0]:names.slice(0,-1).join(', ')+' and '+names.at(-1))+'!';
}

// A memory captured on today's month and day in an earlier year.
export function thisDayMemory(memories,now=new Date()){
 const md=monthDay(now),year=now.getFullYear();
 return (memories||[]).filter(m=>m.image&&/^\d{4}-\d{2}-\d{2}$/.test(m.capturedDate||'')&&m.capturedDate.slice(5)===md&&Number(m.capturedDate.slice(0,4))<year)
  .sort((a,b)=>a.capturedDate.localeCompare(b.capturedDate))[0]||null;
}
