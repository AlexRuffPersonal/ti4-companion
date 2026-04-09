-- Enable RLS on all public tables
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_laws                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_system_state            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_system_activations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_agenda_deck             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_votes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_public_objectives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_secret_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_action_card_deck        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_relic_deck              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_exploration_decks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_promissory_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_planets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_units            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiles                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factions                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendas                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technologies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_objectives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_objectives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_cards                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relics                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exploration_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promissory_notes             ENABLE ROW LEVEL SECURITY;

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Reference data (read-only for all authenticated users) ────────────────────
CREATE POLICY "tiles_select"               ON public.tiles               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "factions_select"            ON public.factions            FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "agendas_select"             ON public.agendas             FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "technologies_select"        ON public.technologies        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "units_select"               ON public.units               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "public_objectives_select"   ON public.public_objectives   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "secret_objectives_select"   ON public.secret_objectives   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "action_cards_select"        ON public.action_cards        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "relics_select"              ON public.relics              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "exploration_cards_select"   ON public.exploration_cards   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attachments_select"         ON public.attachments         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "promissory_notes_select"    ON public.promissory_notes    FOR SELECT USING (auth.role() = 'authenticated');

-- Reference data writes: admin only
CREATE POLICY "tiles_admin_write"             ON public.tiles             FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "factions_admin_write"          ON public.factions          FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "agendas_admin_write"           ON public.agendas           FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "technologies_admin_write"      ON public.technologies      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "units_admin_write"             ON public.units             FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "public_objectives_admin_write" ON public.public_objectives FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "secret_objectives_admin_write" ON public.secret_objectives FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "action_cards_admin_write"      ON public.action_cards      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "relics_admin_write"            ON public.relics            FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "exploration_cards_admin_write" ON public.exploration_cards FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "attachments_admin_write"       ON public.attachments       FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "promissory_notes_admin_write"  ON public.promissory_notes  FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())) WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));

-- ── Games ─────────────────────────────────────────────────────────────────────
CREATE POLICY "games_select" ON public.games FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "games_insert" ON public.games FOR INSERT WITH CHECK (auth.uid() = host_user_id);

-- ── Game Players ──────────────────────────────────────────────────────────────
CREATE POLICY "game_players_select" ON public.game_players FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_players_update" ON public.game_players FOR UPDATE USING (
  auth.uid() = user_id OR
  (SELECT can_edit_all FROM public.game_players WHERE user_id = auth.uid() AND game_id = game_players.game_id LIMIT 1)
);

-- ── All game sub-tables: read by authenticated, write via service role only ──
CREATE POLICY "game_laws_select"                      ON public.game_laws                      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_system_state_select"              ON public.game_system_state              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_system_activations_select"        ON public.game_system_activations        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_agenda_deck_select"               ON public.game_agenda_deck               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_votes_select"                     ON public.game_votes                     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_public_objectives_select"         ON public.game_public_objectives         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_secret_objectives_select"  ON public.game_player_secret_objectives  FOR SELECT USING (
  player_id IN (SELECT id FROM public.game_players WHERE user_id = auth.uid())
  OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "game_action_card_deck_select"          ON public.game_action_card_deck          FOR SELECT USING (
  held_by_player_id IN (SELECT id FROM public.game_players WHERE user_id = auth.uid())
  OR held_by_player_id IS NULL
  OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "game_relic_deck_select"                ON public.game_relic_deck                FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_exploration_decks_select"         ON public.game_exploration_decks         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_promissory_notes_select"   ON public.game_player_promissory_notes   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_planets_select"            ON public.game_player_planets            FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_units_select"              ON public.game_player_units              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_transactions_select"              ON public.game_transactions              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_events_select"                    ON public.game_events                    FOR SELECT USING (auth.role() = 'authenticated');
