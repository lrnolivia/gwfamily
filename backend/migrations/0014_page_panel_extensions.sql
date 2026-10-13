-- DRAFT: prepare/review only; not applied by this task.
-- Additive extension metadata leaves legacy page_content_revisions.content_json
-- readable by the preceding API. No backfill and no change to published pointers.
CREATE TABLE page_content_extensions (
  page TEXT NOT NULL,
  revision INTEGER NOT NULL,
  extension_json TEXT NOT NULL CHECK (json_valid(extension_json)),
  PRIMARY KEY (page, revision),
  FOREIGN KEY (page, revision) REFERENCES page_content_revisions(page, revision) ON DELETE CASCADE
);
