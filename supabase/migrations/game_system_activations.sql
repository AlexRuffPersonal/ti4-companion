CREATE TABLE public.game_system_activations (
  id                                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                             UUID    NOT NULL,
  player_id                           UUID    NOT NULL,
  system_key                          TEXT    NOT NULL,
  round                               INTEGER NOT NULL,
  token_owner_id                      UUID,
  bombardment_done                    BOOLEAN NOT NULL DEFAULT false,
  movement_blocked_player_id          UUID,
  faction_abilities_blocked_player_id UUID,
  gravity_rift_immune_player_id       UUID,
  UNIQUE (game_id, player_id, system_key, round)
);

ALTER TABLE public.game_system_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_system_activations_select" ON public.game_system_activations FOR SELECT USING (auth.role() = 'authenticated');
