-- Branches are broad surname family groups; households are smaller units that
-- may belong to several branches. Purely additive: no existing table, row,
-- trigger, membership, role or primary household changes. Apply through the
-- established app_migrations ledger (d1 execute --file), never migrations apply.
-- A branch grants no access, kinship or household headship by itself.
CREATE TABLE branches (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 -- Normalized name ("the", "branch"/"family" and punctuation removed); one
 -- branch per name so members choose the existing one instead of duplicating.
 name_key TEXT NOT NULL UNIQUE CHECK(length(name_key) BETWEEN 1 AND 80),
 created_by TEXT NOT NULL REFERENCES members(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE branch_households (
 branch_id TEXT NOT NULL REFERENCES branches(id),
 household_id TEXT NOT NULL REFERENCES households(id),
 attached_by TEXT NOT NULL REFERENCES members(id),
 attached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(branch_id,household_id)
);
CREATE INDEX branch_households_by_household ON branch_households(household_id);
-- Rollback: a legacy Worker never reads these tables; data stays in place.
