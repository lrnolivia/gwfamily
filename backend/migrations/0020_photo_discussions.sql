-- Additive photo conversations. Existing posts, memories and profile records
-- remain authoritative for visibility; no permissions are copied into a thread.
CREATE TABLE IF NOT EXISTS photo_comments (
 id TEXT PRIMARY KEY,
 thread_key TEXT NOT NULL,
 target_kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 photo_index INTEGER NOT NULL DEFAULT 0,
 author_id TEXT NOT NULL REFERENCES user(id),
 parent_id TEXT REFERENCES photo_comments(id),
 body TEXT NOT NULL,
 files_json TEXT NOT NULL DEFAULT '[]',
 created_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS photo_comments_thread ON photo_comments(thread_key,created_at,id);
CREATE TABLE IF NOT EXISTS photo_reactions (
 thread_key TEXT NOT NULL,
 comment_id TEXT NOT NULL DEFAULT '',
 member_id TEXT NOT NULL REFERENCES user(id),
 emoji TEXT NOT NULL,
 PRIMARY KEY(thread_key,comment_id,member_id,emoji)
);
