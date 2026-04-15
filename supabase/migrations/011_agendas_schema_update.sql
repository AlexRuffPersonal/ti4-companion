-- ── Tiles schema update ───────────────────────────────────────────────────────
-- Removes name column; converts wormhole/anomaly to arrays; adds starts_off_board.
-- UI SYNC: Matches admin-import-tiles Edge Function and importSchemas.js ('tiles').

ALTER TABLE public.agendas
  DROP COLUMN IF EXISTS note,
  ADD COLUMN IF NOT EXISTS effect TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS reject_effect TEXT,
  ADD COLUMN IF NOT EXISTS remove_if_expansion_in_play TEXT;
