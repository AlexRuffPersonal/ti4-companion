-- ── Ability Definitions ───────────────────────────────────────────────────────
-- Each row is one distinct ability. Cards that share an ability share a row.
-- UI SYNC: If you change columns, update importSchemas.js ('ability-definitions') and redeploy admin-import-ability-definitions.
CREATE TABLE public.ability_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_key       TEXT NOT NULL UNIQUE,   -- human-readable slug for cross-table linking
  ability_name      TEXT NOT NULL,
  trigger           JSONB NOT NULL,
  unlock_conditions JSONB,                  -- commanders only
  effects           JSONB,                  -- composable DSL ops (mutually exclusive with handler)
  handler           TEXT,                   -- named escape hatch (mutually exclusive with effects)
  exhausts_source   BOOLEAN NOT NULL DEFAULT false,
  purges_source     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT effects_or_handler CHECK (
    (effects IS NOT NULL) != (handler IS NOT NULL)
  )
);

-- ── Ability Sources ───────────────────────────────────────────────────────────
-- M2M: one ability can be shared by many cards; one card can have many abilities.
-- UI SYNC: If you change columns, update importSchemas.js ('ability-sources') and redeploy admin-import-ability-sources.
CREATE TABLE public.ability_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_id   UUID NOT NULL REFERENCES public.ability_definitions(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL CHECK (source_type IN (
    'action_card', 'leader', 'relic', 'faction_ability',
    'promissory_note', 'exploration_card', 'technology'
  )),
  source_id    UUID,        -- null when source_type = 'faction_ability'
  faction_name TEXT         -- set when source_type = 'faction_ability'
);

-- Two partial unique indexes replace a single UNIQUE constraint because
-- PostgreSQL treats NULLs as distinct in UNIQUE constraints, which would
-- allow duplicate faction_ability rows.
CREATE UNIQUE INDEX ability_sources_by_card
  ON public.ability_sources (ability_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX ability_sources_by_faction
  ON public.ability_sources (ability_id, source_type, faction_name)
  WHERE faction_name IS NOT NULL;
