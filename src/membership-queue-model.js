import {membershipStatus} from './membership-model.js';
const organizerRoles=new Set(['admin','moderator','planner','treasurer']);
export function membershipRoles(value){try{const roles=JSON.parse(value||'[]');return Array.isArray(roles)&&roles.every(role=>organizerRoles.has(role))?[...new Set(roles)]:null}catch{return null}}
export function capturePendingMemberships(members,selfId,selectedIds=null){
 const selected=selectedIds===null?null:new Set(selectedIds);
 return members.filter(member=>membershipStatus(member)==='pending'&&member.id!==selfId&&(!selected||selected.has(member.id))).map(member=>Object.freeze({id:member.id,name:member.name,revision:member.membership_revision??0,roles:membershipRoles(member.roles_json)}));
}
export function pendingApprovalCommand(target,accountId){
 if(!target.roles||!Number.isSafeInteger(target.revision))throw Error('Review this membership individually before approving.');
 return {type:'APPROVE_MEMBER',id:target.id,status:'active',roles:[...target.roles],canPost:true,expectedStatus:'pending',expectedRevision:target.revision,expectedAccountId:accountId};
}
// A captured, finite list only. Existing dispatch owns receipts and retry IDs;
// the existing server command rechecks actor, pending state and revision atomically.
export async function approvePendingMemberships({targets,accountId,scopeKey,currentScope,dispatch,readMembers,onProgress=()=>{}}){
 const result={requested:targets.length,acknowledged:[],active:[],waiting:[],changed:[],stopped:false,verified:false};
 const current=()=>currentScope()===scopeKey;
 for(const target of targets){
  if(!current()){result.stopped=true;result.reason='Your account or access changed. Refresh before continuing.';break}
  try{
   const command=pendingApprovalCommand(target,accountId);
   if(!await dispatch(command)){result.stopped=true;result.reason='Approval stopped because a change could not be confirmed.';break}
   result.acknowledged.push(target.id);onProgress(result.acknowledged.length,targets.length);
  }catch{result.stopped=true;result.reason='Approval stopped because a change could not be confirmed.';break}
 }
 if(!current())return {...result,stopped:true,reason:'Your account or access changed. Refresh before continuing.'};
 try{
  const members=await readMembers();if(!current())return {...result,stopped:true};
  if(!Array.isArray(members))throw Error('No current membership list');
  const latest=new Map(members.map(member=>[member.id,member]));
  for(const target of targets){const status=membershipStatus(latest.get(target.id));(latest.has(target.id)&&status==='active'?result.active:latest.has(target.id)&&status==='pending'?result.waiting:result.changed).push(target.id)}
  result.verified=true;
 }catch{result.reason='The latest memberships could not be checked. Refresh the list before another approval.'}
 return result;
}
