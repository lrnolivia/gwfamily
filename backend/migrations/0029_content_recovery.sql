-- Recoverable content removal, history paging and a reachable report queue.
-- Purely additive: no existing row, trigger, role or permission changes. Apply
-- through the established app_migrations ledger (d1 execute --file), never
-- migrations apply. Removal stays a soft delete; media objects are untouched.
CREATE TABLE content_deletions (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('memory','post','comment')),
 target_id TEXT NOT NULL,
 author_id TEXT NOT NULL REFERENCES members(id),
 actor_id TEXT NOT NULL REFERENCES members(id),
 source TEXT NOT NULL DEFAULT 'owner' CHECK(source IN ('owner','moderator','report')),
 report_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 restored_at TEXT,
 restored_by TEXT REFERENCES members(id)
);
CREATE INDEX content_deletions_target ON content_deletions(target_id,created_at);
CREATE INDEX content_deletions_open ON content_deletions(restored_at,created_at);
-- Keyset history: newest first, ties broken by id.
CREATE INDEX memories_history ON memories(deleted_at,created_at,id);
CREATE INDEX posts_history ON posts(deleted_at,created_at,id);
CREATE INDEX comments_history ON comments(post_id,deleted_at,created_at,id);
ALTER TABLE moderation_reports ADD COLUMN resolved_at TEXT;
CREATE INDEX moderation_reports_queue ON moderation_reports(status,created_at);

-- Rollback: DROP TABLE content_deletions; DROP INDEX memories_history;
-- DROP INDEX posts_history; DROP INDEX comments_history;
-- DROP INDEX moderation_reports_queue; resolved_at may stay (unused, nullable).
