-- ── Tiles schema update ───────────────────────────────────────────────────────
-- Removes name column; converts wormhole/anomaly to arrays; adds starts_off_board.
-- UI SYNC: Matches admin-import-tiles Edge Function and importSchemas.js ('tiles').

ALTER TABLE public.secret_objectives
  DROP COLUMN IF EXISTS points;