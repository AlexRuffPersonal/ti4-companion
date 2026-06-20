-- Create leaders reference table (defined in leaders.sql but never applied to live DB)
CREATE TABLE IF NOT EXISTS public.leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  leader_type     TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction         TEXT NOT NULL,
  text            TEXT,
  unlock_criteria TEXT
);

ALTER TABLE public.leaders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leaders' AND policyname = 'leaders_select'
  ) THEN
    CREATE POLICY "leaders_select" ON public.leaders FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leaders' AND policyname = 'leaders_admin_write'
  ) THEN
    CREATE POLICY "leaders_admin_write" ON public.leaders FOR ALL
      USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
      WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Add faction column to units (in units.sql but missing from live DB)
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS faction TEXT;
