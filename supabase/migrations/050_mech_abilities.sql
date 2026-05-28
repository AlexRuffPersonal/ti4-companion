-- Phase 39: Mech Unit Card Abilities
-- Adds mech-specific columns to the units reference table

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS ability_text   TEXT,
  ADD COLUMN IF NOT EXISTS effects        JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS deploy_trigger TEXT;

COMMENT ON COLUMN public.units.ability_text IS
  'Faction-specific mech card ability text (null for generic units)';

COMMENT ON COLUMN public.units.effects IS
  'DSL ops array; empty array for generic and passive-only mechs';

COMMENT ON COLUMN public.units.deploy_trigger IS
  'When this mech may be deployed: ground_combat_start | after_tech_research | after_retreat | after_produce | after_exploration; null for non-deploy mechs';
