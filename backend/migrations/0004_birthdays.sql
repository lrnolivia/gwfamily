ALTER TABLE profiles ADD COLUMN birthday_celebration INTEGER NOT NULL DEFAULT 0 CHECK(birthday_celebration IN (0,1));
