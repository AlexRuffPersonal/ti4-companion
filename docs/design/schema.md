# TI4 Companion — Database Schema

19 game state tables + 12 admin-entered reference tables. All tables have RLS enabled.

---

## Auth & Users

### `auth.users` _(Supabase managed)_
| Column | Type |
|---|---|
| id | UUID PK |
| email | TEXT |
| created_at | TIMESTAMPTZ |

### `profiles`
| Column | Type | Notes |
|---|---|---|
| user_id | UUID PK FK→auth.users | |
| display_name | TEXT | |
| preferred_colour | TEXT | |
| is_admin | BOOLEAN | gates admin data entry UI |
| created_at | TIMESTAMPTZ | |

---

## Game Session

### `games`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| code | TEXT UNIQUE | 6-char room code |
| host_user_id | UUID FK→profiles | |
| phase | TEXT | strategy/action/status/agenda |
| round | INTEGER | |
| vp_goal | INTEGER | |
| speaker_player_id | UUID FK→game_players | |
| custodians_claimed | BOOLEAN | |
| agenda_unlocked | BOOLEAN | |
| permissions_mode | TEXT | host / all |
| expansions | JSONB | {base, pok, te} |
| galactic_event | TEXT | |
| map_layout | TEXT | |
| map_tiles | JSONB | coord→tile_id map |
| the_fracture_in_play | BOOLEAN | Thunder's Edge |
| status | TEXT | active/completed/abandoned |
| created_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ | |

### `game_players`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| user_id | UUID FK→profiles | nullable (guest) |
| display_name | TEXT | |
| faction | TEXT | |
| colour | TEXT | |
| seat_index | INTEGER | |
| vp | INTEGER | |
| strategy_card | INTEGER | |
| strategy_card_2 | INTEGER | |
| passed | BOOLEAN | |
| command_tokens | JSONB | {tactic_total, fleet, strategy} — totals owned |
| tokens_lost_to_mahact | INTEGER DEFAULT 0 | tokens captured from this player |
| tokens_captured_from | JSONB DEFAULT {} | Mahact only: {player_id: count} |
| commodities | INTEGER | |
| trade_goods | INTEGER | |
| relic_fragments | JSONB | {cultural, industrial, hazardous, frontier} |
| technologies | TEXT[] | |
| leaders | JSONB | {agent, commander, hero} |
| breakthrough | BOOLEAN | Thunder's Edge |
| can_edit_all | BOOLEAN | replaces old permissions hack |

**CHECK constraint:** `(command_tokens->>'tactic_total')::int + (command_tokens->>'fleet')::int + (command_tokens->>'strategy')::int <= 16`

### `game_laws`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| agenda_id | UUID FK→agendas | |
| enacted_at_round | INTEGER | |
| elect_target | TEXT | player/planet elected, if applicable |
| repealed | BOOLEAN | |

---

## System State

### `game_system_state`
One row per system that has any notable state. Created lazily when a system gains state.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| system_key | TEXT | axial coord "q,r" — UNIQUE per game |
| tile_id | UUID FK→tiles | |
| frontier_explored | BOOLEAN DEFAULT false | PoK |
| has_space_station | BOOLEAN DEFAULT false | Thunder's Edge |
| entropic_scar | BOOLEAN DEFAULT false | Thunder's Edge |
| wormhole_active | BOOLEAN DEFAULT true | Creuss gate toggle |
| ion_storm | BOOLEAN DEFAULT false | action card |
| mirage_present | BOOLEAN DEFAULT false | PoK legendary planet found here |
| space_mines | JSONB DEFAULT [] | [{player_id, count}] |
| combat_active | BOOLEAN DEFAULT false | system currently in combat |

**UNIQUE:** `(game_id, system_key)`

### `game_system_activations`
Tracks tactic tokens placed on the map (system activations).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| player_id | UUID FK→game_players | the activating player |
| system_key | TEXT | |
| round | INTEGER | cleared by advance-phase Edge Fn |
| token_owner_id | UUID FK→game_players | differs from player_id if Mahact captured token |

**UNIQUE:** `(game_id, player_id, system_key, round)`

Available tactic tokens = `tactic_total − COUNT(activations WHERE game_id AND player_id AND round = current_round)`

---

## Agenda & Voting

### `game_agenda_deck`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| agenda_id | UUID FK→agendas | |
| deck_position | INTEGER | null = drawn/discarded |
| state | TEXT | deck / active / discarded |

### `game_votes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| agenda_id | UUID FK→agendas | |
| player_id | UUID FK→game_players | |
| round | INTEGER | |
| choice | TEXT | |
| vote_count | INTEGER | |

---

## Objectives

### `game_public_objectives`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| objective_id | UUID FK→public_objectives | |
| revealed_at_round | INTEGER | null = not yet revealed |
| scored_by | UUID[] | array of game_player ids |

### `game_player_secret_objectives`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| player_id | UUID FK→game_players | |
| objective_id | UUID FK→secret_objectives | |
| state | TEXT | held / scored / discarded |
| scored_at_round | INTEGER | |

---

## Action Cards, Relics & Exploration

### `game_action_card_deck`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| action_card_id | UUID FK→action_cards | |
| copy_index | INTEGER | for cards with qty > 1 |
| deck_position | INTEGER | null = not in deck |
| state | TEXT | deck / held / discarded |
| held_by_player_id | UUID FK→game_players | |

### `game_relic_deck` _(PoK)_
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| relic_id | UUID FK→relics | |
| state | TEXT | deck / held / exhausted / purged |
| held_by_player_id | UUID FK→game_players | |

### `game_exploration_decks` _(PoK)_
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| card_id | UUID FK→exploration_cards | |
| deck_type | TEXT | cultural/industrial/hazardous/frontier |
| deck_position | INTEGER | |
| state | TEXT | deck / resolved / discarded |
| resolved_by_player_id | UUID FK→game_players | |

---

## Planets, Units & Promissory Notes

### `game_player_planets`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| player_id | UUID FK→game_players | |
| planet_name | TEXT | |
| tile_id | UUID FK→tiles | |
| exhausted | BOOLEAN | |
| has_space_dock | BOOLEAN | |
| has_pds | BOOLEAN | |
| has_sleeper | BOOLEAN | Titans of Ul — PoK |
| planet_destroyed | BOOLEAN | Stellar Converter hero |
| attachments | UUID[] | FK→attachments |

### `game_player_units`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| player_id | UUID FK→game_players | |
| system_key | TEXT | axial coord "q,r" |
| unit_type_id | UUID FK→units | |
| count | INTEGER | |
| damaged_count | INTEGER | sustained damage |
| on_planet | TEXT | null = space area of system |

Multiple players can have rows with the same `system_key` — this is how coexistence and combat are represented.

### `game_player_promissory_notes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| note_id | UUID FK→promissory_notes | |
| origin_player_id | UUID FK→game_players | faction the note belongs to |
| held_by_player_id | UUID FK→game_players | |
| state | TEXT | held / played / purged |

---

## Transactions & History

### `game_transactions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| from_player_id | UUID FK→game_players | |
| to_player_id | UUID FK→game_players | |
| items | JSONB | what was traded |
| round | INTEGER | |
| phase | TEXT | |
| created_at | TIMESTAMPTZ | |

### `game_events`
Audit log of all significant state changes.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| game_id | UUID FK→games | |
| player_id | UUID FK→game_players | nullable |
| event_type | TEXT | vp_change, phase_advance, etc. |
| payload | JSONB | before/after values |
| round | INTEGER | |
| phase | TEXT | |
| created_at | TIMESTAMPTZ | |

---

## Reference Data — Admin Entered

### `tiles`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tile_number | TEXT | e.g. "001" |
| name | TEXT | |
| type | TEXT | blue/red/home/hyperlane/frontier |
| expansion | TEXT | |
| planets | JSONB | [{name, resources, influence, trait, legendary}] |
| anomaly | TEXT | |
| wormhole | TEXT | |

### `factions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| expansion | TEXT | |
| starting_techs | TEXT[] | |
| home_tile_number | TEXT | |
| commodities | INTEGER | starting value |
| abilities | JSONB | [{name, text}] |
| flagship | JSONB | |
| mech | JSONB | |
| promissory_notes | JSONB | |

### `agendas`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| type | TEXT | law / directive |
| outcome | TEXT | |
| elect_type | TEXT | player/planet/law/unit |
| expansion | TEXT | |
| note | TEXT | |

### `action_cards`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| timing | TEXT | when it can be played |
| text | TEXT | |
| type | TEXT | |
| quantity | INTEGER | copies in deck |
| expansion | TEXT | |

### `technologies`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| colour | TEXT | green/blue/red/yellow |
| prerequisites | JSONB | {green:1, blue:2…} |
| text | TEXT | |
| is_unit_upgrade | BOOLEAN | |
| unit_stats | JSONB | null if not unit upgrade |
| faction | TEXT | null = generic tech |
| expansion | TEXT | |

### `units`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | Carrier, Dreadnought… |
| cost | NUMERIC | |
| combat | TEXT | e.g. "9(x2)" |
| move | INTEGER | |
| capacity | INTEGER | |
| sustain_damage | BOOLEAN | |
| bombardment | TEXT | |
| afb | TEXT | |
| space_cannon | TEXT | |
| planetary | BOOLEAN | ground unit? |

### `public_objectives`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| stage | INTEGER | 1 or 2 |
| points | INTEGER | |
| condition | TEXT | |
| category | TEXT | military/expansion/etc. |
| expansion | TEXT | |

### `secret_objectives`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| points | INTEGER | |
| timing | TEXT | when it can be scored |
| condition | TEXT | |
| expansion | TEXT | |

### `relics` _(PoK)_
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| text | TEXT | |
| exhaustable | BOOLEAN | |
| transferable | BOOLEAN | |
| vp_bearing | BOOLEAN | |
| purge_on_use | BOOLEAN | |

### `exploration_cards` _(PoK)_
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| deck_type | TEXT | cultural/industrial/hazardous/frontier |
| text | TEXT | |
| quantity | INTEGER | |
| relic_fragment_type | TEXT | null if not a fragment |

### `attachments` _(PoK)_
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| planet_trait | TEXT | cultural/industrial/hazardous |
| resource_modifier | INTEGER | |
| influence_modifier | INTEGER | |
| text | TEXT | |

### `promissory_notes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| faction | TEXT | null = generic note |
| text | TEXT | |
| returns_to_owner | BOOLEAN | |
| purge_on_use | BOOLEAN | |
| expansion | TEXT | |
