-- Existing messages.body constraints stay intact. For attachment-only messages the
-- stored body is a bounded list of actual filenames and attachment_only=1 makes
-- the API return an empty body. No family/media ACL is reused or broadened.
ALTER TABLE messages ADD COLUMN attachment_only INTEGER NOT NULL DEFAULT 0 CHECK(attachment_only IN(0,1));
CREATE TABLE conversation_attachments(
 id TEXT PRIMARY KEY,
 conversation_id TEXT NOT NULL REFERENCES conversations(id),
 owner_id TEXT NOT NULL REFERENCES members(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE CHECK(object_key LIKE 'message-attachments/%'),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
 mime_type TEXT NOT NULL CHECK(mime_type IN('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 content_sha256 TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 cleanup_after INTEGER,
 state TEXT NOT NULL DEFAULT 'staged' CHECK(state IN('staged','ready','cancelled')),
 message_id TEXT REFERENCES messages(id),
 message_ordinal INTEGER CHECK(message_ordinal BETWEEN 0 AND 4),
 UNIQUE(owner_id,request_id),
 UNIQUE(message_id,message_ordinal),
 CHECK((message_id IS NULL AND message_ordinal IS NULL) OR (message_id IS NOT NULL AND message_ordinal IS NOT NULL AND state='ready'))
);
CREATE INDEX conversation_attachments_stage ON conversation_attachments(owner_id,state,expires_at) WHERE message_id IS NULL;
CREATE INDEX conversation_attachments_message ON conversation_attachments(message_id,message_ordinal) WHERE message_id IS NOT NULL;
CREATE INDEX conversation_attachments_cleanup ON conversation_attachments(cleanup_after,expires_at) WHERE message_id IS NULL;
-- Tombstones prevent a cancelled upload from being recreated by a delayed request.
-- Retain metadata on code rollback; these records contain no attachment bytes.
CREATE TABLE conversation_attachment_cancellations(
 owner_id TEXT NOT NULL REFERENCES members(id),
 request_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE conversation_attachment_cleanup(
 id INTEGER PRIMARY KEY CHECK(id=1),
 cursor TEXT,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO conversation_attachment_cleanup(id) VALUES(1);
-- Revert application code while retaining this additive schema and all message-
-- bound objects. Destructive rollback is deliberately not an operational command.
