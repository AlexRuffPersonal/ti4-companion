-- ── Promissory notes: drop returns_to_owner column ───────────────────────────
-- This column was dropped outside the migration system (via dashboard).
-- This migration makes the drop official so the schema history is accurate.
-- UI SYNC: Matches admin-import-promissory-notes Edge Function and importSchemas.js.

ALTER TABLE public.promissory_notes
  DROP COLUMN IF EXISTS returns_to_owner;
