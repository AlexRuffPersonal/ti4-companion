-- ── Tiles schema update ───────────────────────────────────────────────────────
-- Removes name column; converts wormhole/anomaly to arrays; adds starts_off_board.
-- UI SYNC: Matches admin-import-tiles Edge Function and importSchemas.js ('tiles').

ALTER TABLE public.tiles
  DROP COLUMN IF EXISTS name,
  ADD COLUMN IF NOT EXISTS wormholes  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS anomalies  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS starts_off_board BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing single-value columns into the new array columns, then drop them.
UPDATE public.tiles SET wormholes = ARRAY[wormhole] WHERE wormhole IS NOT NULL;
UPDATE public.tiles SET anomalies = ARRAY[anomaly]  WHERE anomaly  IS NOT NULL;

ALTER TABLE public.tiles
  DROP COLUMN IF EXISTS wormhole,
  DROP COLUMN IF EXISTS anomaly;
