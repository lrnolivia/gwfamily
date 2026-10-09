// Household badges: up to two full household names (default household first),
// then "+N" for any more. Only accepted memberships count; pending join
// requests and invitations never appear. Names are never shortened.
export const HOUSEHOLD_BADGE_LIMIT=2;
export function memberHouseholds(state,memberId){
 const all=(state.households||[]).filter(h=>(h.memberIds||[]).includes(memberId));
 const preferred=(memberId===state.selfId?state.householdId:null)||state.primaryHouseholds?.[memberId];
 const primary=all.find(h=>h.id===preferred)||all[0]||null;
 return primary?[primary,...all.filter(h=>h!==primary)]:[];
}
export function householdBadges(state,memberId,limit=HOUSEHOLD_BADGE_LIMIT){
 const all=memberHouseholds(state,memberId),hidden=all.slice(limit);
 return {shown:all.slice(0,limit),more:hidden.length,others:hidden.map(h=>h.name)};
}
