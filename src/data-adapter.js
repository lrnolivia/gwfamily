import {previewMembershipCommand} from './membership-model.js';
import {normalizePayment} from './payment-model.js';
import {ensurePreviewReunions,previewReunionCommand,REUNION_SCOPED_COMMANDS,REUNION_LIFECYCLE_COMMANDS,reunionArchived} from './reunion-model.js';
import {applyCalendarCommand} from './calendar-model.js';
import {normalizeNotificationSettings,previewNotificationSeed,previewVisibleNotifications} from './notification-model.js';
import {householdPreview} from './household-model.js';
import {validateMember,validBirthday} from './member-model.js';
// UI data boundary. Replace these functions with a server adapter at integration.
// Roles and membership here are presentation data, never authorization.
import {previewSeed} from './family-data.js';
export const PREVIEW_KEY='gwfamily:preview:v2';
export const previewCapabilities=Object.freeze({mode:'preview',networkWrites:false,sendInvitations:false,sendNotifications:false,payments:false,authenticate:false});
export function initialState(){
  return ensurePreviewReunions({mode:'preview',schema:2,onboarding:'welcome',selfId:'lauren',...previewSeed(),
    drafts:{post:'',comments:{},replies:{},files:{}},compose:{},favorites:[],feedFilter:'all',peopleFilter:'all',memoryFilters:{},notificationScope:'leaders',selectedNotificationIds:[],readNotices:[],
    notifications:previewNotificationSeed(),notificationSettings:normalizeNotificationSettings(),
    bag:[],order:null,payment:{paypal:'',cashApp:'',amount:''},fees:'unpaid',rsvp:null,details:{date:'',location:'',schedule:''},
    households:[],householdRequests:[],householdId:null,reports:[],inviteDrafts:[],pollSelections:{},profilePhoto:null,contact:{},lastId:0});
}
export function loadLocalState(storage=globalThis.localStorage){
  try{
    const saved=JSON.parse(storage.getItem(PREVIEW_KEY));
    if(saved?.schema===2&&saved?.mode==='preview'&&saved.state?.mode==='preview'&&Array.isArray(saved.state.members)&&Array.isArray(saved.state.posts)&&saved.state.members.some(m=>m.id===saved.state.selfId))return ensurePreviewReunions({...initialState(),...saved.state,reunions:saved.state.reunions,selectedReunionId:saved.state.selectedReunionId,notificationSettings:normalizeNotificationSettings(saved.state.notificationSettings||{},saved.state)});
  }catch{}
  return initialState();
}
export function saveLocalState(state,storage=globalThis.localStorage){
  if(state.mode!=='preview')return {ok:false,error:'This adapter only saves preview data.'};
  try{
    storage.setItem(PREVIEW_KEY,JSON.stringify({schema:2,mode:'preview',state},(key,value)=>
      typeof value==='string'&&value.startsWith('blob:')?null:value));
    return {ok:true};
  }catch{return {ok:false,error:'Preview storage is full or unavailable. Your latest changes are only in this tab. Remove a large attachment or reset the preview.'};}
}
export function resetPreview(storage=globalThis.localStorage){try{storage.removeItem(PREVIEW_KEY)}catch{}return initialState()}
export function surnameSuggestion(members){
  const counts=new Map();
  for(const member of members){
    const surname=member.name.trim().split(/\s+/).at(-1);
    if(surname)counts.set(surname,(counts.get(surname)||0)+1);
  }
  const sorted=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  if(!sorted.length)return 'Our group';
  if(sorted.length>1&&sorted[1][1]>=Math.max(2,sorted[0][1]/2))
    return [sorted[0][0],sorted[1][0]].sort((a,b)=>a.localeCompare(b)).join('-');
  return sorted[0][0];
}
export function memberMatches(member,filter){
  return filter==='all'||filter==='leaders'&&member.leader||
    filter==='family'&&member.circle==='family'||filter==='loved'&&member.circle==='loved';
}
export function reducer(state,action){
 if(state.mode!=='preview')return state;
 state=ensurePreviewReunions(state);
 if(action.type==='SELECT_REUNION'||REUNION_LIFECYCLE_COMMANDS.has(action.type))return previewReunionCommand(state,action);
 if(REUNION_SCOPED_COMMANDS.has(action.type)||['BAG_ADD','BAG_REMOVE'].includes(action.type)){
  if(action.reunionId&&action.reunionId!==state.selectedReunionId)throw Error('The selected reunion changed. Reopen this form.');
  if(reunionArchived(state))throw Error('This reunion is archived. Restore it before making changes.');
 }
 return reduceState(state,action);
}
function reduceState(state,action){
  if(state.mode!=='preview')return state;
  switch(action.type){
    case 'RESET_PREVIEW':return initialState();
    case 'ADD_PERSON':{
      if(validateMember(action.member,{signup:action.signup,child:action.child}))return state;
      const id='preview-person-'+(state.lastId+1),m={...action.member,id,name:action.member.name.trim(),circle:'family',groupId:null,photo:action.signup?action.member.photo||null:null,bio:'',origin:'local-preview',registered:!!action.signup,managedBy:action.child?state.selfId:null,moderator:false,leader:false};
      return {...state,members:[...state.members,m],selfId:action.signup?id:state.selfId,lastId:state.lastId+1};
    }
    case 'UPDATE_DEPENDENT':{
      const current=state.members.find(m=>m.id===action.member.id&&m.managedBy===state.selfId);
      if(!current||validateMember(action.member,{child:true}))return state;
      return {...state,members:state.members.map(m=>m.id===current.id?{...m,name:action.member.name.trim(),birthday:action.member.birthday,gender:action.member.gender}:m)};
    }
    case 'PREVIEW_BIRTHDAYS':{
      if(!validBirthday(action.date))return state;
      const posts=state.members.filter(m=>m.origin==='local-preview'&&m.birthday?.slice(5)===action.date.slice(5)).map(m=>({id:`birthday-${m.id}-${action.date}`,authorId:state.selfId,text:`Birthday wishes for ${m.name}!`,createdAt:Date.now(),birthdayFor:m.id})).filter(p=>!state.posts.some(old=>old.id===p.id));
      return {...state,posts:[...posts,...state.posts]};
    }
    case 'ONBOARD':return {...state,onboarding:action.step};
    case 'SAVE_MEMBER':return {...state,members:state.members.map(m=>m.id===action.member.id?{...m,...action.member}:m)};
    case 'SAVE_CONTACT':return {...state,contact:action.contact};
    case 'SET_THEME_DATA':return {...state,...action.values};
    case 'SET_FEED_FILTER':return {...state,feedFilter:action.value};
    case 'SET_PEOPLE_FILTER':return {...state,peopleFilter:action.value};
    case 'SET_MEMORY_FILTERS':return {...state,memoryFilters:action.value};
    case 'SET_NOTIFICATION_SCOPE':return {...state,notificationScope:action.value,notificationSettings:normalizeNotificationSettings({...state.notificationSettings,scope:action.value,globalOff:action.value==='off',revision:(state.notificationSettings?.revision||0)+1},state)};
    case 'SET_SELECTED_NOTIFICATION_IDS':return {...state,selectedNotificationIds:action.ids,notificationSettings:normalizeNotificationSettings({...state.notificationSettings,selectedIds:action.ids,revision:(state.notificationSettings?.revision||0)+1},state)};
    case 'SET_NOTIFICATION_SETTINGS':{const current=normalizeNotificationSettings(state.notificationSettings,state);if(action.revision!==current.revision)return state;const settings=normalizeNotificationSettings({...current,...action.patch,categories:{...current.categories,...action.patch?.categories},revision:current.revision+1},state);return {...state,notificationSettings:settings,notificationScope:settings.scope,selectedNotificationIds:settings.selectedIds}}
    case 'MARK_NOTICES_READ_ALL':return {...state,readNotices:[...new Set([...state.readNotices,...previewVisibleNotifications(state).filter(n=>n.sequence<=action.cutoff&&n.kind!=='message.created').map(n=>n.id)])]};
    case 'RESET_NOTIFICATIONS_PREVIEW':return {...state,notifications:previewNotificationSeed(),readNotices:[],notificationSettings:normalizeNotificationSettings(),notificationScope:'leaders',selectedNotificationIds:[]};
    case 'DISMISS_NOTICE':return {...state,notifications:(state.notifications||[]).filter(n=>n.id!==action.id)};
    case 'DISMISS_NOTICES_ALL':{if(!Number.isSafeInteger(action.cutoff)||action.cutoff<0)return state;const ids=new Set(previewVisibleNotifications(state).filter(n=>n.sequence<=action.cutoff).map(n=>n.id));return {...state,notifications:(state.notifications||[]).map(n=>ids.has(n.id)?{...n,dismissedAt:n.dismissedAt||Date.now()}:n)}};
    case 'MARK_NOTICE_READ':return {...state,readNotices:[...new Set([...state.readNotices,action.id])]};
    case 'SET_COMPOSE':return {...state,compose:{...state.compose,...action.values}};
    case 'SET_DRAFT_FILES':return {...state,drafts:{...state.drafts,files:{...state.drafts.files,[action.key]:action.files}}};
    case 'SET_DRAFT':{
      const d=state.drafts;
      if(action.kind==='post')return {...state,drafts:{...d,post:action.value}};
      return {...state,drafts:{...d,[action.kind]:{...d[action.kind],[action.key]:action.value}}};
    }
    case 'ADD_POST':if(!state.members.some(m=>m.id===action.post.authorId))return state;return {...state,posts:[{...action.post,id:'post-'+(state.lastId+1),createdAt:Date.now()},...state.posts],
      compose:{},drafts:{...state.drafts,post:''},lastId:state.lastId+1};
    case 'ADD_COMMENT':{
      const old=state.comments[action.targetId]||[];
      return {...state,comments:{...state.comments,[action.targetId]:[...old,
        {id:'comment-'+(state.lastId+1),parentId:action.parentId||null,authorId:state.selfId,
          text:action.text,files:action.files||[],createdAt:Date.now()}]},
        drafts:{...state.drafts,files:{...state.drafts.files,[(action.parentId?'replies:':'comments:')+(action.parentId||action.targetId)]:[]},[action.parentId?'replies':'comments']:
          {...state.drafts[action.parentId?'replies':'comments'],[action.parentId||action.targetId]:''}},
        lastId:state.lastId+1};
    }
    case 'TOGGLE_REACTION':{
      const current=state.reactions[action.targetId]||[];
      return {...state,reactions:{...state.reactions,[action.targetId]:
        current.includes(action.emoji)?current.filter(x=>x!==action.emoji):[...current,action.emoji]}};
    }
    case 'TOGGLE_FAVORITE':return {...state,favorites:state.favorites.includes(action.id)?
      state.favorites.filter(x=>x!==action.id):[...state.favorites,action.id]};
    case 'RENAME_GROUP':return {...state,groups:state.groups.map(g=>g.id===action.id?{...g,name:action.name,nameEdited:true}:g)};
    case 'FEATURE_MEMORY':{const ids=new Set(state.featuredMemoryIds||[]);if(action.approved)ids.add(action.id);else ids.delete(action.id);return {...state,featuredMemoryIds:[...ids],primaryMemoryId:action.primary?action.id:state.primaryMemoryId===action.id&&!action.approved?null:state.primaryMemoryId,featuredPhotos:state.memories.filter(m=>ids.has(m.id))}};
    case 'SAVE_MEMORY':return {...state,memories:state.memories.map(m=>m.id===action.memory.id?action.memory:m)};
    case 'ADD_MEMORY':return {...state,memories:[...state.memories,{...action.memory,id:action.memory.id||'memory-'+(state.lastId+1)}],lastId:state.lastId+1};
    case 'POLL_VOTE':return {...state,pollSelections:{...state.pollSelections,[action.postId]:action.options}};
    case 'BAG_ADD':{
      const bag=state.bag.filter(x=>x.productId!==action.item.productId);
      return {...state,bag:[...bag,action.item]};
    }
    case 'BAG_REMOVE':return {...state,bag:state.bag.filter(x=>x.productId!==action.productId)};
    case 'MARK_ANNOUNCEMENT_SEEN':return {...state,announcementViews:[...new Set([...(state.announcementViews||[]),action.id])]};
    case 'CLAIM_ORDER':{const order={memberId:state.selfId,id:'preview-order-'+Date.now(),status:'claimed',claimedAt:Date.now(),items:state.bag};return {...state,order,previewOrders:[order,...(state.previewOrders||[])],bag:[]}}
    case 'SAVE_PRODUCT':{const p={...action.product,id:action.product.id||'preview-item-'+Date.now()};return {...state,products:[...(state.products||[]).filter(x=>x.id!==p.id),p]}}
    case 'UPDATE_CLAIM':return {...state,order:state.order?.id===action.id?{...state.order,status:action.status}:state.order,previewOrders:(state.previewOrders||[]).map(o=>o.id===action.id?{...o,status:action.status}:o)};
    case 'APPROVE_MEMBER':case 'REMOVE_MEMBER':case 'RESTORE_MEMBER':return previewMembershipCommand(state,action);
    case 'CONFIRM_FEE':return {...state,fees:action.status,previewFeeReports:(state.previewFeeReports||[]).map(f=>f.id===action.id?{...f,status:action.status}:f)};
    case 'ORDER_RECEIVED':return {...state,order:state.order?{...state.order,status:'received',receivedAt:Date.now()}:null};
    case 'SET_PAYMENT':return {...state,payment:normalizePayment(action.value)};
    case 'SET_FEES':return {...state,fees:'reported',previewFeeReports:[{memberId:state.selfId,id:'preview-fee-'+Date.now(),status:'reported'},...(state.previewFeeReports||[])]};
    case 'RSVP':return {...state,rsvp:action.value};
    case 'DETAILS':return {...state,details:{...state.details,...action.value,calendar:{...state.details?.calendar,revision:(state.details?.calendar?.revision||0)+1}}};
    case 'SAVE_CALENDAR':case 'SAVE_EVENT':case 'ARCHIVE_EVENT':case 'RESTORE_EVENT':return {...state,details:applyCalendarCommand(state.details,action,{id:'preview-event-'+(state.lastId+1),actorId:state.selfId}),lastId:state.lastId+1};
    case 'REPORT':return {...state,reports:[...state.reports,{id:'report-'+(state.lastId+1),targetId:action.targetId,
      reason:action.reason,status:'open',createdAt:Date.now()}],lastId:state.lastId+1};
    case 'MODERATE':return {...state,reports:state.reports.map(r=>r.id===action.id?{...r,status:action.status}:r),
      posts:action.status==='removed'?state.posts.filter(p=>p.id!==action.targetId):state.posts,
      memories:action.status==='removed'?state.memories.filter(m=>m.id!==action.targetId):state.memories};
    case 'RESET_INVITE_DRAFTS': return {...state,inviteDrafts:[]};
 case 'SAVE_INVITE_DRAFT':return {...state,inviteDrafts:[...state.inviteDrafts,{id:'invite-'+(state.lastId+1),
      recipient:action.recipient,groupId:action.groupId,createdAt:Date.now()}],lastId:state.lastId+1};
    default:return householdPreview(state,action)||state;
  }
}
