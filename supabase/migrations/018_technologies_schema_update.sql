-- ── Tiles schema update ───────────────────────────────────────────────────────
-- Removes name column; converts wormhole/anomaly to arrays; adds starts_off_board.
-- UI SYNC: Matches admin-import-tiles Edge Function and importSchemas.js ('tiles').

ALTER TABLE public.technologies
  DROP COLUMN IF EXISTS colour,
  DROP COLUMN IF EXISTS is_unit_upgrade,
  DROP COLUMN IF EXISTS unit_stats,
  ADD COLUMN IF NOT EXISTS technology_type TEXT NOT NULL;