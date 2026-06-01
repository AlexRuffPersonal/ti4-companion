CREATE TABLE public.game_players (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID        NOT NULL,
  user_id                  UUID,
  display_name             TEXT        NOT NULL,
  faction                  TEXT,
  colour                   TEXT        NOT NULL DEFAULT 'blue',
  seat_index               INTEGER     NOT NULL,
  vp                       INTEGER     NOT NULL DEFAULT 0,
  strategy_card            INTEGER,
  strategy_card_2          INTEGER,
  passed                   BOOLEAN     NOT NULL DEFAULT false,
  command_tokens           JSONB       NOT NULL DEFAULT '{"tactic_total":3,"fleet":3,"strategy":2}',
  tokens_lost_to_mahact    INTEGER     NOT NULL DEFAULT 0,
  tokens_captured_from     JSONB       NOT NULL DEFAULT '{}',
  commodities              INTEGER     NOT NULL DEFAULT 3,
  trade_goods              INTEGER     NOT NULL DEFAULT 0,
  relic_fragments          JSONB       NOT NULL DEFAULT '{"cultural":0,"industrial":0,"hazardous":0,"frontier":0}',
  technologies             TEXT[]      NOT NULL DEFAULT '{}',
  leaders                  JSONB       NOT NULL DEFAULT '{"agent":"unlocked","commander":"locked","hero":"locked"}',
  breakthrough             BOOLEAN     NOT NULL DEFAULT false,
  can_edit_all             BOOLEAN     NOT NULL DEFAULT false,
  action_card_count        INTEGER     NOT NULL DEFAULT 0,
  secrets_selected         BOOLEAN     NOT NULL DEFAULT false,
  tokens_redistributed     BOOLEAN     NOT NULL DEFAULT true,
  secret_objective_count   INTEGER     NOT NULL DEFAULT 0,
  vote_prevented           BOOLEAN     NOT NULL DEFAULT false,
  production_bonus         INTEGER     NOT NULL DEFAULT 0,
  eliminated               BOOLEAN     NOT NULL DEFAULT false,
  is_bot                   BOOLEAN     NOT NULL DEFAULT false,
  bot_strategy             TEXT        CHECK (bot_strategy IN ('random', 'scripted')),
  exhausted_technologies   TEXT[]      NOT NULL DEFAULT '{}',
  second_action_available  BOOLEAN     NOT NULL DEFAULT false,
  minister_of_war_unlocked BOOLEAN     NOT NULL DEFAULT false,
  commander_flags          JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT max_command_tokens CHECK (
    (command_tokens->>'tactic_total')::int +
    (command_tokens->>'fleet')::int +
    (command_tokens->>'strategy')::int <= 16
  ),
  UNIQUE (game_id, seat_index)
);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_players_select" ON public.game_players FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_players_update" ON public.game_players FOR UPDATE USING (
  auth.uid() = user_id OR
  (SELECT can_edit_all FROM public.game_players gp2
   WHERE gp2.user_id = auth.uid() AND gp2.game_id = game_players.game_id LIMIT 1)
);
