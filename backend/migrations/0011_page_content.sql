-- Shared-page overrides are separate from profiles, posts, menus and private data.
-- No seed rows or production content. Source code supplies revision-zero defaults.
CREATE TABLE page_content_revisions (
 page TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 mutation_id TEXT NOT NULL UNIQUE,
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 editor_id TEXT NOT NULL REFERENCES members(id),
 restored_from INTEGER CHECK(restored_from >= 0),
 created_at TEXT NOT NULL,
 PRIMARY KEY(page,revision)
);
CREATE TABLE page_content (
 page TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision > 0),
 FOREIGN KEY(page,revision) REFERENCES page_content_revisions(page,revision)
);
CREATE TABLE page_content_requests (
 member_id TEXT NOT NULL REFERENCES members(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 page TEXT NOT NULL,
 revision INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(member_id,request_id),
 FOREIGN KEY(page,revision) REFERENCES page_content_revisions(page,revision)
);
CREATE INDEX page_content_history ON page_content_revisions(page,revision DESC);
