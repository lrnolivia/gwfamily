-- Additive only: existing invitations, ancestors and saved page layouts survive.
ALTER TABLE family_invitations ADD COLUMN reusable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE family_invitations ADD COLUMN reusable_parent_id TEXT REFERENCES family_invitations(id);
CREATE UNIQUE INDEX family_profile_invitation_current ON family_invitations(sender_id) WHERE reusable=1 AND revoked_at IS NULL;
ALTER TABLE memorials ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE memorials ADD COLUMN source_member_id TEXT REFERENCES members(id);
CREATE UNIQUE INDEX memorial_member_identity ON memorials(source_member_id) WHERE source_member_id IS NOT NULL;
