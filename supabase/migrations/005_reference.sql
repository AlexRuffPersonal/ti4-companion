-- ── Tiles ────────────────────────────────────────────────────────────────────
-- Map system tiles: hex tiles used on the game board, including home systems, blue/red tiles, and hyperlanes.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('tiles' entry) and redeploy admin-import-tiles.
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
-- Playable factions with their starting state, abilities, flagship, mech, and faction-specific promissory notes.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('factions' entry) and redeploy admin-import-factions.
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
-- Agenda cards drawn during the Agenda Phase; may be laws (permanent) or directives (one-time).
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('agendas' entry) and redeploy admin-import-agendas.
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
-- Technology cards players can research; includes unit upgrades and faction-specific technologies.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('technologies' entry) and redeploy admin-import-technologies.
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
-- Generic unit type definitions with combat stats shared across all factions.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('units' entry) and redeploy admin-import-units.
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
-- Stage 1 and Stage 2 public objectives that all players may score.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('public-objectives' entry) and redeploy admin-import-public-objectives.
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
-- Secret objectives dealt privately to each player.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('secret-objectives' entry) and redeploy admin-import-secret-objectives.
CREATE TABLE public.secret_objectives (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  points    INTEGER NOT NULL DEFAULT 1,
  timing    TEXT,
  condition TEXT NOT NULL,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Action Cards ─────────────────────────────────────────────────────────────
-- Action cards drawn and played during the Action Phase.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('action-cards' entry) and redeploy admin-import-action-cards.
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
-- Relic cards obtained through exploration or Shard of the Throne scoring.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('relics' entry) and redeploy admin-import-relics.
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
-- Exploration cards drawn when a player explores a planet or frontier token.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('exploration-cards' entry) and redeploy admin-import-exploration-cards.
CREATE TABLE public.exploration_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  deck_type           TEXT NOT NULL,
  text                TEXT,
  quantity            INTEGER NOT NULL DEFAULT 1,
  relic_fragment_type TEXT
);

-- ── Attachments ──────────────────────────────────────────────────────────────
-- Attachment tokens placed on planets to modify their resource/influence values.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('attachments' entry) and redeploy admin-import-attachments.
CREATE TABLE public.attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  planet_trait        TEXT,
  resource_modifier   INTEGER NOT NULL DEFAULT 0,
  influence_modifier  INTEGER NOT NULL DEFAULT 0,
  text                TEXT
);

-- ── Promissory Notes ─────────────────────────────────────────────────────────
-- Generic (non-faction) promissory notes; faction-specific notes are stored on the factions table.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('promissory-notes' entry) and redeploy admin-import-promissory-notes.
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
