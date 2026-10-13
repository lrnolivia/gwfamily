-- Additive migration. Do not deploy new runtime before this migration.
-- Existing current settings and original RSVP rows are preserved.
-- Undated legacy data deliberately has no inferred year: a planner names it.
CREATE TABLE reunions (
 id TEXT PRIMARY KEY,
 year INTEGER UNIQUE CHECK(year IS NULL OR year BETWEEN 1900 AND 2200),
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','archived')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX one_active_reunion ON reunions(status) WHERE status='active';
INSERT INTO reunions(id,year,name,status)
 SELECT 'legacy',CASE WHEN json_extract(data_json,'$.date') GLOB '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' AND CAST(substr(json_extract(data_json,'$.date'),1,4) AS INTEGER) BETWEEN 1900 AND 2200 THEN CAST(substr(json_extract(data_json,'$.date'),1,4) AS INTEGER) ELSE NULL END,'Existing reunion','active'
 FROM reunion_settings WHERE id='current';
INSERT OR IGNORE INTO reunions(id,year,name,status) VALUES('legacy',NULL,'Existing reunion','active');
-- The legacy reunion continues to use the current settings row. Never copy it:
-- INSERT triggers would otherwise send duplicate reunion notifications.
INSERT OR IGNORE INTO reunion_settings(id,data_json) VALUES('current','{}');
CREATE TABLE reunion_preferences(id TEXT PRIMARY KEY CHECK(id='family'),cadence TEXT NOT NULL DEFAULT 'irregular' CHECK(cadence IN ('annual','biennial','irregular')));
INSERT INTO reunion_preferences(id,cadence) VALUES('family','irregular');
CREATE TABLE reunion_rsvps(reunion_id TEXT NOT NULL REFERENCES reunions(id),member_id TEXT NOT NULL REFERENCES members(id),status TEXT NOT NULL,count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 50),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(reunion_id,member_id));
INSERT INTO reunion_rsvps(reunion_id,member_id,status,count,updated_at) SELECT 'legacy',member_id,status,count,updated_at FROM rsvps;
ALTER TABLE products ADD COLUMN reunion_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE shirt_claims ADD COLUMN reunion_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE fee_reports ADD COLUMN reunion_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX products_reunion ON products(reunion_id,active);
CREATE INDEX claims_reunion_member ON shirt_claims(reunion_id,member_id,created_at);
CREATE INDEX fees_reunion_member ON fee_reports(reunion_id,member_id,created_at);
-- A failed check aborts the entire D1 batch, including receipt and audit writes.
CREATE TABLE reunion_write_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
