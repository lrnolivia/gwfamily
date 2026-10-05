import {validateMember,validBirthday} from './member-model.js';
// UI data boundary. Replace these functions with a server adapter at integration.
// Roles and membership here are presentation data, never authorization.
import {previewSeed} from './family-data.js';
export const PREVIEW_KEY='gwfamily:preview:v2';
export const previewCapabilities=Object.freeze({mode:'preview',networkWrites:false,sendInvitations:false,sendNotifications:false,payments:false,authenticate:false});
export function initialState(){
  return {mode:'preview',schema:2,onboarding:'welcome',selfId:'lauren',...previewSeed(),
    drafts:{post:'',comments:{},replies:{},files:{}},compose:{},favorites:[],feedFilter:'all',peopleFilter:'all',memoryFilters:{},notificationScope:'leaders',selectedNotificationIds:[],readNotices:[],
    bag:[],order:null,payment:{paypal:'',cashApp:'',amount:''},fees:'unpaid',rsvp:null,details:{date:'',location:'',schedule:''},
    reports:[],inviteDrafts:[],pollSelections:{},profilePhoto:null,contact:{},lastId:0};
}
export function loadLocalState(storage=globalThis.localStorage){
  try{
    const saved=JSON.parse(storage.getItem(PREVIEW_KEY));
    if(saved?.schema===2&&saved?.mode==='preview'&&saved.state?.mode==='preview'&&Array.isArray(saved.state.members)&&Array.isArray(saved.state.posts)&&saved.state.members.some(m=>m.id===saved.state.selfId))return {...initialState(),...saved.state};
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
    case 'SET_NOTIFICATION_SCOPE':return {...state,notificationScope:action.value};
    case 'SET_SELECTED_NOTIFICATION_IDS':return {...state,selectedNotificationIds:action.ids};
    case 'DISMISS_NOTICE':return {...state,notifications:(state.notifications||[]).filter(n=>n.id!==action.id)};
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
    case 'CLAIM_ORDER':return {...state,order:{status:'claimed',claimedAt:Date.now(),items:state.bag}};
    case 'ORDER_RECEIVED':return {...state,order:state.order?{...state.order,status:'received',receivedAt:Date.now()}:null};
    case 'SET_PAYMENT':return {...state,payment:action.value};
    case 'SET_FEES':return {...state,fees:action.value};
    case 'RSVP':return {...state,rsvp:action.value};
    case 'DETAILS':return {...state,details:action.value};
    case 'REPORT':return {...state,reports:[...state.reports,{id:'report-'+(state.lastId+1),targetId:action.targetId,
      reason:action.reason,status:'open',createdAt:Date.now()}],lastId:state.lastId+1};
    case 'MODERATE':return {...state,reports:state.reports.map(r=>r.id===action.id?{...r,status:action.status}:r),
      posts:action.status==='removed'?state.posts.filter(p=>p.id!==action.targetId):state.posts,
      memories:action.status==='removed'?state.memories.filter(m=>m.id!==action.targetId):state.memories};
    case 'SAVE_INVITE_DRAFT':return {...state,inviteDrafts:[...state.inviteDrafts,{id:'invite-'+(state.lastId+1),
      recipient:action.recipient,groupId:action.groupId,createdAt:Date.now()}],lastId:state.lastId+1};
    default:return state;
  }
}
