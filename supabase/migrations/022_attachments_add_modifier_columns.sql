-- ── Attachments: add trait_modifier and ability_modifier columns ─────────────
-- trait_modifier: array of planet traits the attachment grants (e.g. ["cultural","hazardous"])
-- ability_modifier: JSONB object for unit ability overrides (e.g. {"space_cannon":"5(x3)"})
-- UI SYNC: Matches admin-import-attachments Edge Function and importSchemas.js ('attachments').

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS trait_modifier   TEXT[],
  ADD COLUMN IF NOT EXISTS ability_modifier JSONB;
