-- ── Tiles ────────────────────────────────────────────────────────────────────
CREATE TABLE public.tiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_number TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  expansion   TEXT NOT NULL DEFAULT 'base',
  planets     JSONB NOT NULL DEFAULT '[]',
  anomaly     TEXT,
  wormhole    TEXT
);

-- ── Factions ─────────────────────────────────────────────────────────────────
CREATE TABLE public.factions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  expansion        TEXT NOT NULL DEFAULT 'base',
  starting_techs   TEXT[] NOT NULL DEFAULT '{}',
  home_tile_number TEXT,
  commodities      INTEGER NOT NULL DEFAULT 3,
  abilities        JSONB NOT NULL DEFAULT '[]',
  flagship         JSONB,
  mech             JSONB,
  promissory_notes JSONB NOT NULL DEFAULT '[]'
);

-- ── Agendas ──────────────────────────────────────────────────────────────────
CREATE TABLE public.agendas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,
  outcome   TEXT NOT NULL,
  elect_type TEXT,
  expansion TEXT NOT NULL DEFAULT 'base',
  note      TEXT
);

-- ── Technologies ─────────────────────────────────────────────────────────────
CREATE TABLE public.technologies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  colour         TEXT NOT NULL,
  prerequisites  JSONB NOT NULL DEFAULT '{}',
  text           TEXT,
  is_unit_upgrade BOOLEAN NOT NULL DEFAULT false,
  unit_stats     JSONB,
  faction        TEXT,
  expansion      TEXT NOT NULL DEFAULT 'base'
);

-- ── Units ────────────────────────────────────────────────────────────────────
CREATE TABLE public.units (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  cost           NUMERIC,
  combat         TEXT,
  move           INTEGER,
  capacity       INTEGER,
  sustain_damage BOOLEAN NOT NULL DEFAULT false,
  bombardment    TEXT,
  afb            TEXT,
  space_cannon   TEXT,
  planetary      BOOLEAN NOT NULL DEFAULT false
);

-- ── Public Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.public_objectives (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  stage     INTEGER NOT NULL,
  points    INTEGER NOT NULL DEFAULT 1,
  condition TEXT NOT NULL,
  category  TEXT,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Secret Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.secret_objectives (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  points    INTEGER NOT NULL DEFAULT 1,
  timing    TEXT,
  condition TEXT NOT NULL,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Action Cards ─────────────────────────────────────────────────────────────
CREATE TABLE public.action_cards (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  timing    TEXT,
  text      TEXT,
  type      TEXT,
  quantity  INTEGER NOT NULL DEFAULT 1,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Relics ───────────────────────────────────────────────────────────────────
CREATE TABLE public.relics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  text         TEXT,
  exhaustable  BOOLEAN NOT NULL DEFAULT false,
  transferable BOOLEAN NOT NULL DEFAULT true,
  vp_bearing   BOOLEAN NOT NULL DEFAULT false,
  purge_on_use BOOLEAN NOT NULL DEFAULT false
);

-- ── Exploration Cards ────────────────────────────────────────────────────────
CREATE TABLE public.exploration_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  deck_type           TEXT NOT NULL,
  text                TEXT,
  quantity            INTEGER NOT NULL DEFAULT 1,
  relic_fragment_type TEXT
);

-- ── Attachments ──────────────────────────────────────────────────────────────
CREATE TABLE public.attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  planet_trait        TEXT,
  resource_modifier   INTEGER NOT NULL DEFAULT 0,
  influence_modifier  INTEGER NOT NULL DEFAULT 0,
  text                TEXT
);

-- ── Promissory Notes ─────────────────────────────────────────────────────────
CREATE TABLE public.promissory_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  faction         TEXT,
  text            TEXT,
  returns_to_owner BOOLEAN NOT NULL DEFAULT false,
  purge_on_use    BOOLEAN NOT NULL DEFAULT false,
  expansion       TEXT NOT NULL DEFAULT 'base'
);

-- ── Foreign Key Back-Fills ───────────────────────────────────────────────────
ALTER TABLE public.game_laws
  ADD CONSTRAINT fk_game_laws_agenda
  FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT fk_agenda_deck_agenda
  FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

ALTER TABLE public.game_system_state
  ADD CONSTRAINT fk_system_state_tile
  FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_planets_tile
  FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_units_type
  FOREIGN KEY (unit_type_id) REFERENCES public.units(id);

ALTER TABLE public.game_public_objectives
  ADD CONSTRAINT fk_public_objectives_ref
  FOREIGN KEY (objective_id) REFERENCES public.public_objectives(id);

ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_secret_objectives_ref
  FOREIGN KEY (objective_id) REFERENCES public.secret_objectives(id);

ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_action_card_deck_ref
  FOREIGN KEY (action_card_id) REFERENCES public.action_cards(id);

ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_relic_deck_ref
  FOREIGN KEY (relic_id) REFERENCES public.relics(id);

ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_exploration_deck_ref
  FOREIGN KEY (card_id) REFERENCES public.exploration_cards(id);

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_promissory_notes_ref
  FOREIGN KEY (note_id) REFERENCES public.promissory_notes(id);
