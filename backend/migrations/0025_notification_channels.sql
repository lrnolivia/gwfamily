-- Per-category channel choices for email and push. Only explicit "off" choices are
-- stored; a missing entry keeps the channel on, so existing members are unchanged.
-- In-app delivery keeps using categories_json, which the fanout trigger reads.
ALTER TABLE notification_settings ADD COLUMN channels_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(channels_json));
