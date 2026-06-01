CREATE TABLE public.technologies (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  prerequisites   JSONB   NOT NULL DEFAULT '{}',
  text            TEXT,
  faction         TEXT,
  expansion       TEXT    NOT NULL DEFAULT 'base',
  technology_type TEXT    NOT NULL
);

ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "technologies_select"      ON public.technologies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "technologies_admin_write" ON public.technologies FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
