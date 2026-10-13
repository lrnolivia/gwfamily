-- Candidate only. Apply only through a separately approved release.
-- Invitation attribution never grants membership or roles.
CREATE TABLE family_invitations (
 id TEXT PRIMARY KEY,
 sender_id TEXT NOT NULL REFERENCES members(id),
 recipient_email TEXT,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,
 accepted_by TEXT REFERENCES members(id),
 accepted_at INTEGER,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX family_invitations_recipient ON family_invitations(accepted_by);
