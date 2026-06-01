CREATE TABLE public.attachments (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT    NOT NULL,
  tech_specialty     TEXT,
  resource_modifier  INTEGER NOT NULL DEFAULT 0,
  influence_modifier INTEGER NOT NULL DEFAULT 0,
  text               TEXT,
  trait_modifier     TEXT[],
  ability_modifier   JSONB
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_select"      ON public.attachments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attachments_admin_write" ON public.attachments FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
