-- Additive metadata only. Existing photo URLs/media objects stay unchanged.
-- Code rollback safely ignores these columns; keep them to preserve framing.
ALTER TABLE profiles ADD COLUMN photo_frame_json TEXT NOT NULL DEFAULT '{"x":50,"y":50,"zoom":1}' CHECK (json_valid(photo_frame_json));
ALTER TABLE households ADD COLUMN photo_frame_json TEXT NOT NULL DEFAULT '{"x":50,"y":50,"zoom":1}' CHECK (json_valid(photo_frame_json));

-- Prior API versions continue to read extension_json; only new code overlays this.
ALTER TABLE page_content_extensions ADD COLUMN presentation_v2_json TEXT CHECK (presentation_v2_json IS NULL OR json_valid(presentation_v2_json));
