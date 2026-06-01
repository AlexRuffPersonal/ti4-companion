-- ── profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── games ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.games
  ADD CONSTRAINT fk_games_host_user FOREIGN KEY (host_user_id) REFERENCES public.profiles(user_id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_speaker FOREIGN KEY (speaker_player_id) REFERENCES public.game_players(id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_active_player FOREIGN KEY (active_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_agenda_card FOREIGN KEY (agenda_current_card_id) REFERENCES public.agendas(id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_agenda_vote_player FOREIGN KEY (agenda_vote_current_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_political_secret_player FOREIGN KEY (political_secret_blocked_player_id) REFERENCES public.game_players(id);

-- ── game_players ──────────────────────────────────────────────────────────────
ALTER TABLE public.game_players
  ADD CONSTRAINT fk_game_players_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_players
  ADD CONSTRAINT fk_game_players_user FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

-- ── game_action_card_deck ─────────────────────────────────────────────────────
ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_gacd_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_gacd_card FOREIGN KEY (action_card_id) REFERENCES public.action_cards(id);

ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_gacd_player FOREIGN KEY (held_by_player_id) REFERENCES public.game_players(id);

-- ── game_agenda_deck ──────────────────────────────────────────────────────────
ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT fk_gad_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT fk_gad_agenda FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

-- ── game_agenda_votes ─────────────────────────────────────────────────────────
ALTER TABLE public.game_agenda_votes
  ADD CONSTRAINT fk_gav_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_agenda_votes
  ADD CONSTRAINT fk_gav_player FOREIGN KEY (game_player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_agenda_votes
  ADD CONSTRAINT fk_gav_agenda FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

-- ── game_combats ──────────────────────────────────────────────────────────────
ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_attacker FOREIGN KEY (attacker_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_defender FOREIGN KEY (defender_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_retreat FOREIGN KEY (retreat_declared_by) REFERENCES public.game_players(id);

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_winner FOREIGN KEY (winner_player_id) REFERENCES public.game_players(id);

-- ── game_events ───────────────────────────────────────────────────────────────
ALTER TABLE public.game_events
  ADD CONSTRAINT fk_ge_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_events
  ADD CONSTRAINT fk_ge_player FOREIGN KEY (player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_events
  ADD CONSTRAINT fk_ge_undo_of FOREIGN KEY (undo_of) REFERENCES public.game_events(id);

-- ── game_exploration_decks ────────────────────────────────────────────────────
ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_ged_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_ged_card FOREIGN KEY (card_id) REFERENCES public.exploration_cards(id);

ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_ged_player FOREIGN KEY (resolved_by_player_id) REFERENCES public.game_players(id);

-- ── game_laws ─────────────────────────────────────────────────────────────────
ALTER TABLE public.game_laws
  ADD CONSTRAINT fk_gl_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_laws
  ADD CONSTRAINT fk_gl_agenda FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

-- ── game_player_legendary_cards ───────────────────────────────────────────────
ALTER TABLE public.game_player_legendary_cards
  ADD CONSTRAINT fk_gplc_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_legendary_cards
  ADD CONSTRAINT fk_gplc_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

-- ── game_player_planets ───────────────────────────────────────────────────────
ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_tile FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_space_dock FOREIGN KEY (space_dock_unit_id) REFERENCES public.units(id);

-- ── game_player_promissory_notes ──────────────────────────────────────────────
ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_note FOREIGN KEY (note_id) REFERENCES public.promissory_notes(id);

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_origin FOREIGN KEY (origin_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_holder FOREIGN KEY (held_by_player_id) REFERENCES public.game_players(id);

-- ── game_player_secret_objectives ────────────────────────────────────────────
ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_gpso_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_gpso_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_gpso_objective FOREIGN KEY (objective_id) REFERENCES public.secret_objectives(id);

-- ── game_player_units ─────────────────────────────────────────────────────────
ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_gpu_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_gpu_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_gpu_unit_type FOREIGN KEY (unit_type_id) REFERENCES public.units(id);

-- ── game_public_objectives ────────────────────────────────────────────────────
ALTER TABLE public.game_public_objectives
  ADD CONSTRAINT fk_gpo_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_public_objectives
  ADD CONSTRAINT fk_gpo_objective FOREIGN KEY (objective_id) REFERENCES public.public_objectives(id);

-- ── game_relic_deck ───────────────────────────────────────────────────────────
ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_grd_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_grd_relic FOREIGN KEY (relic_id) REFERENCES public.relics(id);

ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_grd_player FOREIGN KEY (held_by_player_id) REFERENCES public.game_players(id);

-- ── game_rift_transits ────────────────────────────────────────────────────────
ALTER TABLE public.game_rift_transits
  ADD CONSTRAINT fk_grt_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_rift_transits
  ADD CONSTRAINT fk_grt_player FOREIGN KEY (player_id) REFERENCES public.profiles(user_id);

-- ── game_strategy_card_plays ──────────────────────────────────────────────────
ALTER TABLE public.game_strategy_card_plays
  ADD CONSTRAINT fk_gscp_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_strategy_card_plays
  ADD CONSTRAINT fk_gscp_player FOREIGN KEY (played_by_player_id) REFERENCES public.game_players(id);

-- ── game_strategy_card_responses ─────────────────────────────────────────────
ALTER TABLE public.game_strategy_card_responses
  ADD CONSTRAINT fk_gscr_play FOREIGN KEY (play_id) REFERENCES public.game_strategy_card_plays(id) ON DELETE CASCADE;

ALTER TABLE public.game_strategy_card_responses
  ADD CONSTRAINT fk_gscr_player FOREIGN KEY (player_id) REFERENCES public.game_players(id);

-- ── game_system_activations ───────────────────────────────────────────────────
ALTER TABLE public.game_system_activations
  ADD CONSTRAINT fk_gsa_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_activations
  ADD CONSTRAINT fk_gsa_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_activations
  ADD CONSTRAINT fk_gsa_token_owner FOREIGN KEY (token_owner_id) REFERENCES public.game_players(id);

-- ── game_system_state ─────────────────────────────────────────────────────────
ALTER TABLE public.game_system_state
  ADD CONSTRAINT fk_gss_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_state
  ADD CONSTRAINT fk_gss_tile FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

-- ── game_system_tokens ────────────────────────────────────────────────────────
ALTER TABLE public.game_system_tokens
  ADD CONSTRAINT fk_gst_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_tokens
  ADD CONSTRAINT fk_gst_player FOREIGN KEY (player_id) REFERENCES public.game_players(id);

-- ── game_transactions ─────────────────────────────────────────────────────────
ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_from FOREIGN KEY (from_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_to FOREIGN KEY (to_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_active_player FOREIGN KEY (active_player_id) REFERENCES public.game_players(id);

-- ── game_votes ────────────────────────────────────────────────────────────────
ALTER TABLE public.game_votes
  ADD CONSTRAINT fk_gv_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_votes
  ADD CONSTRAINT fk_gv_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;
