// Durable activity is independent of the current feed window. This module has
// no network or browser permission side effects, including in preview mode.
export const NOTIFICATION_CATEGORIES=Object.freeze([
 {id:'following',label:'People you follow',detail:'New posts and memories from your Following choices.',icon:'people'},
 {id:'mentions',label:'Tags',detail:'When someone tags you in a post or memory.',icon:'people'},
 {id:'replies',label:'Replies',detail:'Comments on your posts and direct replies to you.',icon:'chat'},
 {id:'reactions',label:'Reactions',detail:'Reactions to your posts and comments.',icon:'heart'},
 {id:'announcements',label:'Leader announcements',detail:'Updates shared as family announcements.',icon:'bell'},
 {id:'birthdays',label:'Birthday celebrations',detail:'Celebrations shared by adults who have opted in.',icon:'calendar'},
 {id:'households',label:'Household invitations',detail:'Invitations, join requests, and their outcomes.',icon:'home'},
 {id:'fees',label:'Contribution updates',detail:'Your report and confirmation status.',icon:'wallet'},
 {id:'orders',label:'Shirt updates',detail:'Your claim, fulfillment, and delivery status.',icon:'shirt'},
 {id:'membership',label:'Account and family roles',detail:'Membership decisions and role changes.',icon:'people'},
 {id:'reunion',label:'Reunion changes',detail:'Changes to the date, location, and schedule.',icon:'calendar'},
 {id:'messages',label:'Conversation activity',detail:'Conversation invitations and message activity.',icon:'chat'}
]);
export const NOTIFICATION_SCOPES=Object.freeze([
 {value:'all',label:'Everyone'}, {value:'family',label:'Family'},
 {value:'loved',label:'Loved Ones'}, {value:'selected',label:'Selected people'},
 {value:'leaders',label:'Leaders'}, {value:'off',label:'Off'}
]);
export const NOTIFICATION_DELIVERY_CHANNELS=Object.freeze([{id:'inApp',label:'In app'},{id:'email',label:'Email'},{id:'push',label:'Push'}]);
export const DEFAULT_NOTIFICATION_CATEGORIES=Object.freeze(Object.fromEntries(NOTIFICATION_CATEGORIES.map(x=>[x.id,true])));
export const NOTIFICATION_INVALIDATION=Object.freeze({type:'invalidate',version:1});
export const NOTIFICATION_CHANNEL='gw-notifications:v1';
const safeId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f]/.test(value);
export function normalizeNotificationSettings(value={},fallback={}){
 const raw=value.scope??fallback.notificationScope??'leaders',alias=raw==='loved_ones'?'loved':raw,scope=alias==='off'?'leaders':NOTIFICATION_SCOPES.some(x=>x.value===alias)?alias:'leaders';
 const categories=Object.fromEntries(NOTIFICATION_CATEGORIES.map(x=>[x.id,typeof value.categories?.[x.id]==='boolean'?value.categories[x.id]:typeof value.channels?.[x.id]?.inApp==='boolean'?value.channels[x.id].inApp:true]));
 // Old saved preview categories were all-channel switches. Keep those offs
 // until each channel is explicitly changed; normalization has no side effects.
 const channels=Object.fromEntries(NOTIFICATION_CATEGORIES.map(({id})=>[id,{inApp:categories[id],...Object.fromEntries(['email','push'].map(channel=>[channel,typeof value.channels?.[id]?.[channel]==='boolean'?value.channels[id][channel]:categories[id]]))}]));
 return {scope,globalOff:typeof value.globalOff==='boolean'?value.globalOff:raw==='off',
  selectedIds:[...new Set((Array.isArray(value.selectedIds)?value.selectedIds:fallback.selectedNotificationIds||[]).filter(safeId))],
  categories,channels,
  revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0,pushEnabled:false};
}
// Apply a partial edit without dropping a different category or channel. The
// server remains authoritative in live mode; this is the isolated preview reducer.
export function patchNotificationSettings(value,patch={}){
 const current=normalizeNotificationSettings(value),categories={...current.categories},channels=Object.fromEntries(NOTIFICATION_CATEGORIES.map(({id})=>[id,{...current.channels[id]}]));
 for(const {id} of NOTIFICATION_CATEGORIES){
  if(typeof patch.categories?.[id]==='boolean'){
   const on=patch.categories[id];categories[id]=on;channels[id].inApp=on;
   if(!on){channels[id].email=false;channels[id].push=false}
  }
  for(const {id:channel} of NOTIFICATION_DELIVERY_CHANNELS)if(typeof patch.channels?.[id]?.[channel]==='boolean')channels[id][channel]=patch.channels[id][channel];
  categories[id]=channels[id].inApp;
 }
 return normalizeNotificationSettings({...current,...patch,categories,channels});
}
// Disabling a saving native checkbox can move keyboard focus to the document.
// Restore only that lost focus; never take it from a newer control or overlay.
export function restoreNotificationSettingFocus(input,document=input?.ownerDocument||globalThis.document){
 if(!input?.isConnected||input.disabled||input.closest?.('[inert],[hidden]')||!document||![document.body,document.documentElement].includes(document.activeElement))return false;
 input.focus({preventScroll:true});return true;
}
export function notificationCategory(notice){
 if(NOTIFICATION_CATEGORIES.some(x=>x.id===notice.category))return notice.category;
 const kind=notice.kind||'';
 if(/tagged|mention/.test(kind))return 'mentions';if(/reply|comment/.test(kind))return 'replies';
 if(/reaction/.test(kind))return 'reactions';if(/announcement/.test(kind))return 'announcements';
 if(/birthday/.test(kind))return 'birthdays';if(/household/.test(kind))return 'households';
 if(/^fee/.test(kind))return 'fees';if(/^order/.test(kind))return 'orders';
 if(/^membership/.test(kind))return 'membership';if(/^reunion/.test(kind))return 'reunion';
 if(/^(message|conversation)/.test(kind))return 'messages';return 'following';
}
export function normalizedNotice(notice,readIds=[]){
 return {...notice,category:notificationCategory(notice),readAt:notice.readAt||(readIds.includes(notice.id)?true:null),
  sequence:Number.isSafeInteger(notice.sequence)?notice.sequence:0};
}
export function mergeNotificationPages(pages){
 const seen=new Set();return pages.flatMap(page=>page.notifications||[]).filter(notice=>safeId(notice.id)&&!seen.has(notice.id)&&seen.add(notice.id))
  .map(notice=>normalizedNotice(notice)).sort((a,b)=>b.sequence-a.sequence||String(b.id).localeCompare(String(a.id)));
}
export function notificationTargetRoute(target){
 if(!target||typeof target!=='object')return null;
 const id=safeId(target.id)?target.id:null,container=safeId(target.containerId)?target.containerId:null,anchor=safeId(target.anchorId)?target.anchorId:null;
 switch(target.kind){
  case 'family_calendar_moderation':return {type:'family-calendar',...(id?{id}:{})};
  case 'post':return id?{type:'post',id,...(anchor?{section:'comment:'+anchor}:{})}:null;
  case 'comment':return container?{type:'post',id:container,section:'comment:'+(anchor||id||'')}:null;
  case 'memory':return id?{type:'memory',id}:null;
  case 'household_invitation':return {type:'household',...(container?{id:container}:{}),section:'email-invitation'};
  case 'household_request':return {type:'household',...(container?{id:container}:{}),section:'requests'};
  case 'fee':return {type:target.section==='planner'?'leader-tools':'you',section:'fees'};
  case 'order':return {type:target.section==='planner'?'leader-tools':'you',section:'shirts'};
  case 'member':return ['members','planner'].includes(target.section)?{type:'leader-tools',section:'members'}:{type:'you'};
  case 'reunion':return {type:'reunion'};
  case 'conversation':return id?{type:'chat',id}:null;
  case 'invitation':return {type:'inbox',section:'invitations'};
  default:return null;
 }
}
export function mergeNotificationResource(state,result){
 if(!result?.available||!notificationTargetRoute(result.target))return state;
 const next={...state},target=result.target,postId=target.kind==='comment'?target.containerId:['post','memory'].includes(target.kind)?target.id:null;
 if(postId&&result.post?.id===postId){
  next.posts=(state.posts||[]).some(post=>post.id===postId)?state.posts.map(post=>post.id===postId?result.post:post):[...(state.posts||[]),result.post];
  if(Array.isArray(result.comments))next.comments={...state.comments,[postId]:result.comments};
 }
 if(target.kind==='memory'&&result.memory?.id===target.id)next.memories=(state.memories||[]).some(memory=>memory.id===target.id)?state.memories.map(memory=>memory.id===target.id?result.memory:memory):[...(state.memories||[]),result.memory];
 for(const field of ['reactions','reactionCounts','reactionMembers','pollSelections'])if(result[field]&&typeof result[field]==='object'&&!Array.isArray(result[field]))next[field]={...state[field],...result[field]};
 return next;
}
export function previewNotificationSeed(now=Date.now()){
 return [
  {id:'preview-notice-reply',sequence:4,kind:'reply.created',category:'replies',title:'A sample reply is waiting',text:'Open a fictional family conversation.',createdAt:now-300000,target:{kind:'comment',id:'seed-comment-2',containerId:'post-generations',anchorId:'seed-comment-2'}},
  {id:'preview-notice-tag',sequence:3,kind:'memory.tagged',category:'mentions',title:'A sample memory includes you',text:'Try opening a memory from your activity.',createdAt:now-3600000,target:{kind:'memory',id:'memory-generations'}},
  {id:'preview-notice-reunion',sequence:2,kind:'reunion.changed',category:'reunion',title:'A sample reunion update',text:'Review the reunion page. No real plans were changed.',createdAt:now-86400000,target:{kind:'reunion',id:'reunion'}},
  {id:'preview-notice-post',sequence:1,kind:'post.published',category:'following',authorId:'monique',title:'A sample family update',text:'Visible when your Following choices include this person.',createdAt:now-172800000,target:{kind:'post',id:'post-generations'}}
 ];
}
export function previewVisibleNotifications(state){
 const settings=normalizeNotificationSettings(state.notificationSettings,state),read=state.readNotices||[];
 const visible=(state.notifications||[]).map(n=>normalizedNotice(n,read)).filter(n=>{
  if(n.dismissedAt||settings.globalOff||settings.scope==='off'||!settings.categories[n.category])return false;
  if(n.category!=='following')return true;
  const m=(state.members||[]).find(m=>m.id===n.authorId);
  return settings.scope==='all'||settings.scope==='selected'&&settings.selectedIds.includes(n.authorId)||settings.scope==='leaders'&&m?.leader||settings.scope==='family'&&m?.circle==='family'||settings.scope==='loved'&&m?.circle==='loved';
 }).sort((a,b)=>b.sequence-a.sequence||String(b.id).localeCompare(String(a.id)));
 return visible;
}
export function previewNotificationPage(state,{before,limit=30}={}){
 const settings=normalizeNotificationSettings(state.notificationSettings,state),visible=previewVisibleNotifications(state);
 const filtered=before==null?visible:visible.filter(n=>n.sequence<Number(before)),page=filtered.slice(0,Math.max(1,Math.min(50,limit)));
 return {notifications:page,unreadCount:visible.filter(n=>!n.readAt&&n.kind!=='message.created').length,
  nextCursor:filtered.length>page.length?page.at(-1)?.sequence:null,readAllCutoff:Math.max(0,...visible.map(n=>n.sequence)),settings};
}
export function previewOpenNotification(state,id){
 const notice=previewVisibleNotifications(state).find(n=>n.id===id),target=notice?.target;
 if(!notice||notice.dismissedAt||!notificationTargetRoute(target))return {available:false};
 if(['post','comment'].includes(target.kind)){
  const post=state.posts.find(p=>p.id===(target.kind==='comment'?target.containerId:target.id)),comments=state.comments[post?.id]||[];
  if(!post||target.kind==='comment'&&!comments.some(c=>c.id===(target.anchorId||target.id)))return {available:false};
  return {available:true,target,post,comments};
 }
 if(target.kind==='memory'){const memory=state.memories.find(m=>m.id===target.id);return memory?{available:true,target,memory}:{available:false}}
 return {available:true,target};
}
export function isNotificationInvalidation(value){return value?.type==='invalidate'&&value?.version===1&&Object.keys(value).length===2}
// Cross-tab transport deliberately carries no account IDs, notice IDs, resource
// identifiers, titles, counts, settings, or private content. A receiving tab
// must fetch its own authenticated view. There is no localStorage fallback.
export function createNotificationChannel(onInvalidate,Channel=globalThis.BroadcastChannel){
 if(typeof Channel!=='function')return {send(){},close(){}};
 try{const channel=new Channel(NOTIFICATION_CHANNEL);channel.onmessage=event=>{if(isNotificationInvalidation(event.data))onInvalidate()};return {send(){try{channel.postMessage({...NOTIFICATION_INVALIDATION})}catch{}},close(){channel.onmessage=null;channel.close()}}}catch{return {send(){},close(){}}}
}
