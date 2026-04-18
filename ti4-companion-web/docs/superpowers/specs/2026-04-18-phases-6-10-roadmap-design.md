# TI4 Companion — Phases 6–10 Roadmap Design

**Goal:** Define the phases, ordering, scope, and key architectural decisions for all remaining major feature work after Phase 5c (Ability System). The objective is a playable end-to-end game loop — from game start to a player winning — with full combat tracking.

---

## Phase Structure and Dependencies

| Phase | Name | Depends on |
|---|---|---|
| 6 | Status Phase + Secret Objectives | Independent — build first |
| 7 | Agenda Phase | Phase 6 (needs a working round loop before agenda phase is useful) |
| 8 | Promissory Notes + Trade | Largely independent — can run parallel to Phase 7 |
| 9 | Map + Planet Claiming + Exploration | Phase 6 (planet readying already partially built) |
| 10 | Full Combat | Phase 9 (unit tracking must exist first) |

Phases 7 and 8 can be built in either order. Phases 9 and 10 form a hard chain. Phase 6 is the only true prerequisite for everything else.

---

## Key Architectural Decisions

### Status phase as a single Edge Function
`game-status-phase` runs all status steps atomically: score objectives, ready planets, repair units, return board tokens, grant each player 2 new tokens to redistribute as they choose, advance speaker, advance round. The host triggers it once; it validates pre-conditions (all players passed) and applies everything in one transaction. No step-by-step UI needed.

### Secret objectives — deal 2, discard to 1
Each player is dealt 2 secret objectives at game start (state = `held`). Each player privately discards 1 via `game-discard-secret-objective` before the first round begins. The discarded card returns to the deck face-down. A `secrets_selected` boolean on `game_players` tracks completion; the host can see who hasn't done it yet. Players score at most 1 secret objective per status phase. Scoring is private — other players see only the count, not the card name.

### Agenda resolution driven by `elect_type`
The `agendas` table already has `elect_type` (player, planet, law, strategy card, etc.) and `type` (law vs directive). `game-resolve-agenda` receives the elected target and applies the correct state change based on `elect_type`. The UI presents the appropriate picker per type (player picker, planet picker, free-text for laws, etc.); the Edge Function validates and executes. No manual fallback — all outcome types get structured resolution.

### Promissory notes start in owner's hand
All promissory notes (faction and generic) start in their owner's hand at game start. They are transferred to other players during trade and negotiation. Generic notes (e.g. Shard of the Throne) that enter play via scoring or events are handled as they arise in Phase 8.

### Full combat in app — dice simulation
The app simulates dice rolls (random per combat round), applies hits, tracks sustain damage. Players confirm hits rather than entering numbers manually. The ability system (Phase 5) already handles faction combat modifiers.

### Incremental game-start patches
Each phase that needs state initialized at game start patches `game-start` incrementally (same pattern as Phase 4b did for action cards). All additions are filtered by active expansions.

---

## game-start Additions Per Phase

| Phase | Addition |
|---|---|
| 6 | Deal 2 secret objectives per player from shuffled secret deck |
| 7 | Shuffle and initialise `game_agenda_deck` |
| 8 | Deal each player's faction promissory notes into `game_player_promissory_notes` (state = `held`, `held_by_player_id` = owner) |
| 9 | Initialise `game_relic_deck` + 3 exploration decks (cultural, industrial, hazardous) in `game_exploration_decks` |
| 10 | No game-start changes needed |

---

## Per-Phase Scope Summaries

### Phase 6 — Status Phase + Secret Objectives

**Purpose:** Complete the per-round loop. Every round ends with a status phase; secret objectives are a core scoring mechanism from round 1.

**Edge Functions:**
- Patch `game-start` — deal 2 secret objectives per player
- `game-discard-secret-objective` — player discards 1 of their 2 dealt secrets before play begins; card returns to deck
- `game-status-phase` — atomically: ready all planets, repair units, return command tokens from board, grant each player 2 tokens to redistribute themselves, advance speaker token, advance round counter
- `game-score-secret-objective` — player scores a held secret objective during status phase; validates timing and 1-per-status-phase limit; awards 1 VP

**UI:**
- Post-game-start secret selection screen (private per player — pick which to keep)
- Secret objectives panel in MyPanelSection (private hand view; count-only badge on scoreboard)
- Host sees which players haven't selected their secret yet
- Host "End Status Phase" button (validates all players passed)

---

### Phase 7 — Agenda Phase

**Purpose:** The political layer. Unlocked after custodians are claimed (first player to reach Mecatol Rex or 3 VP depending on expansion). Two agendas resolved per agenda phase.

**Edge Functions:**
- Patch `game-start` — initialise agenda deck
- `game-claim-custodians` — awards 1 VP to claiming player, sets `games.agenda_unlocked = true`
- `game-draw-agenda` — reveals top 2 agenda cards from deck into play
- `game-cast-votes` — player submits vote choice + count for the current agenda
- `game-resolve-agenda` — host resolves; structured by `elect_type`: applies state change (enact law into `game_laws`, adjust VP, exhaust planet, etc.), then advances to second agenda or ends agenda phase

**UI:**
- AgendaSection (visible during agenda phase): shows 2 revealed agendas, live vote totals per option, per-player vote status
- Per-`elect_type` resolution pickers (player picker, planet picker, law text entry, etc.)
- Enacted laws list (persistent, visible throughout game)
- Custodians claim button (available when player controls Mecatol Rex)

---

### Phase 8 — Promissory Notes + Trade

**Purpose:** The economy and diplomacy layer. Notes transfer between players; trade goods and commodities exchange hands; transactions are logged.

**Edge Functions:**
- Patch `game-start` — deal faction promissory notes to owners
- `game-transfer-promissory-note` — move a note from one player's hand to another's; validates ownership
- `game-create-transaction` — log a trade (commodities, trade goods, notes); both players confirm; updates `game_transactions`

**UI:**
- PromissoryNotesModal (private hand view per player; shows note name, effect text, "Give" button)
- TradeModal (propose trade to another player: select items to send/receive; other player accepts/rejects)
- Transaction log (visible to all players, shows round/phase of each trade)
- Support for the Throne (and equivalents) VP tracked automatically when note is held

---

### Phase 9 — Map + Planet Claiming + Exploration

**Purpose:** The board layer. Players place units, activate systems, claim planets, and explore them. Sets up the unit tracking required for Phase 10.

**Edge Functions:**
- `game-activate-system` — place tactic token on system, record activation in `game_system_activations`
- `game-place-units` — produce/move units into a system; updates `game_player_units`
- `game-claim-planet` — transfer planet control to claiming player; creates row in `game_player_planets`; triggers exploration prompt if applicable
- `game-explore-planet` — draw top card from appropriate exploration deck (cultural/industrial/hazardous); apply effect or award relic fragment
- `game-gain-relic` — when relic fragments reach threshold, draw from `game_relic_deck`; award to player

**UI:**
- Interactive hex map (displays placed tiles, system activations, unit presence per system)
- System detail panel (tap a system: shows units, planets, activation status)
- Planet claiming flow (claim planet → exploration prompt → card reveal)
- Exploration card modal (card name, effect, confirm)
- Relic fragment tracker per player (in MyPanelSection)

---

### Phase 10 — Full Combat

**Purpose:** Resolve space and ground combat step-by-step in the app, with simulated dice rolls, hit assignment, sustain damage, and retreat.

**Edge Functions:**
- `game-start-combat` — initiate combat in a system; sets `combat_active = true` on `game_system_state`; records attacker/defender
- `game-resolve-combat-round` — simulate one combat round: roll dice per unit (using unit stats from `units` table + upgrades), return hit counts; players assign hits; update `game_player_units` (destroyed/damaged)
- `game-retreat` — move surviving attacker units to an adjacent system; end combat
- `game-resolve-ground-combat` — after space combat winner established: bombardment step, then ground combat rounds between landed ground forces and defenders

**Combat sequence (space):**
1. Anti-Fighter Barrage (if applicable)
2. Space Cannon (PDS fire from planets)
3. Combat rounds: roll → assign hits → sustain or destroy → repeat until one side eliminated or retreats

**Combat sequence (ground):**
1. Bombardment (attacker fires from space)
2. Ground combat rounds: roll → assign hits → repeat until one side eliminated

**UI:**
- CombatModal: step-by-step combat flow, shows dice results, hit assignment interface, sustain/destroy choices
- Retreat button (available to attacker after round 1)
- Ground combat follow-up prompt after space combat resolved
- Combat log (round-by-round summary)
