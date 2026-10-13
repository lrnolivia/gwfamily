-- Additive durable in-app notifications. No historical event backfill or delivery.
-- Fanout executes inside the domain write transaction, including legacy writers.
PRAGMA foreign_keys=ON;
CREATE TABLE notification_events (
 id TEXT PRIMARY KEY,
 event_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL,
 actor_id TEXT REFERENCES members(id),
 resource_kind TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 container_id TEXT,
 resource_revision INTEGER NOT NULL DEFAULT 1,
 category TEXT NOT NULL,
 audience TEXT NOT NULL CHECK(audience IN ('all','direct','following')),
 direct_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(direct_ids_json)),
 direct_category TEXT,
 data_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(data_json)),
 occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT
);
ALTER TABLE notifications ADD COLUMN event_id TEXT REFERENCES notification_events(id);
ALTER TABLE notifications ADD COLUMN category TEXT NOT NULL DEFAULT 'following';
ALTER TABLE notifications ADD COLUMN resource_kind TEXT;
ALTER TABLE notifications ADD COLUMN resource_id TEXT;
ALTER TABLE notifications ADD COLUMN container_id TEXT;
ALTER TABLE notifications ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX notifications_event_recipient ON notifications(event_id,recipient_id) WHERE event_id IS NOT NULL;
CREATE TABLE notification_sequence(sequence INTEGER PRIMARY KEY AUTOINCREMENT,notification_id TEXT NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE);
INSERT INTO notification_sequence(notification_id) SELECT id FROM notifications ORDER BY created_at,id;
CREATE INDEX notifications_unread ON notifications(recipient_id,dismissed_at,read_at);
CREATE TABLE notification_settings(member_id TEXT PRIMARY KEY REFERENCES members(id),categories_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(categories_json)),following_scope TEXT NOT NULL DEFAULT 'leaders' CHECK(following_scope IN ('all','family','loved_ones','leaders','selected')),push_enabled INTEGER NOT NULL DEFAULT 0 CHECK(push_enabled=0),global_off INTEGER NOT NULL DEFAULT 0 CHECK(global_off IN (0,1)),write_token TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE notification_setting_guards(token TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
-- Preserve the Following choice separately while mirroring effective Off for
-- older Workers/UI. Existing preference rows keep their exact stored values.
INSERT INTO notification_settings(member_id,following_scope,global_off)
 SELECT member_id,CASE WHEN scope='off' THEN 'leaders' ELSE scope END,CASE WHEN scope='off' THEN 1 ELSE 0 END FROM notification_preferences;
CREATE TRIGGER notification_legacy_preferences_insert AFTER INSERT ON notification_preferences
WHEN NOT EXISTS(SELECT 1 FROM notification_settings ns JOIN notification_setting_guards ng ON ng.token=ns.write_token WHERE ns.member_id=NEW.member_id)
BEGIN
 INSERT INTO notification_settings(member_id,following_scope,global_off,revision)
 VALUES(NEW.member_id,CASE WHEN NEW.scope='off' THEN 'leaders' ELSE NEW.scope END,CASE WHEN NEW.scope='off' THEN 1 ELSE 0 END,1)
 ON CONFLICT(member_id) DO UPDATE SET following_scope=CASE WHEN NEW.scope='off' THEN notification_settings.following_scope ELSE NEW.scope END,global_off=CASE WHEN NEW.scope='off' THEN 1 ELSE 0 END,revision=notification_settings.revision+1,write_token='',updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER notification_legacy_preferences_update AFTER UPDATE OF scope,selected_ids_json ON notification_preferences
WHEN (NEW.scope!=OLD.scope OR NEW.selected_ids_json!=OLD.selected_ids_json) AND NOT EXISTS(SELECT 1 FROM notification_settings ns JOIN notification_setting_guards ng ON ng.token=ns.write_token WHERE ns.member_id=NEW.member_id)
BEGIN
 INSERT INTO notification_settings(member_id,following_scope,global_off,revision)
 VALUES(NEW.member_id,CASE WHEN NEW.scope='off' THEN 'leaders' ELSE NEW.scope END,CASE WHEN NEW.scope='off' THEN 1 ELSE 0 END,1)
 ON CONFLICT(member_id) DO UPDATE SET following_scope=CASE WHEN NEW.scope='off' THEN notification_settings.following_scope ELSE NEW.scope END,global_off=CASE WHEN NEW.scope='off' THEN 1 ELSE 0 END,revision=notification_settings.revision+1,write_token='',updated_at=CURRENT_TIMESTAMP;
END;

ALTER TABLE command_receipts ADD COLUMN operation TEXT;
ALTER TABLE command_receipts ADD COLUMN fingerprint TEXT;
ALTER TABLE posts ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fee_reports ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shirt_claims ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE members ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reunion_settings ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE conversation_members ADD COLUMN invite_generation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE conversation_members ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE conversation_members ADD COLUMN notifications_muted INTEGER NOT NULL DEFAULT 0 CHECK(notifications_muted IN (0,1));
ALTER TABLE conversations ADD COLUMN notification_revision INTEGER NOT NULL DEFAULT 1;
-- An older Worker may still attempt its generic fanout after the domain trigger.
-- Suppress only event-managed legacy writes; untouched historic rows survive.
CREATE TRIGGER notification_legacy_fanout_guard BEFORE INSERT ON notifications
WHEN NEW.event_id IS NULL AND NEW.kind IN ('post','comment') AND EXISTS(
 SELECT 1 FROM notification_events e WHERE
 (NEW.kind='post' AND e.resource_id=NEW.subject_id AND e.kind IN ('post.published','memory.published','announcement.published','birthday.celebrated')) OR
 (NEW.kind='comment' AND e.container_id=NEW.subject_id AND e.kind IN ('comment.created','reply.created') AND e.actor_id=json_extract(NEW.data_json,'$.authorId'))
) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER notification_sequence_insert AFTER INSERT ON notifications BEGIN
 INSERT INTO notification_sequence(notification_id) VALUES(NEW.id);
END;
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
CREATE TRIGGER notify_post_created AFTER INSERT ON posts WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'post:'||NEW.id||':published',CASE WHEN json_extract(NEW.metadata_json,'$.systemBirthday')=1 THEN 'birthday.celebrated' WHEN json_extract(NEW.metadata_json,'$.asLeader')=1 THEN 'announcement.published' WHEN json_extract(NEW.metadata_json,'$.memoryId') IS NOT NULL THEN 'memory.published' ELSE 'post.published' END,NEW.author_id,CASE WHEN json_extract(NEW.metadata_json,'$.memoryId') IS NOT NULL THEN 'memory' ELSE 'post' END,NEW.id,NULL,1,CASE WHEN json_extract(NEW.metadata_json,'$.systemBirthday')=1 THEN 'birthdays' WHEN json_extract(NEW.metadata_json,'$.asLeader')=1 THEN 'announcements' ELSE 'following' END,CASE WHEN json_extract(NEW.metadata_json,'$.systemBirthday')=1 OR json_extract(NEW.metadata_json,'$.asLeader')=1 THEN 'all' ELSE 'following' END,COALESCE(COALESCE(json_extract(NEW.metadata_json,'$.memberIds'),'[]'),'[]'),'mentions','{}' WHERE 1;
END;
CREATE TRIGGER notify_post_new_tags AFTER UPDATE OF metadata_json ON posts WHEN NEW.deleted_at IS NULL AND EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(NEW.metadata_json,'$.memberIds'),'[]')) WHERE value NOT IN (SELECT value FROM json_each(COALESCE(json_extract(OLD.metadata_json,'$.memberIds'),'[]')))) BEGIN
UPDATE posts SET notification_revision=OLD.notification_revision+1 WHERE id=NEW.id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'post:'||NEW.id||':tags:'||(OLD.notification_revision+1),CASE WHEN json_extract(NEW.metadata_json,'$.memoryId') IS NOT NULL THEN 'memory.tagged' ELSE 'post.tagged' END,NEW.author_id,CASE WHEN json_extract(NEW.metadata_json,'$.memoryId') IS NOT NULL THEN 'memory' ELSE 'post' END,NEW.id,NULL,OLD.notification_revision+1,'mentions','direct',COALESCE((SELECT json_group_array(value) FROM json_each(COALESCE(json_extract(NEW.metadata_json,'$.memberIds'),'[]')) WHERE value NOT IN (SELECT value FROM json_each(COALESCE(json_extract(OLD.metadata_json,'$.memberIds'),'[]')))),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_comment_created AFTER INSERT ON comments WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'comment:'||NEW.id||':created',CASE WHEN NEW.parent_id IS NULL THEN 'comment.created' ELSE 'reply.created' END,NEW.author_id,'comment',NEW.id,NEW.post_id,1,'replies','direct',COALESCE((SELECT json_group_array(author_id) FROM (SELECT author_id FROM posts WHERE id=NEW.post_id UNION SELECT author_id FROM comments WHERE id=NEW.parent_id)),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_reaction_added AFTER INSERT ON reactions WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'reaction:'||lower(hex(randomblob(16))),'reaction.added',NEW.member_id,CASE WHEN NEW.comment_id IS NULL THEN 'post' ELSE 'comment' END,COALESCE(NEW.post_id,NEW.comment_id),(SELECT post_id FROM comments WHERE id=NEW.comment_id),1,'reactions','direct',COALESCE((SELECT json_group_array(author_id) FROM (SELECT author_id FROM posts WHERE id=NEW.post_id UNION SELECT author_id FROM comments WHERE id=NEW.comment_id)),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_fee_reported AFTER INSERT ON fee_reports WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'fee:'||NEW.id||':reported','fee.reported',NEW.member_id,'fee',NEW.id,NULL,1,'fees','direct',COALESCE((SELECT json_group_array(id) FROM members WHERE status='active' AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value='treasurer')),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_fee_status AFTER UPDATE OF status ON fee_reports WHEN NEW.status!=OLD.status BEGIN
UPDATE fee_reports SET notification_revision=OLD.notification_revision+1 WHERE id=NEW.id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'fee:'||NEW.id||':status:'||(OLD.notification_revision+1),'fee.status_changed',NEW.confirmed_by,'fee',NEW.id,NULL,OLD.notification_revision+1,'fees','direct',COALESCE(json_array(NEW.member_id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_order_claimed AFTER INSERT ON shirt_claims WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'order:'||NEW.id||':claimed','order.claimed',NEW.member_id,'order',NEW.id,NULL,1,'orders','direct',COALESCE((SELECT json_group_array(id) FROM members WHERE status='active' AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('admin','planner'))),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_order_status AFTER UPDATE OF status,tracking_url ON shirt_claims WHEN NEW.status!=OLD.status OR COALESCE(NEW.tracking_url,'')!=COALESCE(OLD.tracking_url,'') BEGIN
UPDATE shirt_claims SET notification_revision=OLD.notification_revision+1 WHERE id=NEW.id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'order:'||NEW.id||':status:'||(OLD.notification_revision+1),'order.status_changed',NULL,'order',NEW.id,NULL,OLD.notification_revision+1,'orders','direct',COALESCE(json_array(NEW.member_id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_membership_request AFTER INSERT ON members WHEN NEW.status='pending' BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'member:'||NEW.id||':requested','membership.requested',NEW.id,'member',NEW.id,NULL,1,'membership','direct',COALESCE((SELECT json_group_array(id) FROM members WHERE status='active' AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value='admin')),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_membership_change AFTER UPDATE OF status,roles_json,can_post,is_leader ON members WHEN NEW.status!=OLD.status OR NEW.roles_json!=OLD.roles_json OR NEW.can_post!=OLD.can_post OR NEW.is_leader!=OLD.is_leader BEGIN
UPDATE members SET notification_revision=OLD.notification_revision+1 WHERE id=NEW.id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'member:'||NEW.id||':changed:'||(OLD.notification_revision+1),CASE WHEN NEW.status!=OLD.status THEN 'membership.status_changed' ELSE 'membership.role_changed' END,NULL,'member',NEW.id,NULL,OLD.notification_revision+1,'membership','direct',COALESCE(json_array(NEW.id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_household_request AFTER INSERT ON household_requests WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'household:'||NEW.id||':requested',CASE WHEN NEW.kind='invite' THEN 'household.invited' ELSE 'household.requested' END,NEW.requester_id,'household_request',NEW.id,NEW.household_id,1,'households','direct',COALESCE(CASE WHEN NEW.kind IN ('invite','head') THEN json_array(NEW.recipient_id) ELSE (SELECT json_group_array(member_id) FROM household_members WHERE household_id=NEW.household_id AND role='head') END,'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_household_resolved AFTER UPDATE OF status ON household_requests WHEN NEW.status!=OLD.status BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'household:'||NEW.id||':'||NEW.status,'household.resolved',NULL,'household_request',NEW.id,NEW.household_id,1,'households','direct',COALESCE(json_array(NEW.requester_id,NEW.recipient_id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_household_email_invited AFTER INSERT ON household_email_invites WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'household-email:'||NEW.id||':invited','household.invited',NEW.sender_id,'household_invitation',NEW.id,NEW.household_id,1,'households','direct',COALESCE((SELECT json_group_array(id) FROM user WHERE lower(email)=NEW.recipient_email),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_household_email_accepted AFTER UPDATE OF accepted_at ON household_email_invites WHEN OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'household-email:'||NEW.id||':accepted','household.resolved',NEW.accepted_by,'household_invitation',NEW.id,NEW.household_id,1,'households','direct',COALESCE(json_array(NEW.sender_id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_reunion_update AFTER UPDATE OF data_json ON reunion_settings WHEN COALESCE(json_extract(NEW.data_json,'$.date'),'')!=COALESCE(json_extract(OLD.data_json,'$.date'),'') OR COALESCE(json_extract(NEW.data_json,'$.time'),'')!=COALESCE(json_extract(OLD.data_json,'$.time'),'') OR COALESCE(json_extract(NEW.data_json,'$.endDate'),'')!=COALESCE(json_extract(OLD.data_json,'$.endDate'),'') OR COALESCE(json_extract(NEW.data_json,'$.location'),'')!=COALESCE(json_extract(OLD.data_json,'$.location'),'') OR COALESCE(json_extract(NEW.data_json,'$.address'),'')!=COALESCE(json_extract(OLD.data_json,'$.address'),'') OR COALESCE(json_extract(NEW.data_json,'$.schedule'),'')!=COALESCE(json_extract(OLD.data_json,'$.schedule'),'') BEGIN
UPDATE reunion_settings SET notification_revision=OLD.notification_revision+1 WHERE id=NEW.id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'reunion:'||NEW.id||':'||(OLD.notification_revision+1),'reunion.changed',NEW.updated_by,'reunion',NEW.id,NULL,OLD.notification_revision+1,'reunion','all',COALESCE('[]','[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_reunion_created AFTER INSERT ON reunion_settings WHEN COALESCE(json_extract(NEW.data_json,'$.date'),'')!='' OR COALESCE(json_extract(NEW.data_json,'$.location'),'')!='' BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'reunion:'||NEW.id||':1','reunion.changed',NEW.updated_by,'reunion',NEW.id,NULL,1,'reunion','all',COALESCE('[]','[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_conversation_invitation AFTER INSERT ON conversation_members WHEN NEW.status='pending' BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'invitation:'||NEW.conversation_id||':'||NEW.member_id||':'||(NEW.invite_generation),'conversation.invited',NEW.invited_by,'invitation',NEW.conversation_id,NULL,NEW.invite_generation,'messages','direct',COALESCE(json_array(NEW.member_id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_conversation_reinvite AFTER UPDATE OF status ON conversation_members WHEN NEW.status='pending' AND OLD.status!='pending' BEGIN
UPDATE conversation_members SET invite_generation=OLD.invite_generation+1 WHERE conversation_id=NEW.conversation_id AND member_id=NEW.member_id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'invitation:'||NEW.conversation_id||':'||NEW.member_id||':'||(OLD.invite_generation+1),'conversation.invited',NEW.invited_by,'invitation',NEW.conversation_id,NULL,OLD.invite_generation+1,'messages','direct',COALESCE(json_array(NEW.member_id),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_conversation_invitation_resolved AFTER UPDATE OF status ON conversation_members WHEN OLD.status='pending' AND NEW.status IN ('active','declined') BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'invitation:'||NEW.conversation_id||':'||NEW.member_id||':'||NEW.invite_generation||':resolved','conversation.invitation_resolved',NEW.member_id,'conversation',NEW.conversation_id,NULL,1,'messages','direct',COALESCE(json_array(NEW.invited_by),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_message_created AFTER INSERT ON messages WHEN 1 BEGIN
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'message:'||NEW.id||':created','message.created',NEW.author_id,'conversation',NEW.conversation_id,NULL,1,'messages','direct',COALESCE((SELECT json_group_array(member_id) FROM conversation_members WHERE conversation_id=NEW.conversation_id AND status='active'),'[]'),NULL,json_object('messageId',NEW.id,'sequence',NEW.sequence) WHERE 1;
END;
CREATE TRIGGER notify_conversation_member_change AFTER UPDATE OF role,status ON conversation_members WHEN (NEW.role!=OLD.role AND NEW.status='active') OR (OLD.status='active' AND NEW.status IN ('removed','left')) BEGIN
UPDATE conversation_members SET notification_revision=OLD.notification_revision+1 WHERE conversation_id=NEW.conversation_id AND member_id=NEW.member_id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'conversation-member:'||NEW.conversation_id||':'||NEW.member_id||':'||(OLD.notification_revision+1),CASE WHEN NEW.role!=OLD.role THEN 'conversation.role_changed' ELSE 'conversation.member_changed' END,NULL,'conversation',NEW.conversation_id,NULL,OLD.notification_revision+1,'messages','direct',COALESCE((SELECT json_group_array(member_id) FROM conversation_members WHERE conversation_id=NEW.conversation_id AND status='active'),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notify_conversation_change AFTER UPDATE OF name,owner_id ON conversations WHEN NEW.name!=OLD.name OR (NEW.owner_id IS NOT OLD.owner_id AND NEW.archived_at IS NULL) BEGIN
UPDATE conversations SET notification_revision=OLD.notification_revision+1 WHERE id=NEW.id;
INSERT OR IGNORE INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,container_id,resource_revision,category,audience,direct_ids_json,direct_category,data_json) SELECT lower(hex(randomblob(16))),'conversation:'||NEW.id||':'||(OLD.notification_revision+1),CASE WHEN NEW.name!=OLD.name THEN 'conversation.name_changed' ELSE 'conversation.role_changed' END,NULL,'conversation',NEW.id,NULL,OLD.notification_revision+1,'messages','direct',COALESCE((SELECT json_group_array(member_id) FROM conversation_members WHERE conversation_id=NEW.id AND status='active'),'[]'),NULL,'{}' WHERE 1;
END;
CREATE TRIGGER notification_announcement_seen AFTER INSERT ON announcement_views WHEN 1 BEGIN
UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE recipient_id=NEW.member_id AND resource_id=NEW.post_id AND event_id IN (SELECT id FROM notification_events WHERE kind='announcement.published');
END;
CREATE TRIGGER notification_message_seen AFTER UPDATE OF read_sequence ON conversation_members WHEN NEW.read_sequence>OLD.read_sequence BEGIN
UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE recipient_id=NEW.member_id AND resource_kind='conversation' AND resource_id=NEW.conversation_id AND event_id IN (SELECT id FROM notification_events WHERE kind='message.created' AND resource_id=NEW.conversation_id AND CAST(json_extract(data_json,'$.sequence') AS INTEGER)<=NEW.read_sequence);
END;
