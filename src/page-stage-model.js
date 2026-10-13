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

// ---- Wordmark colors from a hero photo ----
// Three inks for the wordmark ("green", "white", "family") taken from the photo's
// own colors, each adjusted in lightness until it reads on the color behind the
// header, with headroom over WCAG's 4.5:1 since photos vary under the text (6:1). Pure: pixels are [r,g,b] triples, bg is [r,g,b].
const lin=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};
export const luminance=([r,g,b])=>.2126*lin(r)+.7152*lin(g)+.0722*lin(b);
export const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05)};
export function rgbToHsl([r,g,b]){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;if(max===min)return [0,0,l];const d=max-min,s=l>.5?d/(2-max-min):d/(max+min);const h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;return [h*60,s,l]}
export function hslToRgb([h,s,l]){const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));return [f(0),f(8),f(4)].map(v=>Math.round(v*255))}
const hex=rgb=>'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
// The most present hues (weighted by saturation), at least 40° apart.
export function photoHues(pixels){
 const bins=Array.from({length:12},()=>({w:0,s:0,n:0}));
 for(const p of pixels){const [h,s,l]=rgbToHsl(p);if(s<.15||l<.12||l>.9)continue;const b=bins[Math.floor(h/30)%12];b.w+=s;b.s+=s;b.n++;b.h=(b.h||0)+h}
 const ranked=bins.map((b,i)=>({i,w:b.w,h:b.n?b.h/b.n:i*30+15,s:b.n?b.s/b.n:0})).filter(b=>b.w>0).sort((a,b)=>b.w-a.w),picked=[];
 for(const b of ranked){if(picked.every(p=>Math.min(Math.abs(p.h-b.h),360-Math.abs(p.h-b.h))>=40))picked.push(b);if(picked.length===3)break}
 return picked;
}
// Lighten or darken a hue until it reads on the background, trying the
// direction with more headroom first; failing both, the better of near-black or
// near-white.
export function readableInk(h,s,bg,{min=6,soft=false}={}){
 const sat=Math.max(soft?.18:.38,Math.min(soft?.35:.68,s)),light=luminance(bg)<.18;
 for(const dir of light?[1,-1]:[-1,1])for(let step=0;step<=48;step++){
  const l=dir>0?.6+step*.0083:.42-step*.0083,rgb=hslToRgb([h,sat,Math.max(0,Math.min(1,l))]);
  if(contrast(rgb,bg)>=min)return hex(rgb);
 }
 return contrast([255,255,255],bg)>=contrast([17,17,17],bg)?'#ffffff':'#111111';
}
export function wordmarkPalette(pixels,bg){
 const hues=photoHues(pixels);
 if(!hues.length)return null;
 const [a,b=a,c=a]=hues;
 return {green:readableInk(a.h,a.s,bg),white:readableInk(b.h,b.s,bg,{soft:true}),family:readableInk(c===a&&b!==a?b.h:c.h,Math.max(c.s,a.s),bg)};
}
