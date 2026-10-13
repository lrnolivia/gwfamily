-- Independent category channels. No subscriptions, consent, runtime gates,
-- historic events or provider calls are created by this migration.
-- In app keeps categories_json; channels_json stores only explicit email/push
-- offs. Preserve the pre-existing all-channel meaning of category opt-outs.
ALTER TABLE notification_settings ADD COLUMN channels_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(channels_json));
UPDATE notification_settings SET channels_json=(
 SELECT json_group_object(key,json('{"email":false,"push":false}')) FROM json_each(notification_settings.categories_json) WHERE type='false' AND key IN ('following','mentions','replies','reactions','announcements','birthdays','households','fees','orders','membership','reunion','messages')
);

-- A rollback Worker still writes unprefixed tokens and treats a category as an
-- all-channel switch. Preserve every legacy off without undoing explicit channel
-- offs on a later legacy On. Rewriting an already-false category is still an
-- explicit legacy Off; do not require the JSON bytes to change. New API writes
-- use an internal channels: token.
CREATE TRIGGER notification_channels_legacy_insert AFTER INSERT ON notification_settings
WHEN NEW.write_token NOT LIKE 'channels:%'
BEGIN
 UPDATE notification_settings SET channels_json=json_patch(NEW.channels_json,(SELECT json_group_object(key,json('{"email":false,"push":false}')) FROM json_each(NEW.categories_json) WHERE type='false' AND key IN ('following','mentions','replies','reactions','announcements','birthdays','households','fees','orders','membership','reunion','messages'))) WHERE member_id=NEW.member_id;
END;
CREATE TRIGGER notification_channels_legacy_update AFTER UPDATE OF categories_json ON notification_settings
WHEN NEW.write_token NOT LIKE 'channels:%'
BEGIN
 UPDATE notification_settings SET channels_json=json_patch(NEW.channels_json,(SELECT json_group_object(key,json('{"email":false,"push":false}')) FROM json_each(NEW.categories_json) WHERE type='false' AND key IN ('following','mentions','replies','reactions','announcements','birthdays','households','fees','orders','membership','reunion','messages'))) WHERE member_id=NEW.member_id;
END;

-- A first-ever Off save inserts rows rather than updating them. Match the
-- established UPDATE revocation behavior for both settings and legacy scope.
-- Repeated triggers cannot rotate a device twice: only active devices revoke.
CREATE TRIGGER push_revoke_global_insert_off AFTER INSERT ON notification_settings WHEN NEW.global_off=1
BEGIN
 UPDATE push_devices SET revoked_at=unixepoch()*1000,generation=generation+1 WHERE member_id=NEW.member_id AND revoked_at IS NULL;
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.member_id) AND state IN('pending','leased');
END;
CREATE TRIGGER push_revoke_legacy_insert_off AFTER INSERT ON notification_preferences WHEN NEW.scope='off'
BEGIN
 UPDATE push_devices SET revoked_at=unixepoch()*1000,generation=generation+1 WHERE member_id=NEW.member_id AND revoked_at IS NULL;
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.member_id) AND state IN('pending','leased');
END;

-- Delivery-only recipient rows may exist while In app is off. They never enter
-- in-app list/count/bulk-action queries. Fanout requires an effective channel at
-- commit; opting in later does not create a historical recipient or outbox row.
-- Direct-category precedence, Following and resource authorization are retained.
DROP TRIGGER notification_event_fanout;
CREATE TRIGGER notification_event_fanout AFTER INSERT ON notification_events BEGIN
 INSERT OR IGNORE INTO notifications(id,recipient_id,kind,subject_id,event_id,category,resource_kind,resource_id,container_id,data_json,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),r.id,CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR (COALESCE(json_extract(s.categories_json,'$.'||(NEW.direct_category)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000)))) AND NEW.direct_category='mentions' THEN CASE WHEN NEW.resource_kind='memory' THEN 'memory.tagged' ELSE 'post.tagged' END ELSE NEW.kind END,COALESCE(NEW.container_id,NEW.resource_id),NEW.id,CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR (COALESCE(json_extract(s.categories_json,'$.'||(NEW.direct_category)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000)))) AND NEW.direct_category IS NOT NULL THEN NEW.direct_category ELSE NEW.category END,NEW.resource_kind,NEW.resource_id,NEW.container_id,json_object('title','You have a family update','text','Open to view the latest details.','targetId',COALESCE(NEW.container_id,NEW.resource_id)),NEW.occurred_at,NEW.occurred_at
 FROM members r JOIN user u ON u.id=r.id LEFT JOIN notification_preferences p ON p.member_id=r.id LEFT JOIN notification_settings s ON s.member_id=r.id
 WHERE EXISTS(SELECT 1 FROM members nm JOIN user nu ON nu.id=nm.id WHERE nm.id=r.id AND nm.status='active' AND nu.emailVerified=1 AND nm.member_group IN ('family','loved_ones')) AND (NEW.actor_id IS NULL OR r.id!=NEW.actor_id)
 AND COALESCE(p.scope,'leaders')!='off' AND COALESCE(s.global_off,0)=0 AND (COALESCE(json_extract(s.categories_json,'$.'||(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR (COALESCE(json_extract(s.categories_json,'$.'||(NEW.direct_category)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000)))) AND NEW.direct_category IS NOT NULL THEN NEW.direct_category ELSE NEW.category END)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR (COALESCE(json_extract(s.categories_json,'$.'||(NEW.direct_category)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000)))) AND NEW.direct_category IS NOT NULL THEN NEW.direct_category ELSE NEW.category END)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR (COALESCE(json_extract(s.categories_json,'$.'||(NEW.direct_category)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000)))) AND NEW.direct_category IS NOT NULL THEN NEW.direct_category ELSE NEW.category END)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000)))
 AND (NEW.audience='all' OR (EXISTS(SELECT 1 FROM json_each(NEW.direct_ids_json) nd WHERE nd.value=r.id) AND (NEW.direct_category IS NULL OR (COALESCE(json_extract(s.categories_json,'$.'||(NEW.direct_category)),1)=1 OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=r.id AND ep.enabled=1)) OR (COALESCE(json_extract(s.channels_json,'$.'||(NEW.direct_category)||'.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=r.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000))))) OR (NEW.audience='following' AND (COALESCE(p.scope,'leaders')='all' OR (COALESCE(p.scope,'leaders')='family' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=NEW.actor_id AND fm.member_group='family')) OR (COALESCE(p.scope,'leaders')='loved_ones' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=NEW.actor_id AND fm.member_group='loved_ones')) OR (COALESCE(p.scope,'leaders')='leaders' AND EXISTS(SELECT 1 FROM members fm WHERE fm.id=NEW.actor_id AND fm.is_leader=1)) OR (COALESCE(p.scope,'leaders')='selected' AND EXISTS(SELECT 1 FROM json_each(COALESCE(p.selected_ids_json,'[]')) fs WHERE fs.value=NEW.actor_id)))))
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

DROP TRIGGER push_enqueue;
CREATE TRIGGER push_enqueue AFTER INSERT ON notifications
WHEN NEW.event_id IS NOT NULL AND (SELECT enabled FROM push_control WHERE id=1)=1
BEGIN
 INSERT OR IGNORE INTO push_outbox(id,notification_id,device_id,generation,next_at,expires_at)
 SELECT lower(hex(randomblob(16))),NEW.id,d.id,d.generation,unixepoch()*1000,
 MIN(unixepoch()*1000 + CASE WHEN NEW.category IN('messages','mentions','replies') THEN 3600000 WHEN NEW.category IN('following','reactions','birthdays') THEN 900000 ELSE 86400000 END,
 COALESCE((SELECT unixepoch(expires_at)*1000 FROM notification_events WHERE id=NEW.event_id),unixepoch()*1000+86400000))
 FROM push_devices d JOIN session ss ON ss.id=d.session_id AND ss.userId=d.member_id
 WHERE d.member_id=NEW.recipient_id AND COALESCE((SELECT json_extract(channels_json,'$.'||NEW.category||'.push') FROM notification_settings WHERE member_id=NEW.recipient_id),1)=1 AND d.revoked_at IS NULL AND ss.expiresAt>unixepoch()*1000;
END;

DROP TRIGGER email_notification_enqueue;
CREATE TRIGGER email_notification_enqueue AFTER INSERT ON notifications
WHEN NEW.event_id IS NOT NULL AND (SELECT enabled FROM email_notification_control WHERE id=1)=1
BEGIN
 INSERT OR IGNORE INTO email_notification_outbox(id,notification_id,member_id,recipient_email,generation,next_at,expires_at)
 SELECT lower(hex(randomblob(16))),NEW.id,p.member_id,u.email,p.generation,unixepoch()*1000,
 MIN(unixepoch()*1000+86400000,COALESCE((SELECT unixepoch(expires_at)*1000 FROM notification_events WHERE id=NEW.event_id),unixepoch()*1000+86400000))
 FROM email_notification_preferences p JOIN user u ON u.id=p.member_id JOIN members m ON m.id=p.member_id
 WHERE p.member_id=NEW.recipient_id AND COALESCE((SELECT json_extract(channels_json,'$.'||NEW.category||'.email') FROM notification_settings WHERE member_id=NEW.recipient_id),1)=1 AND p.enabled=1 AND u.emailVerified=1 AND m.status='active' AND m.removed_at IS NULL AND m.member_group IN ('family','loved_ones');
END;

-- Turning one channel off cancels queued/leased work for that channel, without
-- revoking devices, enabling email, or touching other-channel deliveries.
-- An external dispatch already in progress cannot be recalled.
CREATE TRIGGER notification_email_channel_insert AFTER INSERT ON notification_settings
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE member_id=NEW.member_id AND state IN('pending','leased') AND notification_id IN(
  SELECT id FROM notifications WHERE recipient_id=NEW.member_id AND COALESCE(json_extract(NEW.channels_json,'$.'||category||'.email'),1)=0
 );
END;
CREATE TRIGGER notification_push_channel_insert AFTER INSERT ON notification_settings
BEGIN
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.member_id) AND state IN('pending','leased') AND notification_id IN(
  SELECT id FROM notifications WHERE recipient_id=NEW.member_id AND COALESCE(json_extract(NEW.channels_json,'$.'||category||'.push'),1)=0
 );
END;
CREATE TRIGGER notification_email_channel_update AFTER UPDATE OF channels_json ON notification_settings
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE member_id=NEW.member_id AND state IN('pending','leased') AND notification_id IN(
  SELECT id FROM notifications WHERE recipient_id=NEW.member_id AND COALESCE(json_extract(NEW.channels_json,'$.'||category||'.email'),1)=0
 );
END;
CREATE TRIGGER notification_push_channel_update AFTER UPDATE OF channels_json ON notification_settings
BEGIN
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.member_id) AND state IN('pending','leased') AND notification_id IN(
  SELECT id FROM notifications WHERE recipient_id=NEW.member_id AND COALESCE(json_extract(NEW.channels_json,'$.'||category||'.push'),1)=0
 );
END;

-- Cancel pending work now covered by an inherited off. Do not reset consent,
-- device generations, accepted records, read/dismiss history or settings revision.
UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE state IN('pending','leased') AND notification_id IN(SELECT n.id FROM notifications n JOIN notification_settings s ON s.member_id=n.recipient_id WHERE COALESCE(json_extract(s.channels_json,'$.'||n.category||'.email'),1)=0);
UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE state IN('pending','leased') AND notification_id IN(SELECT n.id FROM notifications n JOIN notification_settings s ON s.member_id=n.recipient_id WHERE COALESCE(json_extract(s.channels_json,'$.'||n.category||'.push'),1)=0);
