CREATE TABLE public.agendas (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT    NOT NULL,
  type                        TEXT    NOT NULL,
  outcome                     TEXT    NOT NULL,
  elect_type                  TEXT,
  expansion                   TEXT    NOT NULL DEFAULT 'base',
  effect                      TEXT    NOT NULL,
  reject_effect               TEXT,
  remove_if_expansion_in_play TEXT,
  tractable                   BOOLEAN NOT NULL DEFAULT false,
  effect_json                 JSONB   NOT NULL DEFAULT '{}'
);

ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agendas_select"      ON public.agendas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "agendas_admin_write" ON public.agendas FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
