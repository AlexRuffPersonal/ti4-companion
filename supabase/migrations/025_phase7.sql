-- ── games: agenda phase columns ───────────────────────────────────────────────
ALTER TABLE public.games
  ADD COLUMN agenda_phase_step           TEXT NOT NULL DEFAULT 'inactive'
    CHECK (agenda_phase_step IN ('inactive','agenda_1_voting','agenda_1_resolved','agenda_2_voting','done')),
  ADD COLUMN agenda_current_card_id      UUID REFERENCES public.agendas(id),
  ADD COLUMN agenda_vote_current_player_id UUID REFERENCES public.game_players(id),
  ADD COLUMN current_vote_sequence       INTEGER NOT NULL DEFAULT 0;

-- ── game_player_planets: add influence + resources ───────────────────────────
-- These values are stored at game-start from tiles.planets JSONB so that
-- game-cast-votes and PlanetSelectionModal can read them without joining tiles.
ALTER TABLE public.game_player_planets
  ADD COLUMN influence  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN resources  INTEGER NOT NULL DEFAULT 0;

-- ── game_agenda_deck: tighten state constraint ────────────────────────────────
-- Table already exists (003_agenda.sql). Column is named deck_position.
ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT game_agenda_deck_state_check
    CHECK (state IN ('deck','voting','enacted','repealed','discarded'));

-- ── game_agenda_votes ─────────────────────────────────────────────────────────
CREATE TABLE public.game_agenda_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  game_player_id  UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  agenda_id       UUID NOT NULL REFERENCES public.agendas(id),
  choice          TEXT,
  vote_count      INTEGER NOT NULL DEFAULT 0,
  abstained       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, game_player_id, agenda_id)
);

-- ── game_laws ─────────────────────────────────────────────────────────────────
CREATE TABLE public.game_laws (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id           UUID NOT NULL REFERENCES public.agendas(id),
  round_enacted       INTEGER NOT NULL,
  elected_target      TEXT,
  is_repealed         BOOLEAN NOT NULL DEFAULT false,
  host_applies_manually BOOLEAN NOT NULL DEFAULT false
);

-- ── agendas: resolution metadata ─────────────────────────────────────────────
ALTER TABLE public.agendas
  ADD COLUMN tractable   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN effect_json JSONB NOT NULL DEFAULT '{}';

-- effect_json shape for tractable agendas:
--   { "op": "award_vp",      "amount": 1 }          -- award VP to elected player
--   { "op": "remove_vp",     "amount": 1 }          -- remove VP from elected player
--   { "op": "exhaust_planet"                }        -- exhaust elected planet (any player)
--   { "op": "grant_tech",    "tech": "name" }        -- grant a specific tech to elected player
--   { "op": "no_effect"                     }        -- law tracked but no DB change needed