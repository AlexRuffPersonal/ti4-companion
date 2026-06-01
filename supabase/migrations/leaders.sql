CREATE TABLE public.leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  leader_type     TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction         TEXT NOT NULL,
  text            TEXT,
  unlock_criteria TEXT
);

ALTER TABLE public.leaders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaders_select" ON public.leaders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "leaders_admin_write" ON public.leaders FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
