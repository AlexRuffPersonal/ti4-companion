CREATE TABLE public.exploration_cards (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT    NOT NULL,
  deck_type           TEXT    NOT NULL,
  text                TEXT,
  quantity            INTEGER NOT NULL DEFAULT 1,
  relic_fragment_type TEXT,
  has_attachment      BOOLEAN NOT NULL,
  purge               BOOLEAN NOT NULL
);

ALTER TABLE public.exploration_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exploration_cards_select"      ON public.exploration_cards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "exploration_cards_admin_write" ON public.exploration_cards FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
