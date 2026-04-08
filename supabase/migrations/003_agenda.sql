-- ── Game Agenda Deck ─────────────────────────────────────────────────────────
CREATE TABLE public.game_agenda_deck (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id     UUID NOT NULL,                       -- FK added in 005_reference.sql
  deck_position INTEGER,
  state         TEXT NOT NULL DEFAULT 'deck'
);

-- ── Game Votes ───────────────────────────────────────────────────────────────
CREATE TABLE public.game_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id  UUID NOT NULL,
  player_id  UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  choice     TEXT NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, agenda_id, player_id, round)
);
