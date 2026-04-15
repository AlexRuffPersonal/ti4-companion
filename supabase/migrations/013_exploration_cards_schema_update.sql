-- ── Tiles schema update ───────────────────────────────────────────────────────
-- Removes name column; converts wormhole/anomaly to arrays; adds starts_off_board.
-- UI SYNC: Matches admin-import-tiles Edge Function and importSchemas.js ('tiles').

ALTER TABLE public.exploration_cards
--  DROP COLUMN IF EXISTS planet_trait,
  ADD COLUMN IF NOT EXISTS has_attachment BOOLEAN NOT NULL,
  ADD COLUMN IF NOT EXISTS purge BOOLEAN NOT NULL;
