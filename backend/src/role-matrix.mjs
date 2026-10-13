// The intended, bounded role matrix. policy.can() must match it exactly; the
// role-matrix test fails if a capability widens or narrows without this file.
//
// Holders: 'member' (any active family/loved-ones member), 'canPost' (posting
// switch on the membership), 'leader' (Family Leader, members.is_leader),
// 'author' (the content's own author) and the organizer roles admin,
// moderator, planner, treasurer. Organizer roles never imply one another,
// except admin's listed capabilities; admin is not treasurer.
export const ROLE_MATRIX=Object.freeze({
 read_family:['member'],comment:['member'],react:['member'],claim_shirts:['member'],
 post:['admin','moderator','canPost'],
 manage_content:['author','admin','moderator','leader'],
 moderate:['admin','moderator'],
 manage_reunion:['admin','planner'],
 confirm_fees:['treasurer'],set_payment_destination:['treasurer'],
 manage_members:['admin'],
 // Shared-page editing and the Leader overview stay with admins and leaders.
 edit_pages:['admin','leader'],leader_tools:['admin','leader']
});
// Where each organizer reaches their tools. All live under You → Leader Tools;
// each tab is checked again server-side by the capability shown.
export const LEADER_TOOL_TABS=Object.freeze({
 overview:['admin','leader','planner','treasurer'],
 details:['manage_reunion'],shirts:['manage_reunion'],
 members:['manage_members'],fees:['confirm_fees','manage_reunion'],
 calendar:['leader (calendar)']
});
// Family Leader lifecycle (members.is_leader):
// - granted or revoked only by an active admin, explicitly, on an active member;
// - pausing access keeps it (it has no effect while paused);
// - removing a membership clears it; restoring for review never brings it back.
// The last active admin cannot be removed, paused or demoted (database trigger).
export const LEADER_LIFECYCLE=Object.freeze({grant:'admin, active member only',pause:'kept, inactive',remove:'cleared',restore:'stays cleared until granted again'});
