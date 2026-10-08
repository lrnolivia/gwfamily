// The same resource policy is embedded in migration 0012 fanout and used again
// at list/count/open time. Never authorize a resource from the loaded feed.
export const CATEGORIES=Object.freeze(['following','mentions','replies','reactions','announcements','birthdays','households','fees','orders','membership','reunion','messages']);
export const DEFAULT_CATEGORIES=Object.freeze(Object.fromEntries(CATEGORIES.map(k=>[k,true])));
export const eligibleMemberSql=member=>`EXISTS(SELECT 1 FROM members nm JOIN user nu ON nu.id=nm.id WHERE nm.id=${member} AND nm.status='active' AND nu.emailVerified=1 AND nm.member_group IN ('family','loved_ones'))`;
const adultSql=member=>`EXISTS(SELECT 1 FROM profiles np WHERE np.member_id=${member} AND np.completed=1 AND np.birthday>='1900-01-01' AND np.birthday<=date('now','-18 years'))`;
const roleSql=(member,roles)=>`EXISTS(SELECT 1 FROM members nr,json_each(nr.roles_json) role WHERE nr.id=${member} AND role.value IN (${roles.map(x=>`'${x}'`).join(',')}))`;
export function resourceAccessSql({kind,id,container,member,eventKind="''",revision='NULL'}){
 const postAccess=post=>`${post}.deleted_at IS NULL AND (${post}.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members ngm WHERE ngm.group_id=${post}.group_id AND ngm.member_id=${member})) AND (COALESCE(json_extract(${post}.metadata_json,'$.systemBirthday'),0)!=1 OR EXISTS(SELECT 1 FROM profiles bp JOIN members bm ON bm.id=bp.member_id WHERE bp.member_id=${post}.author_id AND bp.birthday_celebration=1 AND bp.birthday<=date('now','-18 years') AND bm.status='active'))`;
 return `CASE ${kind}
 WHEN 'post' THEN EXISTS(SELECT 1 FROM posts np WHERE np.id=${id} AND ${postAccess('np')})
 WHEN 'comment' THEN EXISTS(SELECT 1 FROM comments nc JOIN posts np ON np.id=nc.post_id WHERE nc.id=${id} AND nc.deleted_at IS NULL AND ${postAccess('np')})
 WHEN 'memory' THEN EXISTS(SELECT 1 FROM memories nm JOIN posts np ON np.id=nm.id WHERE nm.id=${id} AND nm.deleted_at IS NULL AND ${postAccess('np')})
 WHEN 'household_request' THEN EXISTS(SELECT 1 FROM household_requests nh WHERE nh.id=${id} AND (nh.requester_id=${member} OR nh.recipient_id=${member} OR EXISTS(SELECT 1 FROM household_members hm WHERE hm.household_id=nh.household_id AND hm.member_id=${member} AND hm.role='head')))
 WHEN 'household_invitation' THEN EXISTS(SELECT 1 FROM household_email_invites hi JOIN user hu ON lower(hu.email)=hi.recipient_email WHERE hi.id=${id} AND (hi.sender_id=${member} OR hu.id=${member}) AND (hi.accepted_at IS NOT NULL OR (hi.expires_at>unixepoch()*1000 AND EXISTS(SELECT 1 FROM household_members hh JOIN members hm ON hm.id=hh.member_id WHERE hh.household_id=hi.household_id AND hh.member_id=hi.sender_id AND hh.role='head' AND hm.status='active'))))
 WHEN 'fee' THEN EXISTS(SELECT 1 FROM fee_reports nf WHERE nf.id=${id} AND (nf.member_id=${member} OR ${roleSql(member,['treasurer'])}))
 WHEN 'order' THEN EXISTS(SELECT 1 FROM shirt_claims no WHERE no.id=${id} AND (no.member_id=${member} OR ${roleSql(member,['admin','planner'])}))
 WHEN 'member' THEN EXISTS(SELECT 1 FROM members nm WHERE nm.id=${id} AND (nm.id=${member} OR ${roleSql(member,['admin'])}))
 WHEN 'reunion' THEN EXISTS(SELECT 1 FROM reunion_settings ns WHERE ns.id=${id})
 WHEN 'family_calendar_moderation' THEN EXISTS(SELECT 1 FROM family_calendar_events fe WHERE fe.id=${id} AND fe.created_by=${member})
 WHEN 'invitation' THEN ${adultSql(member)} AND EXISTS(SELECT 1 FROM conversation_members cm JOIN conversations cv ON cv.id=cm.conversation_id WHERE cm.conversation_id=${id} AND cm.member_id=${member} AND cm.status='pending' AND cm.invite_generation=${revision} AND cv.archived_at IS NULL)
 WHEN 'conversation' THEN ${adultSql(member)} AND EXISTS(SELECT 1 FROM conversation_members cm JOIN conversations cv ON cv.id=cm.conversation_id WHERE cm.conversation_id=${id} AND cm.member_id=${member} AND cm.status='active' AND cm.notifications_muted=0 AND cv.archived_at IS NULL)
 ELSE 0 END`;
}
export function followingSql(member,actor,scope,selected){return `(${scope}='all' OR (${scope}='family' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=${actor} AND fm.member_group='family')) OR (${scope}='loved_ones' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=${actor} AND fm.member_group='loved_ones')) OR (${scope}='leaders' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=${actor} AND fm.is_leader=1)) OR (${scope}='selected' AND EXISTS(SELECT 1 FROM json_each(COALESCE(${selected},'[]')) fs WHERE fs.value=${actor})))`}
