-- Additive, no recipients opted in and no historical backfill.
CREATE TABLE email_notification_control(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)));
INSERT INTO email_notification_control(id,enabled) VALUES(1,1);
CREATE TABLE email_notification_preferences(
 member_id TEXT PRIMARY KEY REFERENCES members(id),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 preset TEXT NOT NULL DEFAULT 'green' CHECK(preset IN('red','orange','yellow','green','blue','violet','coral-pink','stone')),
 heading_font TEXT NOT NULL DEFAULT 'sans' CHECK(heading_font IN('sans','serif')),
 theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN('light','dark')),
 revision INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 1,write_token TEXT NOT NULL DEFAULT '',consented_at INTEGER,updated_at INTEGER NOT NULL
);
CREATE TABLE email_notification_outbox(
 id TEXT PRIMARY KEY,notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES members(id),recipient_email TEXT NOT NULL,generation INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','dispatching','accepted','cancelled','expired','failed','unknown')),
 attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 lease_token TEXT,lease_until INTEGER,last_code TEXT,accepted_at INTEGER,
 UNIQUE(notification_id,member_id,generation)
);
CREATE INDEX email_notification_due ON email_notification_outbox(state,next_at,lease_until);
-- Only already-authorized new inbox rows may enqueue. No names/text in the queue.
CREATE TRIGGER email_notification_enqueue AFTER INSERT ON notifications
WHEN NEW.event_id IS NOT NULL AND (SELECT enabled FROM email_notification_control WHERE id=1)=1
BEGIN
 INSERT OR IGNORE INTO email_notification_outbox(id,notification_id,member_id,recipient_email,generation,next_at,expires_at)
 SELECT lower(hex(randomblob(16))),NEW.id,p.member_id,u.email,p.generation,unixepoch()*1000,
 MIN(unixepoch()*1000+86400000,COALESCE((SELECT unixepoch(expires_at)*1000 FROM notification_events WHERE id=NEW.event_id),unixepoch()*1000+86400000))
 FROM email_notification_preferences p JOIN user u ON u.id=p.member_id JOIN members m ON m.id=p.member_id
 WHERE p.member_id=NEW.recipient_id AND p.enabled=1 AND u.emailVerified=1 AND m.status='active' AND m.removed_at IS NULL AND m.member_group IN ('family','loved_ones');
END;
CREATE TRIGGER email_notification_opt_out AFTER UPDATE OF enabled,generation ON email_notification_preferences
WHEN NEW.enabled=0 OR NEW.generation!=OLD.generation
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL
 WHERE member_id=NEW.member_id AND state IN('pending','leased');
END;
CREATE TRIGGER email_notification_activity_off AFTER UPDATE OF global_off ON notification_settings WHEN NEW.global_off=1
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE member_id=NEW.member_id AND state IN('pending','leased');
END;
CREATE TRIGGER email_notification_activity_insert_off AFTER INSERT ON notification_settings WHEN NEW.global_off=1
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE member_id=NEW.member_id AND state IN('pending','leased');
END;
CREATE TRIGGER email_notification_legacy_off AFTER UPDATE OF scope ON notification_preferences WHEN NEW.scope='off'
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE member_id=NEW.member_id AND state IN('pending','leased');
END;
CREATE TRIGGER email_notification_legacy_insert_off AFTER INSERT ON notification_preferences WHEN NEW.scope='off'
BEGIN
 UPDATE email_notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE member_id=NEW.member_id AND state IN('pending','leased');
END;
CREATE TRIGGER email_notification_member_off AFTER UPDATE OF status,removed_at ON members
WHEN NEW.status!='active' OR NEW.removed_at IS NOT NULL
BEGIN
 UPDATE email_notification_preferences SET enabled=0,generation=generation+1,revision=revision+1,updated_at=unixepoch()*1000 WHERE member_id=NEW.id;
END;
CREATE TRIGGER email_notification_address_changed AFTER UPDATE OF email,emailVerified ON user
WHEN NEW.email!=OLD.email OR NEW.emailVerified!=OLD.emailVerified
BEGIN
 UPDATE email_notification_preferences SET enabled=0,generation=generation+1,revision=revision+1,updated_at=unixepoch()*1000 WHERE member_id=NEW.id;
END;
