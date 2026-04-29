ALTER TABLE game_combats
  ADD COLUMN barrage_attacker_dice JSONB,
  ADD COLUMN barrage_defender_dice JSONB,
  ADD COLUMN barrage_attacker_hits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN barrage_defender_hits INTEGER NOT NULL DEFAULT 0;
