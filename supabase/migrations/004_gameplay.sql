-- ── Public Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.game_public_objectives (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  objective_id     UUID NOT NULL,                    -- FK added in 005_reference.sql
  revealed_at_round INTEGER,
  scored_by        UUID[] NOT NULL DEFAULT '{}'
);

-- ── Secret Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.game_player_secret_objectives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  objective_id    UUID NOT NULL,
  state           TEXT NOT NULL DEFAULT 'held',
  scored_at_round INTEGER
);

-- ── Action Card Deck ─────────────────────────────────────────────────────────
CREATE TABLE public.game_action_card_deck (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  action_card_id      UUID NOT NULL,
  copy_index          INTEGER NOT NULL DEFAULT 0,
  deck_position       INTEGER,
  state               TEXT NOT NULL DEFAULT 'deck',
  held_by_player_id   UUID REFERENCES public.game_players(id)
);

-- ── Relic Deck ───────────────────────────────────────────────────────────────
CREATE TABLE public.game_relic_deck (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  relic_id          UUID NOT NULL,
  state             TEXT NOT NULL DEFAULT 'deck',
  held_by_player_id UUID REFERENCES public.game_players(id)
);

-- ── Exploration Decks ────────────────────────────────────────────────────────
CREATE TABLE public.game_exploration_decks (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  card_id                  UUID NOT NULL,
  deck_type                TEXT NOT NULL,
  deck_position            INTEGER,
  state                    TEXT NOT NULL DEFAULT 'deck',
  resolved_by_player_id    UUID REFERENCES public.game_players(id)
);

-- ── Promissory Notes ─────────────────────────────────────────────────────────
CREATE TABLE public.game_player_promissory_notes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  note_id            UUID NOT NULL,
  origin_player_id   UUID NOT NULL REFERENCES public.game_players(id),
  held_by_player_id  UUID NOT NULL REFERENCES public.game_players(id),
  state              TEXT NOT NULL DEFAULT 'held'
);

-- ── Planets ──────────────────────────────────────────────────────────────────
CREATE TABLE public.game_player_planets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id        UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  planet_name      TEXT NOT NULL,
  tile_id          UUID,
  exhausted        BOOLEAN NOT NULL DEFAULT false,
  has_space_dock   BOOLEAN NOT NULL DEFAULT false,
  has_pds          BOOLEAN NOT NULL DEFAULT false,
  has_sleeper      BOOLEAN NOT NULL DEFAULT false,
  planet_destroyed BOOLEAN NOT NULL DEFAULT false,
  attachments      UUID[] NOT NULL DEFAULT '{}',
  UNIQUE (game_id, player_id, planet_name)
);

-- ── Units ────────────────────────────────────────────────────────────────────
CREATE TABLE public.game_player_units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  system_key    TEXT NOT NULL,
  unit_type_id  UUID NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  damaged_count INTEGER NOT NULL DEFAULT 0,
  on_planet     TEXT
);

-- ── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE public.game_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  from_player_id UUID NOT NULL REFERENCES public.game_players(id),
  to_player_id   UUID NOT NULL REFERENCES public.game_players(id),
  items          JSONB NOT NULL DEFAULT '{}',
  round          INTEGER NOT NULL,
  phase          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Events ───────────────────────────────────────────────────────────────────
CREATE TABLE public.game_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id  UUID REFERENCES public.game_players(id),
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  round      INTEGER NOT NULL,
  phase      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
