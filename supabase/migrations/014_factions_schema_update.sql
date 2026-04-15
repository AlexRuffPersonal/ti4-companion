-- ── Tiles schema update ───────────────────────────────────────────────────────
-- Removes name column; converts wormhole/anomaly to arrays; adds starts_off_board.
-- UI SYNC: Matches admin-import-tiles Edge Function and importSchemas.js ('tiles').

ALTER TABLE public.factions
  DROP COLUMN IF EXISTS planet_trait,
  DROP COLUMN IF EXISTS home_tile_number,
  DROP COLUMN IF EXISTS flagship,
  DROP COLUMN IF EXISTS mech,
  DROP COLUMN IF EXISTS promissory_notes,
  ADD COLUMN IF NOT EXISTS num_of_starting_techs INTEGER,
  ADD COLUMN IF NOT EXISTS starting_units JSON NOT NULL,
  ADD COLUMN IF NOT EXISTS overridden_units TEXT ARRAY;