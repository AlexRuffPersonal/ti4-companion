CREATE TABLE public.ability_definitions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_key       TEXT    NOT NULL UNIQUE,
  ability_name      TEXT    NOT NULL,
  trigger           JSONB   NOT NULL,
  unlock_conditions JSONB,
  effects           JSONB,
  handler           TEXT,
  exhausts_source   BOOLEAN NOT NULL DEFAULT false,
  purges_source     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT effects_or_handler CHECK (
    (effects IS NOT NULL) != (handler IS NOT NULL)
  )
);

ALTER TABLE public.ability_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ability_definitions_select" ON public.ability_definitions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ability_definitions_admin_write" ON public.ability_definitions FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
