-- Additive and reversible membership removal. Authentication and historical
-- family, household, conversation, order, and money records remain untouched.
ALTER TABLE members ADD COLUMN removed_at TEXT;
ALTER TABLE members ADD COLUMN removed_by TEXT REFERENCES members(id);
ALTER TABLE members ADD COLUMN membership_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE membership_change_log(
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES members(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 action TEXT NOT NULL,
 before_json TEXT NOT NULL,
 after_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE membership_write_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CONSTRAINT membership_write_current CHECK(valid=1));
-- All commands in a D1 batch are serialized. These guards apply even when two
-- admins concurrently try to remove, pause, or demote each other.
CREATE TRIGGER membership_keep_last_admin BEFORE UPDATE OF status,roles_json,removed_at ON members
WHEN OLD.status='active' AND OLD.removed_at IS NULL AND EXISTS(SELECT 1 FROM json_each(OLD.roles_json) WHERE value='admin')
 AND (NEW.status!='active' OR NEW.removed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM json_each(NEW.roles_json) WHERE value='admin'))
 AND NOT EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE u.emailVerified=1 AND m.id!=OLD.id AND m.status='active' AND m.removed_at IS NULL AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='admin'))
BEGIN SELECT RAISE(ABORT,'Keep at least one active admin'); END;
CREATE TRIGGER membership_keep_last_admin_delete BEFORE DELETE ON members
WHEN OLD.status='active' AND OLD.removed_at IS NULL AND EXISTS(SELECT 1 FROM json_each(OLD.roles_json) WHERE value='admin')
 AND NOT EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE u.emailVerified=1 AND m.id!=OLD.id AND m.status='active' AND m.removed_at IS NULL AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='admin'))
BEGIN SELECT RAISE(ABORT,'Keep at least one active admin'); END;
CREATE TRIGGER membership_removed_stays_denied BEFORE UPDATE OF status,removed_at ON members
WHEN NEW.removed_at IS NOT NULL AND NEW.status!='suspended'
BEGIN SELECT RAISE(ABORT,'Restore this membership for review before approving access'); END;
CREATE TRIGGER membership_removed_insert_denied BEFORE INSERT ON members
WHEN NEW.removed_at IS NOT NULL AND NEW.status!='suspended'
BEGIN SELECT RAISE(ABORT,'Removed memberships cannot have family access'); END;
