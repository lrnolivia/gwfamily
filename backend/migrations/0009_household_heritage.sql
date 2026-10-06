-- Keep commemorative lineage separate from accounts, household membership and permissions.
CREATE TABLE household_heritage (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 person_id TEXT NOT NULL,
 person_kind TEXT NOT NULL CHECK(person_kind IN ('ancestor','member')),
 role TEXT NOT NULL CHECK(role IN ('ancestral-head','torch-bearer')),
 title TEXT NOT NULL CHECK(title IN ('Ancestral head','Torch bearer','Matriarch','Patriarch')),
 updated_by TEXT NOT NULL REFERENCES members(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(household_id,person_id,role),
 CHECK((role='ancestral-head' AND person_kind='ancestor' AND title!='Torch bearer') OR (role='torch-bearer' AND person_kind='member' AND title!='Ancestral head'))
);
CREATE INDEX household_heritage_household ON household_heritage(household_id);
-- Earlier versions did not distinguish a default green from a chosen color.
-- Preserve non-default colors; old default green inherits until explicitly chosen.
ALTER TABLE households ADD COLUMN color_mode TEXT NOT NULL DEFAULT 'inherit' CHECK(color_mode IN ('inherit','custom'));
UPDATE households SET color_mode='custom' WHERE lower(color)!='#4f996c';
