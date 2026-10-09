export const membershipStatus=member=>member?.removed_at||member?.previewRemovedAt?'removed':member?.status||member?.previewStatus||'active';
// Only resettable local preview state is changed here. The API independently
// authorizes every real membership action and never trusts these capabilities.
export function previewMembershipCommand(state,action){
 if(state.mode!=='preview')throw new Error('Preview membership changes are local only.');
 const target=state.members.find(member=>member.id===action.id);
 if(!target||target.id===state.selfId)throw new Error('Choose another membership to update.');
 const removed=Boolean(target.previewRemovedAt),revision=target.membershipRevision||0;
 if(action.type!=='APPROVE_MEMBER'&&(action.confirmedMemberId!==target.id||action.expectedAccountId!==state.selfId||action.expectedRevision!==revision))throw new Error('This membership changed. Close the review and open it again.');
 if(action.type==='REMOVE_MEMBER'&&removed)throw new Error('This membership has already been removed.');
 if(action.type==='RESTORE_MEMBER'&&!removed)throw new Error('Only a removed membership can be restored for review.');
 if(action.type==='APPROVE_MEMBER'&&removed)throw new Error('Restore this membership for review before approving access.');
 if(action.type==='APPROVE_MEMBER'&&action.expectedStatus==='pending'){
  if(action.expectedAccountId!==state.selfId||action.expectedRevision!==revision||membershipStatus(target)!=='pending')throw new Error('This membership or account changed. Refresh before approving.');
  if(action.status!=='active'||action.canPost!==true||JSON.stringify([...(action.roles||[])].sort())!==JSON.stringify([...(target.previewRoles||[])].sort()))throw new Error('Quick approval must preserve existing organizer roles.');
 }
 const next=action.type==='REMOVE_MEMBER'?{previewRemovedAt:new Date().toISOString(),previewStatus:'suspended',previewRoles:[],canPost:false,leader:false}:action.type==='RESTORE_MEMBER'?{previewRemovedAt:null,previewStatus:'pending',previewRoles:[],canPost:false,leader:false}:{previewStatus:action.status,previewRoles:action.roles,canPost:action.canPost};
 return {...state,members:state.members.map(member=>member.id===target.id?{...member,...next,membershipRevision:revision+1}:member)};
}
