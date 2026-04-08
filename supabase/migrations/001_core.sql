-- ── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     TEXT,
  preferred_colour TEXT,
  is_admin         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on first login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Games ───────────────────────────────────────────────────────────────────
CREATE TABLE public.games (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  host_user_id        UUID NOT NULL REFERENCES public.profiles(user_id),
  phase               TEXT NOT NULL DEFAULT 'strategy',
  round               INTEGER NOT NULL DEFAULT 1,
  vp_goal             INTEGER NOT NULL DEFAULT 10,
  speaker_player_id   UUID,                          -- FK added after game_players created
  custodians_claimed  BOOLEAN NOT NULL DEFAULT false,
  agenda_unlocked     BOOLEAN NOT NULL DEFAULT false,
  permissions_mode    TEXT NOT NULL DEFAULT 'host',
  expansions          JSONB NOT NULL DEFAULT '{"base":true,"pok":true,"te":true}',
  galactic_event      TEXT,
  map_layout          TEXT NOT NULL DEFAULT 'standard-6',
  map_tiles           JSONB NOT NULL DEFAULT '{}',
  the_fracture_in_play BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ
);

-- ── Game Players ─────────────────────────────────────────────────────────────
CREATE TABLE public.game_players (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES public.profiles(user_id),
  display_name          TEXT NOT NULL,
  faction               TEXT,
  colour                TEXT NOT NULL DEFAULT 'blue',
  seat_index            INTEGER NOT NULL,
  vp                    INTEGER NOT NULL DEFAULT 0,
  strategy_card         INTEGER,
  strategy_card_2       INTEGER,
  passed                BOOLEAN NOT NULL DEFAULT false,
  command_tokens        JSONB NOT NULL DEFAULT '{"tactic_total":3,"fleet":3,"strategy":2}',
  tokens_lost_to_mahact INTEGER NOT NULL DEFAULT 0,
  tokens_captured_from  JSONB NOT NULL DEFAULT '{}',
  commodities           INTEGER NOT NULL DEFAULT 3,
  trade_goods           INTEGER NOT NULL DEFAULT 0,
  relic_fragments       JSONB NOT NULL DEFAULT '{"cultural":0,"industrial":0,"hazardous":0,"frontier":0}',
  technologies          TEXT[] NOT NULL DEFAULT '{}',
  leaders               JSONB NOT NULL DEFAULT '{"agent":"unlocked","commander":"locked","hero":"locked"}',
  breakthrough          BOOLEAN NOT NULL DEFAULT false,
  can_edit_all          BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT max_command_tokens CHECK (
    (command_tokens->>'tactic_total')::int +
    (command_tokens->>'fleet')::int +
    (command_tokens->>'strategy')::int <= 16
  ),
  UNIQUE (game_id, seat_index)
);

-- Add FK from games back to game_players for speaker
ALTER TABLE public.games
  ADD CONSTRAINT fk_speaker_player
  FOREIGN KEY (speaker_player_id)
  REFERENCES public.game_players(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ── Game Laws ────────────────────────────────────────────────────────────────
CREATE TABLE public.game_laws (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id        UUID NOT NULL,                    -- FK to agendas added in 005_reference.sql
  enacted_at_round INTEGER NOT NULL,
  elect_target     TEXT,
  repealed         BOOLEAN NOT NULL DEFAULT false
);
