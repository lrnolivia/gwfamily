-- Household founder transfer with consent, scoped admin recovery and history.
-- Purely additive. Apply through the app_migrations ledger (d1 execute --file),
-- never migrations apply. No existing household, head or founder changes here.
CREATE TABLE household_founder_transfers (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 from_id TEXT REFERENCES members(id),
 to_id TEXT NOT NULL REFERENCES members(id),
 initiated_by TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('transfer','recovery')),
 reason TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at TEXT
);
-- One open transfer per household at a time.
CREATE UNIQUE INDEX household_founder_transfers_open ON household_founder_transfers(household_id) WHERE status='pending';
CREATE TABLE household_role_log (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 actor_id TEXT NOT NULL REFERENCES members(id),
 member_id TEXT REFERENCES members(id),
 action TEXT NOT NULL,
 detail_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX household_role_log_household ON household_role_log(household_id,created_at);

-- Rollback: DROP TABLE household_role_log; DROP TABLE household_founder_transfers;
-- founder_id values changed by accepted transfers stay (they are the record).
