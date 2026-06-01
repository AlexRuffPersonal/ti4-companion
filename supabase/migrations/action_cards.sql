CREATE TABLE public.action_cards (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT    NOT NULL,
  timing    TEXT,
  text      TEXT,
  type      TEXT,
  quantity  INTEGER NOT NULL DEFAULT 1,
  expansion TEXT    NOT NULL DEFAULT 'base',
  ability   JSONB
);

ALTER TABLE public.action_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_cards_select"      ON public.action_cards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "action_cards_admin_write" ON public.action_cards FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
