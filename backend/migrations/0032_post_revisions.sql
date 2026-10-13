-- Post edit revisions for stale-edit conflict checks. Purely additive; existing
-- posts start at revision 0. Apply through the app_migrations ledger.
ALTER TABLE posts ADD COLUMN edit_revision INTEGER NOT NULL DEFAULT 0 CHECK(edit_revision>=0);
-- Rollback: the column is unused by older builds and may stay.
