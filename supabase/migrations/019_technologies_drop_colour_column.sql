-- ── Technologies: drop old colour column ──────────────────────────────────────
-- 018 attempted to drop 'colours' (plural) but the actual column is 'colour'.
-- UI SYNC: Matches admin-import-technologies Edge Function and importSchemas.js.

ALTER TABLE public.technologies
  DROP COLUMN IF EXISTS colour;
