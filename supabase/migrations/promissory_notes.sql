CREATE TABLE public.promissory_notes (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,
  faction        TEXT,
  text           TEXT,
  purge_on_use   BOOLEAN NOT NULL DEFAULT false,
  expansion      TEXT    NOT NULL DEFAULT 'base',
  into_play_area BOOLEAN
);

ALTER TABLE public.promissory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promissory_notes_select"      ON public.promissory_notes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "promissory_notes_admin_write" ON public.promissory_notes FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
