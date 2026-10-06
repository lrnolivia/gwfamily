-- Additive: existing messages and accepted participants are preserved.
ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'group' CHECK(type IN ('direct','group'));
ALTER TABLE conversations ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN owner_id TEXT REFERENCES members(id);
ALTER TABLE conversations ADD COLUMN archived_at TEXT;
ALTER TABLE conversations ADD COLUMN direct_key TEXT;
CREATE UNIQUE INDEX conversations_direct_pair ON conversations(direct_key) WHERE direct_key IS NOT NULL AND archived_at IS NULL;
ALTER TABLE conversation_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','declined','left','removed'));
ALTER TABLE conversation_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','manager'));
ALTER TABLE conversation_members ADD COLUMN invited_by TEXT REFERENCES members(id);
ALTER TABLE conversation_members ADD COLUMN invited_at TEXT;
ALTER TABLE conversation_members ADD COLUMN joined_at TEXT;
ALTER TABLE conversation_members ADD COLUMN read_sequence INTEGER NOT NULL DEFAULT 0 CHECK(read_sequence >= 0);
ALTER TABLE messages ADD COLUMN sequence INTEGER;
UPDATE conversations SET owner_id=(SELECT member_id FROM conversation_members WHERE conversation_id=conversations.id ORDER BY member_id LIMIT 1);
UPDATE conversation_members SET joined_at=(SELECT created_at FROM conversations WHERE id=conversation_id);
WITH ordered AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY created_at,id) AS sequence FROM messages)
UPDATE messages SET sequence=(SELECT sequence FROM ordered WHERE ordered.id=messages.id);
CREATE UNIQUE INDEX messages_conversation_sequence ON messages(conversation_id,sequence);
CREATE INDEX conversation_members_inbox ON conversation_members(member_id,status,conversation_id);
CREATE TABLE messaging_requests (
 member_id TEXT NOT NULL REFERENCES members(id),
 request_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('create','send')),
 fingerprint TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(member_id,request_id,operation)
);
-- Presence carries only identity, scope, and an expiry, never draft text.
CREATE TABLE typing_presence (
 scope_kind TEXT NOT NULL CHECK(scope_kind IN ('conversation','post')),
 scope_id TEXT NOT NULL,
 member_id TEXT NOT NULL REFERENCES members(id),
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(scope_kind,scope_id,member_id)
);
CREATE INDEX typing_presence_expiry ON typing_presence(expires_at);
