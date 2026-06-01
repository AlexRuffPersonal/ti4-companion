CREATE TABLE public.relics (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL,
  text         TEXT,
  exhaustable  BOOLEAN NOT NULL DEFAULT false,
  transferable BOOLEAN NOT NULL DEFAULT true,
  vp_bearing   BOOLEAN NOT NULL DEFAULT false,
  purge_on_use BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.relics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relics_select"      ON public.relics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "relics_admin_write" ON public.relics FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
