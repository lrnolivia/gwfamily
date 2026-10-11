-- Message edit, recoverable unsend and quoted replies. Purely additive; message
-- rows, sequences and read cursors never change shape. Apply through the
-- app_migrations ledger (d1 execute --file), never migrations apply.
ALTER TABLE messages ADD COLUMN edited_at TEXT;
ALTER TABLE messages ADD COLUMN unsent_at TEXT;
ALTER TABLE messages ADD COLUMN reply_to_id TEXT REFERENCES messages(id);
-- Set on edit, unsend and restore so open chats pick the change up while polling.
ALTER TABLE messages ADD COLUMN changed_at TEXT;
CREATE INDEX messages_changed ON messages(conversation_id,changed_at) WHERE changed_at IS NOT NULL;
-- Earlier text, visible only to the message's author, for recovery and history.
CREATE TABLE message_revisions (
 id TEXT PRIMARY KEY,
 message_id TEXT NOT NULL REFERENCES messages(id),
 author_id TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('edit','unsend','restore')),
 body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX message_revisions_message ON message_revisions(message_id,created_at);

-- Rollback: DROP TABLE message_revisions; the three nullable columns may stay
-- (older builds ignore them, but would show unsent text again).
