CREATE TABLE public.ability_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_id        UUID NOT NULL REFERENCES public.ability_definitions(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL CHECK (source_type IN (
    'action_card', 'leader', 'relic', 'faction_ability',
    'promissory_note', 'exploration_card', 'technology', 'strategy_card'
  )),
  source_id         UUID,
  faction_name      TEXT,
  strategy_card_num INTEGER
);

CREATE UNIQUE INDEX ability_sources_by_card
  ON public.ability_sources (ability_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX ability_sources_by_faction
  ON public.ability_sources (ability_id, source_type, faction_name)
  WHERE faction_name IS NOT NULL;

ALTER TABLE public.ability_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ability_sources_select" ON public.ability_sources FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ability_sources_admin_write" ON public.ability_sources FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
