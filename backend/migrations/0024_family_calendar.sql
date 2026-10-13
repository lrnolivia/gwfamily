-- Separate family-wide events; no profile birthdays or reunion records change.
CREATE TABLE family_calendar_events(
 id TEXT PRIMARY KEY,
 created_by TEXT NOT NULL REFERENCES members(id),
 data_json TEXT NOT NULL CHECK(json_valid(data_json)),
 revision INTEGER NOT NULL DEFAULT 1,
 deleted_at TEXT,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX family_calendar_active ON family_calendar_events(deleted_at,updated_at);
