import {isPreviewLeader,isMemberView} from './member-view-model.js';
// Presentation only. Every live write is independently authorized by the server.
export function canManageContent(state,item){
 if(!state?.selfId||!item||isMemberView(state))return false;
 if(state.mode==='live')return item.authorId===state.selfId||state.capabilities?.moderate===true||state.capabilities?.leaderTools===true;
 const self=state.members?.find(member=>member.id===state.selfId);
 return item.authorId===state.selfId||isPreviewLeader(state);
}
export const contentDestination=(postId,commentId)=>({type:'post',id:postId,section:'comment:'+commentId});
