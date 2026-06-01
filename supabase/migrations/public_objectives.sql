CREATE TABLE public.public_objectives (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  stage           INTEGER NOT NULL,
  condition       TEXT    NOT NULL,
  expansion       TEXT    NOT NULL DEFAULT 'base',
  condition_check JSONB
);

ALTER TABLE public.public_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_objectives_select"      ON public.public_objectives FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "public_objectives_admin_write" ON public.public_objectives FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
