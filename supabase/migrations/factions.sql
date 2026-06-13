CREATE TABLE public.factions (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT    NOT NULL UNIQUE,
  expansion             TEXT    NOT NULL DEFAULT 'base',
  starting_techs        TEXT[]  NOT NULL DEFAULT '{}',
  home_tile_number      TEXT,
  commodities           INTEGER NOT NULL DEFAULT 3,
  abilities             JSONB   NOT NULL DEFAULT '[]',
  num_of_starting_techs INTEGER,
  starting_units        JSON    NOT NULL,
  overridden_units      TEXT[]
);

ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "factions_select"      ON public.factions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "factions_admin_write" ON public.factions FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
