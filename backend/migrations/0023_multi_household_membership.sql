-- Temporarily remove only the dependent notification triggers during the
-- table replacement, then restore their exact current definitions.
DROP TRIGGER notification_event_fanout;
DROP TRIGGER notify_household_request;
-- Preserve existing memberships, roles and joining dates. Account membership
-- is unique within each household; joining another never moves a person.
CREATE TABLE household_members_multi (
 household_id TEXT NOT NULL REFERENCES households(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 role TEXT NOT NULL CHECK(role IN ('head','member')),
 joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(household_id,member_id)
);
INSERT INTO household_members_multi(household_id,member_id,role,joined_at)
 SELECT household_id,member_id,role,joined_at FROM household_members;
DROP TABLE household_members;
ALTER TABLE household_members_multi RENAME TO household_members;
CREATE INDEX household_members_by_member ON household_members(member_id);
ALTER TABLE profiles ADD COLUMN primary_household_id TEXT REFERENCES households(id);
UPDATE profiles SET primary_household_id=(
 SELECT household_id FROM household_members WHERE member_id=profiles.member_id
 ORDER BY joined_at,household_id LIMIT 1
);

CREATE TRIGGER notification_event_fanout AFTER INSERT ON notification_events BEGIN
 INSERT OR IGNORE INTO notifications(id,recipient_id,kind,subject_id,event_id,category,resource_kind,resource_id,container_id,data_json,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),r.id,CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR COALESCE(json_extract(s.categories_json,'$.'||NEW.direct_category),1)=1) AND NEW.direct_category='mentions' THEN CASE WHEN NEW.resource_kind='memory' THEN 'memory.tagged' ELSE 'post.tagged' END ELSE NEW.kind END,COALESCE(NEW.container_id,NEW.resource_id),NEW.id,CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR COALESCE(json_extract(s.categories_json,'$.'||NEW.direct_category),1)=1) AND NEW.direct_category IS NOT NULL THEN NEW.direct_category ELSE NEW.category END,NEW.resource_kind,NEW.resource_id,NEW.container_id,json_object('title','You have a family update','text','Open to view the latest details.','targetId',COALESCE(NEW.container_id,NEW.resource_id)),NEW.occurred_at,NEW.occurred_at
 FROM members r JOIN user u ON u.id=r.id LEFT JOIN notification_preferences p ON p.member_id=r.id LEFT JOIN notification_settings s ON s.member_id=r.id
 WHERE EXISTS(SELECT 1 FROM members nm JOIN user nu ON nu.id=nm.id WHERE nm.id=r.id AND nm.status='active' AND nu.emailVerified=1 AND nm.member_group IN ('family','loved_ones')) AND (NEW.actor_id IS NULL OR r.id!=NEW.actor_id)
 AND COALESCE(p.scope,'leaders')!='off' AND COALESCE(s.global_off,0)=0 AND COALESCE(json_extract(s.categories_json,'$.'||(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR COALESCE(json_extract(s.categories_json,'$.'||NEW.direct_category),1)=1) AND NEW.direct_category IS NOT NULL THEN NEW.direct_category ELSE NEW.category END)),1)=1
 AND (NEW.audience='all' OR (EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR COALESCE(json_extract(s.categories_json,'$.'||NEW.direct_category),1)=1)) OR (NEW.audience='following' AND (COALESCE(p.scope,'leaders')='all' OR (COALESCE(p.scope,'leaders')='family' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=NEW.actor_id AND fm.member_group='family')) OR (COALESCE(p.scope,'leaders')='loved_ones' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=NEW.actor_id AND fm.member_group='loved_ones')) OR (COALESCE(p.scope,'leaders')='leaders' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=NEW.actor_id AND fm.is_leader=1)) OR (COALESCE(p.scope,'leaders')='selected' AND EXISTS(SELECT 1 FROM json_each(COALESCE(p.selected_ids_json,'[]')) fs WHERE fs.value=NEW.actor_id)))))
 AND (CASE NEW.resource_kind
 WHEN 'post' THEN EXISTS(SELECT 1 FROM posts np WHERE np.id=NEW.resource_id AND np.deleted_at IS NULL AND (np.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members ngm WHERE ngm.group_id=np.group_id AND ngm.member_id=r.id)) AND (COALESCE(json_extract(np.metadata_json,'$.systemBirthday'),0)!=1 OR EXISTS(SELECT 1 FROM profiles bp JOIN members bm ON bm.id=bp.member_id WHERE bp.member_id=np.author_id AND bp.birthday_celebration=1 AND bp.birthday<=date('now','-18 years') AND bm.status='active')))
 WHEN 'comment' THEN EXISTS(SELECT 1 FROM comments nc JOIN posts np ON np.id=nc.post_id WHERE nc.id=NEW.resource_id AND nc.deleted_at IS NULL AND np.deleted_at IS NULL AND (np.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members ngm WHERE ngm.group_id=np.group_id AND ngm.member_id=r.id)) AND (COALESCE(json_extract(np.metadata_json,'$.systemBirthday'),0)!=1 OR EXISTS(SELECT 1 FROM profiles bp JOIN members bm ON bm.id=bp.member_id WHERE bp.member_id=np.author_id AND bp.birthday_celebration=1 AND bp.birthday<=date('now','-18 years') AND bm.status='active')))
 WHEN 'memory' THEN EXISTS(SELECT 1 FROM memories nm JOIN posts np ON np.id=nm.id WHERE nm.id=NEW.resource_id AND nm.deleted_at IS NULL AND np.deleted_at IS NULL AND (np.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members ngm WHERE ngm.group_id=np.group_id AND ngm.member_id=r.id)) AND (COALESCE(json_extract(np.metadata_json,'$.systemBirthday'),0)!=1 OR EXISTS(SELECT 1 FROM profiles bp JOIN members bm ON bm.id=bp.member_id WHERE bp.member_id=np.author_id AND bp.birthday_celebration=1 AND bp.birthday<=date('now','-18 years') AND bm.status='active')))
 WHEN 'household_request' THEN EXISTS(SELECT 1 FROM household_requests nh WHERE nh.id=NEW.resource_id AND (nh.requester_id=r.id OR nh.recipient_id=r.id OR EXISTS(SELECT 1 FROM household_members hm WHERE hm.household_id=nh.household_id AND hm.member_id=r.id AND hm.role='head')))
 WHEN 'household_invitation' THEN EXISTS(SELECT 1 FROM household_email_invites hi JOIN user hu ON lower(hu.email)=hi.recipient_email WHERE hi.id=NEW.resource_id AND (hi.sender_id=r.id OR hu.id=r.id) AND (hi.accepted_at IS NOT NULL OR (hi.expires_at>unixepoch()*1000 AND EXISTS(SELECT 1 FROM household_members hh JOIN members hm ON hm.id=hh.member_id WHERE hh.household_id=hi.household_id AND hh.member_id=hi.sender_id AND hh.role='head' AND hm.status='active'))))
 WHEN 'fee' THEN EXISTS(SELECT 1 FROM fee_reports nf WHERE nf.id=NEW.resource_id AND (nf.member_id=r.id OR EXISTS(SELECT 1 FROM members nr,json_each(nr.roles_json) role WHERE nr.id=r.id AND role.value IN ('treasurer'))))
 WHEN 'order' THEN EXISTS(SELECT 1 FROM shirt_claims no WHERE no.id=NEW.resource_id AND (no.member_id=r.id OR EXISTS(SELECT 1 FROM members nr,json_each(nr.roles_json) role WHERE nr.id=r.id AND role.value IN ('admin','planner'))))
 WHEN 'member' THEN EXISTS(SELECT 1 FROM members nm WHERE nm.id=NEW.resource_id AND (nm.id=r.id OR EXISTS(SELECT 1 FROM members nr,json_each(nr.roles_json) role WHERE nr.id=r.id AND role.value IN ('admin'))))
 WHEN 'reunion' THEN EXISTS(SELECT 1 FROM reunion_settings ns WHERE ns.id=NEW.resource_id)
 WHEN 'invitation' THEN EXISTS(SELECT 1 FROM profiles np WHERE np.member_id=r.id AND np.completed=1 AND np.birthday>='1900-01-01' AND np.birthday<=date('now','-18 years')) AND EXISTS(SELECT 1 FROM conversation_members cm JOIN conversations cv ON cv.id=cm.conversation_id WHERE cm.conversation_id=NEW.resource_id AND cm.member_id=r.id AND cm.status='pending' AND cm.invite_generation=NEW.resource_revision AND cv.archived_at IS NULL)
 WHEN 'conversation' THEN EXISTS(SELECT 1 FROM profiles np WHERE np.member_id=r.id AND np.completed=1 AND np.birthday>='1900-01-01' AND np.birthday<=date('now','-18 years')) AND EXISTS(SELECT 1 FROM conversation_members cm JOIN conversations cv ON cv.id=cm.conversation_id WHERE cm.conversation_id=NEW.resource_id AND cm.member_id=r.id AND cm.status='active' AND cm.notifications_muted=0 AND cv.archived_at IS NULL)
 ELSE 0 END);
END;
CREATE TRIGGER notify_household_request AFTER INSERT ON household_requests WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'household:'||NEW.id||':requested',CASE WHEN NEW.kind='invite' THEN 'household.invited' ELSE 'household.requested' END,NEW.requester_id,'household_request',NEW.id,NEW.household_id,1,'households','direct',COALESCE(CASE WHEN NEW.kind IN ('invite','head') THEN json_array(NEW.recipient_id) ELSE (SELECT json_group_array(member_id) FROM household_members WHERE household_id=NEW.household_id AND role='head') END,'[]'),NULL,'{}' WHERE 1;
END;
