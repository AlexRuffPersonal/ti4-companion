CREATE TABLE public.units (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT    NOT NULL UNIQUE,
  cost             NUMERIC,
  combat           TEXT,
  move             INTEGER,
  capacity         INTEGER,
  sustain_damage   BOOLEAN NOT NULL DEFAULT false,
  bombardment      TEXT,
  afb              TEXT,
  space_cannon     TEXT,
  planetary_shield BOOLEAN NOT NULL DEFAULT false,
  unit_type        TEXT,
  production       TEXT,
  abilities        TEXT[]  NOT NULL DEFAULT '{}',
  faction          TEXT,
  ability_text     TEXT,
  effects          JSONB   NOT NULL DEFAULT '[]',
  deploy_trigger   TEXT
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_select"      ON public.units FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "units_admin_write" ON public.units FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
