import {normalizePhotoFrame} from './photo-framing-model.js';
import {directoryPeople} from './member-directory.js';
import {heritageRoles} from './household-heritage.js';
export function householdAccent(h){
 if(!h||h.colorMode==='inherit'||!/^#[a-f0-9]{6}$/i.test(h.color||''))return null;
 return h.colorMode==='custom'||h.color.toLowerCase()!=='#4f996c'?h.color:null;
}
function reduceHouseholdPreview(state,action){const hs=state.households||[],rs=state.householdRequests||[],id=action.householdId,own=state.selfId;switch(action.type){
case'CREATE_HOUSEHOLD':{const id='preview-household-'+(state.lastId+1);return {...state,lastId:state.lastId+1,householdId:state.householdId||id,households:[...hs,{id,name:action.name,color:null,colorMode:'inherit',photo:null,founderId:own,memberIds:[own],headIds:[own],canManage:true,heritage:[]}]}}
case'SET_PRIMARY_HOUSEHOLD':return hs.some(h=>h.id===id&&h.memberIds.includes(own))?{...state,householdId:id}:state;
case'SAVE_HOUSEHOLD':return {...state,households:hs.map(h=>h.id===id?{...h,name:action.name,color:action.colorMode==='inherit'?null:action.color,colorMode:action.colorMode||'custom',photo:action.photo,photoFrame:normalizePhotoFrame(action.photoFrame??(action.photo===h.photo?h.photoFrame:undefined))}:h)};
case'SAVE_HOUSEHOLD_HERITAGE':{
 const h=hs.find(h=>h.id===id),entry=action.entry||{},role=Object.hasOwn(heritageRoles,entry.role)?heritageRoles[entry.role]:null;
 if(!h?.headIds.includes(own)||!role||!role.titles.includes(entry.title)||!directoryPeople(state,{purpose:entry.role==='ancestral-head'?'ancestral-head':'member'}).some(m=>m.id===entry.personId))return state;
 const existing=(h.heritage||[]).find(x=>x.personId===entry.personId&&x.role===entry.role),next={id:existing?.id||'preview-heritage-'+(state.lastId+1),personId:entry.personId,personKind:role.personKind,role:entry.role,title:entry.title};
 return {...state,lastId:state.lastId+(existing?0:1),households:hs.map(x=>x.id===id?{...x,heritage:[...(x.heritage||[]).filter(e=>e.id!==next.id),next]}:x)};
}
case'REMOVE_HOUSEHOLD_HERITAGE':return hs.find(h=>h.id===id)?.headIds.includes(own)?{...state,households:hs.map(h=>h.id===id?{...h,heritage:(h.heritage||[]).filter(x=>x.id!==action.heritageId)}:h)}:state;
case'INVITE_HOUSEHOLD_MEMBER':case'REQUEST_HOUSEHOLD_JOIN':return {...state,lastId:state.lastId+1,householdRequests:[...rs,{id:'preview-request-'+(state.lastId+1),householdId:id,requesterId:own,recipientId:action.memberId||hs.find(h=>h.id===id)?.founderId,kind:action.type==='INVITE_HOUSEHOLD_MEMBER'?'invite':'join'}]};
case'RESOLVE_HOUSEHOLD_REQUEST':{const r=rs.find(r=>r.id===action.id);if(!r)return state;const who=r.kind==='invite'?r.recipientId:r.requesterId;return {...state,householdId:action.accept&&who===own?(state.householdId||r.householdId):state.householdId,householdRequests:rs.filter(x=>x.id!==r.id),households:hs.map(h=>h.id===r.householdId&&action.accept?{...h,memberIds:[...new Set([...h.memberIds,who])]}:h)}}
case'REQUEST_HOUSEHOLD_HEAD':return {...state,households:hs.map(h=>h.id===id?{...h,headIds:[...new Set([...h.headIds,action.memberId])]}:h)};
case'REMOVE_HOUSEHOLD_MEMBER':case'LEAVE_HOUSEHOLD':{const who=action.memberId||own;return {...state,householdId:who===own&&state.householdId===id?null:state.householdId,households:hs.map(h=>h.id===id?{...h,memberIds:h.memberIds.filter(x=>x!==who),headIds:h.headIds.filter(x=>x!==who)}:h)}}
default:return null}}

export function householdPreview(state,action){const next=reduceHouseholdPreview(state,action);if(!next||next===state)return next;const householdIds=(next.households||[]).filter(h=>h.memberIds.includes(next.selfId)).map(h=>h.id);return {...next,householdIds,householdId:householdIds.includes(next.householdId)?next.householdId:householdIds[0]||null};}
