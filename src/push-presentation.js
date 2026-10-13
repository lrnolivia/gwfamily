// Fixed, useful copy is shared by the sender and service worker. The transport
// envelope stays v:1 for old installed workers. Rich rendering is additive.
const COPY=Object.freeze({
 update:['Family update','Open GW to see what’s new.'],
 message:['New message','Open your conversation to read it.'],
 invitation:['Conversation invitation','Open GW to accept or decline.'],
 conversation:['Conversation updated','Open your conversation for details.'],
 post:['New family post','Open GW to read the update.'],
 memory:['New shared memory','Open GW to see the memory.'],
 mention:['You were tagged','Open GW to see the update.'],
 reply:['New reply','Open GW to read the reply.'],
 reaction:['New reaction','Open GW to see the reaction.'],
 announcement:['Family announcement','Open GW to read the announcement.'],
 birthday:['Birthday celebration','Open GW to join the celebration.'],
 household:['Household update','Open GW to review the household activity.'],
 contribution:['Contribution update','Open GW to review the status.'],
 order:['Shirt update','Open GW to review the status.'],
 membership:['Family account update','Open GW to review the changes.'],
 reunion:['Reunion update','Open GW to review the latest details.'],
 test:['Test notification','GW can send notifications to this device.']
});
export const validPushId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function pushActivity(category,kind){
 if(kind==='message.created')return 'message';
 if(kind==='conversation.invited')return 'invitation';
 if(category==='messages')return 'conversation';
 if(kind==='memory.published')return 'memory';
 return {following:'post',mentions:'mention',replies:'reply',reactions:'reaction',announcements:'announcement',birthdays:'birthday',households:'household',fees:'contribution',orders:'order',membership:'membership',reunion:'reunion'}[category]||'update';
}
export function boundedPushText(value,limit){
 if(typeof value!=='string')return '';
 // Collapse multiline content; remove controls and directional overrides that
 // could spoof system text. Code-point limits never split a surrogate pair.
 const clean=value.replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,' ').replace(/\s+/gu,' ').trim();
 const points=Array.from(clean);return points.length<=limit?clean:points.slice(0,limit-1).join('')+'…';
}
export function pushCopy(activity='update'){
 const [title,body]=COPY[activity]||COPY.update;return {title,body};
}
export function pushPresentation(payload,now=Date.now()){
 const fresh=payload?.v===1&&Number.isSafeInteger(payload.expiresAt)&&payload.expiresAt>now;
 const test=fresh&&payload.test===true,id=fresh&&!test&&validPushId(payload.noticeId)?payload.noticeId:null;
 const activity=test?'test':id&&payload.presentationVersion===2&&Object.hasOwn(COPY,payload.activity)&&payload.activity!=='test'?payload.activity:'update';
 const copy=pushCopy(activity),preview=payload?.presentationVersion===2&&id&&activity==='message'&&payload.preview?.consent===true?payload.preview:null;
 const sender=boundedPushText(preview?.sender,80),text=boundedPushText(preview?.text,160);
 return {...copy,...(sender&&text?{title:sender,body:text}:{}),noticeId:id,reply:!!id&&activity==='message',test,tag:test?'gw-test':id?'gw-notice-'+id:'gw-activity'};
}
