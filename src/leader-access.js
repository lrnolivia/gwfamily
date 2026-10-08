import {isPreviewLeader,isMemberView} from './member-view-model.js';
export function canAccessLeaderTools(state){if(isMemberView(state))return false;if(state?.mode==='preview')return isPreviewLeader(state);return state?.capabilities?.leaderTools===true||state?.capabilities?.manageMembers===true}
