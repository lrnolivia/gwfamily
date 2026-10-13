import {isPreviewLeader,isMemberView} from './member-view-model.js';
export function canAccessLeaderTools(state){if(isMemberView(state))return false;if(state?.mode==='preview')return isPreviewLeader(state);return state?.capabilities?.leaderTools===true||state?.capabilities?.manageMembers===true}
// Leader Tools under You also open for Planners and Treasurers, showing only the
// tabs their own capability allows. Shared-page editing stays canAccessLeaderTools.
export function canOpenPlannerTools(state){if(isMemberView(state))return false;if(state?.mode==='preview')return isPreviewLeader(state);const caps=state?.capabilities||{};return canAccessLeaderTools(state)||caps.manageReunion===true||caps.treasurer===true||caps.manageCalendar===true}
