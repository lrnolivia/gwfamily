CREATE TABLE featured_memories(memory_id TEXT PRIMARY KEY REFERENCES memories(id),media_url TEXT NOT NULL,approved_by TEXT NOT NULL REFERENCES members(id),is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX featured_memories_one_primary ON featured_memories(is_primary) WHERE is_primary=1;
