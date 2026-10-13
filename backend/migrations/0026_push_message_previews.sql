-- Additive, explicit consent per recipient/device/session. Prior enrollment
-- promised generic text, so every existing device keeps previews OFF.
-- Apply separately through the established app_migrations ledger; no activation.
ALTER TABLE push_devices ADD COLUMN preview_enabled INTEGER NOT NULL DEFAULT 0 CHECK(preview_enabled IN(0,1));
ALTER TABLE push_devices ADD COLUMN preview_revision INTEGER NOT NULL DEFAULT 0 CHECK(preview_revision>=0);
ALTER TABLE push_devices ADD COLUMN preview_confirmed_at INTEGER;
ALTER TABLE push_devices ADD COLUMN preview_after_sequence INTEGER NOT NULL DEFAULT 0 CHECK(preview_after_sequence>=0);
-- No recipient/outbox creation, no consent changes, and no changes to 0025.
-- A code rollback keeps these columns/data; a legacy Worker stays generic.
