-- Phase 16: Leaders & Mechs

CREATE TABLE IF NOT EXISTS public.leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  leader_type     TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction         TEXT NOT NULL,
  text            TEXT,
  unlock_criteria TEXT
);

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS faction TEXT;
