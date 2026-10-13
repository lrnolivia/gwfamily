-- Recoverable cleanup and account data requests. Purely additive. Apply
-- through the app_migrations ledger (d1 execute --file), never migrations apply.
-- Nothing here erases data; account deletion stays disabled.
ALTER TABLE memorials ADD COLUMN archived_at TEXT;
ALTER TABLE memorials ADD COLUMN archived_by TEXT REFERENCES members(id);
ALTER TABLE households ADD COLUMN archived_at TEXT;
ALTER TABLE households ADD COLUMN archived_by TEXT REFERENCES members(id);
CREATE TABLE account_requests (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('export','deletion')),
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','withdrawn')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at TEXT,
 resolved_by TEXT REFERENCES members(id)
);
-- One open request of each kind per person.
CREATE UNIQUE INDEX account_requests_open ON account_requests(member_id,kind) WHERE status='open';

-- Rollback: DROP TABLE account_requests; archived_* columns may stay (older
-- builds ignore them and would show archived memorials and households again).
