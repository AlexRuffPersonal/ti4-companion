ALTER TABLE game_combats
  ADD COLUMN combat_type TEXT NOT NULL DEFAULT 'space',
  ADD COLUMN planet_name TEXT NULL;
