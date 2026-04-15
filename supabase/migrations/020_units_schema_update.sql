-- ── Units schema update ───────────────────────────────────────────────────────
-- Renames planetary → planetary_shield; adds unit_type, production, abilities.
-- UI SYNC: Matches admin-import-units Edge Function and importSchemas.js ('units').

ALTER TABLE public.units
  RENAME COLUMN planetary TO planetary_shield;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS unit_type TEXT,
  ADD COLUMN IF NOT EXISTS production TEXT,
  ADD COLUMN IF NOT EXISTS abilities TEXT[] NOT NULL DEFAULT '{}';
