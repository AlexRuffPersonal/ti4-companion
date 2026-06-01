CREATE TABLE public.secret_objectives (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  timing          TEXT,
  condition       TEXT    NOT NULL,
  expansion       TEXT    NOT NULL DEFAULT 'base',
  condition_check JSONB
);

ALTER TABLE public.secret_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secret_objectives_select"      ON public.secret_objectives FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "secret_objectives_admin_write" ON public.secret_objectives FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
