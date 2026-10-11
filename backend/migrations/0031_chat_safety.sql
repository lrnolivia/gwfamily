-- Participant blocks and intentional private-message reports. Purely additive.
-- Apply through the app_migrations ledger (d1 execute --file), never migrations
-- apply. Reports keep only the messages the reporter chose; moderators never
-- gain conversation access.
CREATE TABLE member_blocks (
 blocker_id TEXT NOT NULL REFERENCES members(id),
 blocked_id TEXT NOT NULL REFERENCES members(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(blocker_id,blocked_id),
 CHECK(blocker_id!=blocked_id)
);
CREATE INDEX member_blocks_blocked ON member_blocks(blocked_id,blocker_id);
CREATE TABLE message_reports (
 id TEXT PRIMARY KEY,
 reporter_id TEXT NOT NULL REFERENCES members(id),
 request_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id),
 -- Snapshot of only the chosen messages: author, text, file names, time.
 messages_json TEXT NOT NULL,
 reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','handled','dismissed')),
 resolved_by TEXT REFERENCES members(id),
 resolved_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(reporter_id,request_id)
);
CREATE INDEX message_reports_queue ON message_reports(status,created_at);

-- Rollback: DROP TABLE message_reports; DROP TABLE member_blocks;
