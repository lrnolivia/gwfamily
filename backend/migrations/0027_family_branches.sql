-- Branches are broad surname family groups; households are smaller units that
-- may belong to several branches. Purely additive: no existing table, row,
-- trigger, membership, role or primary household changes. Apply through the
-- established app_migrations ledger (d1 execute --file), never migrations apply.
-- New tables, one seed of due prompts and one members trigger (approval only).
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

-- One-time, account-scoped prompts. A prompt shows automatically only while
-- its row says 'due'; Not now ('dismissed') and Done ('completed') stop it.
-- Manual entry points stay available regardless of status.
CREATE TABLE member_prompts (
 member_id TEXT NOT NULL REFERENCES members(id),
 prompt TEXT NOT NULL CHECK(prompt IN ('welcome','family-setup')),
 version INTEGER NOT NULL CHECK(version>=1),
 status TEXT NOT NULL CHECK(status IN ('due','dismissed','completed')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(member_id,prompt)
);
-- Existing members already know the app: offer them only the optional family
-- refinement. Members approved from now on get the welcome instead.
INSERT INTO member_prompts(member_id,prompt,version,status)
 SELECT id,'family-setup',1,'due' FROM members WHERE status='active' AND removed_at IS NULL;
CREATE TRIGGER member_welcome_due AFTER UPDATE OF status ON members
 WHEN OLD.status='pending' AND NEW.status='active' AND NEW.removed_at IS NULL
BEGIN
 INSERT OR IGNORE INTO member_prompts(member_id,prompt,version,status) VALUES(NEW.id,'welcome',1,'due');
END;
