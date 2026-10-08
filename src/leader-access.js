import {previewSeed} from './family-data.js';
// Live capabilities come from the server. Seed-role fallback is only for the
// isolated preview, including previews saved before explicit demo roles existed.
export function canAccessLeaderTools(state){
 const self=state?.members?.find(member=>member.id===state.selfId);
 if(state?.mode!=='preview')return state?.capabilities?.leaderTools===true||state?.capabilities?.manageMembers===true||self?.leader===true;
 const roles=self?.roles||(self?.origin==='seed'?previewSeed().members.find(member=>member.id===self.id)?.roles:[])||[];
 return self?.leader===true||roles.includes('admin');
}
