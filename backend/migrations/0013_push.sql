-- CANDIDATE ONLY. Do not apply until admitted, reviewed and activation approved.
-- Existing notification_settings.push_enabled CHECK(push_enabled=0) stays intact.
CREATE TABLE push_control(id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)));
INSERT INTO push_control(id,enabled) VALUES(1,0);
CREATE TABLE push_devices(
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id),
 session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
 key_version TEXT NOT NULL, label TEXT NOT NULL DEFAULT 'This device',
 created_at INTEGER NOT NULL, confirmed_at INTEGER NOT NULL, revoked_at INTEGER,
 generation INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX push_devices_member ON push_devices(member_id,revoked_at);
CREATE TABLE push_outbox(
 id TEXT PRIMARY KEY, notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
 generation INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','accepted','cancelled','expired','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 lease_token TEXT, lease_until INTEGER, last_status TEXT, accepted_at INTEGER,
 UNIQUE(notification_id,device_id,generation)
);
CREATE INDEX push_outbox_due ON push_outbox(state,next_at,lease_until);
-- Commit-time recipient snapshot: only an already-created inbox row can enqueue.
-- No backfill on opt-in, re-enable or migration. No payload/private content stored.
CREATE TRIGGER push_enqueue AFTER INSERT ON notifications
WHEN NEW.event_id IS NOT NULL AND (SELECT enabled FROM push_control WHERE id=1)=1
BEGIN
 INSERT OR IGNORE INTO push_outbox(id,notification_id,device_id,generation,next_at,expires_at)
 SELECT lower(hex(randomblob(16))),NEW.id,d.id,d.generation,unixepoch()*1000,
 MIN(unixepoch()*1000 + CASE WHEN NEW.category IN('messages','mentions','replies') THEN 3600000 WHEN NEW.category IN('following','reactions','birthdays') THEN 900000 ELSE 86400000 END,
 COALESCE((SELECT unixepoch(expires_at)*1000 FROM notification_events WHERE id=NEW.event_id),unixepoch()*1000+86400000))
 FROM push_devices d JOIN session ss ON ss.id=d.session_id AND ss.userId=d.member_id
 WHERE d.member_id=NEW.recipient_id AND d.revoked_at IS NULL AND ss.expiresAt>unixepoch()*1000;
END;
CREATE TRIGGER push_revoke_global_off AFTER UPDATE OF global_off ON notification_settings WHEN NEW.global_off=1
BEGIN
 UPDATE push_devices SET revoked_at=unixepoch()*1000,generation=generation+1 WHERE member_id=NEW.member_id AND revoked_at IS NULL;
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.member_id) AND state IN('pending','leased');
END;
CREATE TRIGGER push_revoke_legacy_off AFTER UPDATE OF scope ON notification_preferences WHEN NEW.scope='off'
BEGIN
 UPDATE push_devices SET revoked_at=unixepoch()*1000,generation=generation+1 WHERE member_id=NEW.member_id AND revoked_at IS NULL;
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.member_id) AND state IN('pending','leased');
END;
CREATE TRIGGER push_revoke_member AFTER UPDATE OF status ON members WHEN NEW.status!='active'
BEGIN
 UPDATE push_devices SET revoked_at=unixepoch()*1000,generation=generation+1 WHERE member_id=NEW.id AND revoked_at IS NULL;
 UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=NEW.id) AND state IN('pending','leased');
END;
CREATE TABLE push_registration_limits(member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,bucket INTEGER NOT NULL,attempts INTEGER NOT NULL);
