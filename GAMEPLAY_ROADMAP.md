# TI4 Companion App — Full Gameplay Roadmap

**Goal:** Transform the app from a real-time scorekeeper into a complete game state machine capable of tracking every piece of information a physical TI4 table would manage with tokens, cards, and dice.

> Phases are ordered by dependency. Complete Phase 0 before anything else — every phase below builds on its data model changes.

---

## Dependency Order

```
Phase 0 (Data Models)
  ├─► Phase 1 (Planets)  ──► Phase 5 (Production)
  │                      └─► Phase 6 (Combat)
  ├─► Phase 2 (Objectives)
  ├─► Phase 3 (Action Cards)
  ├─► Phase 4 (Units/Fleet) ──► Phase 5 (Production)
  │                         └─► Phase 6 (Combat)
  └─► Phase 7 (Relics) ──► Phase 9 (Enhanced Agenda)

Phase 8 (Draft)       — standalone, no dependencies
Phase 10 (TE Deep)    — standalone if TE enabled
Phase 11 (Promissory) — standalone
Phase 12 (Stats)      — depends on all phases
```

---

## Phase 0 — Data Model Extensions

**Depends on:** nothing  
**Unlocks:** everything

Extend the `gameState` JSON schema and add all reference data files. No UI changes in this phase — purely foundational.

### New reference data files

- [ ] `src/data/publicObjectives.js` — 20 Stage I + 20 Stage II objective cards (id, name, stage, points, condition, category)
- [ ] `src/data/secretObjectives.js` — 20 secret objective cards (id, name, points, timing, condition)
- [ ] `src/data/actionCards.js` — 75+ action cards (id, name, timing, text, type, quantity in deck)
- [ ] `src/data/relics.js` — 12 PoK relic cards (id, name, text, exhaustable, transferable, vp_bearing)
- [ ] `src/data/units.js` — all unit types with stats (cost, combat, move, capacity, sustainDamage, afb, bombardment, spaceCannon)
- [ ] `src/data/promissoryNotes.js` — all faction + generic promissory notes (id, faction, text, returnsToOwner, purgeOnUse)
- [ ] `src/data/attachments.js` — planet attachment cards (id, name, trait, modifiers)
- [ ] `src/data/factionAbilities.js` — per-faction flagship stats, mech stats, unique abilities

### New top-level game state keys

- [ ] Add `objectives` object: `{ publicStageI, publicStageII, stageIDeck, stageIIDeck }` to `defaultGameState()`
- [ ] Add `relicDeck`, `relicDiscard`, `frontierTokens` arrays to `defaultGameState()`
- [ ] Add `actionCardDeck` (count), `actionCardDiscard` array to `defaultGameState()`
- [ ] Add `activeCombat: null` to `defaultGameState()` (populated during combat)
- [ ] Add `draft: null` to `defaultGameState()` (populated during pre-game draft)
- [ ] Add `history` object to `defaultGameState()`: `{ rounds: [], startedAt, endedAt, winner }`

### Per-player state extensions (add to `defaultPlayer()`)

- [ ] `planets: []` — array of `{ name, tileId, resources, influence, trait, legendary, exhausted, attachments, hasSpaceDock, hasPDS }`
- [ ] `units: {}` — map of `systemKey → { unitType → { count, damaged } }`
- [ ] `actionCardHand: []` — private hand of card IDs
- [ ] `actionCardCount: 0` — public count shown to other players
- [ ] `secretObjectives: []` — array of `{ cardId, scored }` (private)
- [ ] `relics: []` — held relic IDs (public)
- [ ] `promissoryNotesGiven: []` — notes currently held by others
- [ ] `promissoryNotesHeld: []` — notes in your hand from other factions

---

## Phase 1 — Planet Control & Exhaustion System

**Depends on:** Phase 0  
**Unlocks:** Phase 5 (Production), Phase 6 (Combat), Phase 9 (Agenda influence auto-fill)

### Data

- [ ] Extract flat planet index from `tiles.js` into `src/data/planets.js` — all ~70 planets with `{ name, resources, influence, tileId, trait, legendary, factionHome }`

### State methods (`useGameState.js`)

- [ ] `addPlanet(playerId, planetData)` — adds planet to player's roster
- [ ] `removePlanet(playerId, planetName)` — removes planet (confirm dialog)
- [ ] `togglePlanetExhaustion(playerId, planetName)` — flip exhausted flag
- [ ] `readyAllPlanets(playerId)` — clears all exhausted flags (Status Phase)
- [ ] `addAttachment(playerId, planetName, attachmentId)` — adds attachment card
- [ ] Auto-populate home planets on game create from faction + map tile data

### Status Phase hook

- [ ] Call `readyAllPlanets` for all players when phase advances to Status

### New component: `PlanetTracker.jsx`

- [ ] Tab inside `PlayerRow` (label: Planets, after Technologies)
- [ ] Planets grouped by system (tile number)
- [ ] Each planet row: name, R/I pips, trait badge, legendary badge, exhausted toggle, remove button
- [ ] Bulk actions: "Exhaust All", "Ready All"
- [ ] "Spend Resources" calculator: tap planets to select, shows running total
- [ ] "Spend Influence" calculator: same pattern for influence
- [ ] "Add Planet" button → searchable picker modal (filtered by expansion, not already owned)
- [ ] Summary at top: Ready ⚙/◎ totals and Exhausted ⚙/◎ totals
- [ ] Permission gate: owner or host only can edit

---

## Phase 2 — Objective System

**Depends on:** Phase 0  
**Unlocks:** win condition tracking, VP breakdown audit

### State methods

- [ ] `revealNextObjective()` — pops from stageIDeck (then II when exhausted), marks revealed
- [ ] `scoreObjective(playerId, objectiveId)` — marks player as scorer, awards VP, validates no double-scoring
- [ ] `unscoreObjective(playerId, objectiveId)` — undo (host only)
- [ ] `drawSecretObjective(playerId)` — pops from secret deck, adds to player's private hand
- [ ] `scoreSecretObjective(playerId, objectiveId)` — reveals to all, awards VP, marks scored
- [ ] Initialization on game create: shuffle all three decks, deal 1 secret to each player, reveal 1 Stage I

### Win condition detection

- [ ] In `adjustPlayerVP()`: if `newVP >= state.vpGoal` → set `gameOver: true`, `winner: playerId`, write to `history`
- [ ] Win overlay component: full-screen celebration, faction name, VP count, "End Game" button

### New component: `ObjectiveBoard.jsx`

- [ ] New main overlay (alongside Agenda, Trade Log, Rules, Map)
- [ ] Stage I section: up to 5 revealed cards + unrevealed placeholders
- [ ] Stage II section: up to 5 revealed cards + unrevealed placeholders
- [ ] Each card: name, condition text, points badge, player avatar icons for scorers
- [ ] Host: "Reveal Next Objective" button (Stage I until round 4+, then Stage II available)
- [ ] Per player: "Score" button on each objective (disabled if already scored by them)
- [ ] Secret Objectives section: each player's scored secret count (names private to owner)
- [ ] VP Breakdown panel: per player breakdown of public, secret, custodians, imperial, Shard
- [ ] "Score with Imperial" button: score 1 secret + Imperial Point if holding Mecatol Rex
- [ ] Private secret hand: player sees only their own secrets (client-side filter on `myPlayerId`)
- [ ] "Score This Secret" button on own secrets

---

## Phase 3 — Action Card System

**Depends on:** Phase 0

### State methods

- [ ] `drawActionCards(playerId, count = 2)` — draws from deck, adds to hand, enforces 7-card max with discard prompt
- [ ] `playActionCard(playerId, cardId)` — removes from hand, adds to discard, logs play
- [ ] `discardActionCard(playerId, cardId)` — removes from hand quietly
- [ ] `reshuffleActionDeck()` — called automatically when deck is empty (shuffles discard back in)
- [ ] Status Phase hook: auto-call `drawActionCards(2)` for each player on phase advance

### New component: `ActionCardHand.jsx`

- [ ] Tab in `PlayerRow`, only rendered/expanded when viewing own row (`myPlayerId === player.id`)
- [ ] Card list: name, timing chip (colour-coded: red=combat, blue=action, gold=agenda, grey=any), effect summary
- [ ] Tap to expand full card text
- [ ] "Play" button → confirmation → removes, logs, moves to discard
- [ ] "Discard" button → removes quietly
- [ ] "Draw" button (host or permission) → triggers `drawActionCards(1)`
- [ ] Other players' rows: show only card count badge (no names)
- [ ] Global deck counter visible to all: "Action Cards: 47 remaining"
- [ ] Hand limit enforcement modal: when hand > 7, force discard before closing

### New component: `ActionCardReference.jsx`

- [ ] Searchable overlay of all 75+ cards
- [ ] Filter by timing (Action / Combat Round / Agenda / Any)
- [ ] Accessible from Rules overlay and from action card hand

---

## Phase 4 — Unit & Fleet Roster System

**Depends on:** Phase 0  
**Unlocks:** Phase 5 (Production), Phase 6 (Combat)

### State methods

- [ ] `addUnit(playerId, systemKey, unitType, count = 1)`
- [ ] `removeUnit(playerId, systemKey, unitType, count = 1)`
- [ ] `damageUnit(playerId, systemKey, unitType, count = 1)` — apply sustain damage
- [ ] `repairUnit(playerId, systemKey, unitType, count = 1)` — repair sustained damage
- [ ] `moveUnits(playerId, fromSystem, toSystem, units)` — transfer unit object between systems
- [ ] `getFleetCapacity(playerId, systemKey)` — count non-fighter ships vs fleet pool token

### New component: `FleetRoster.jsx`

- [ ] Tab in `PlayerRow` (label: Fleet)
- [ ] "My Systems" list: one row per system with units summary (carrier×2, fighter×5 etc.)
- [ ] Expand system → full unit editor with +/- per unit type
- [ ] Damaged units shown with ⚡ badge (sustain damage counter)
- [ ] "Sustain Damage" / "Repair" buttons per unit type (for eligible units)
- [ ] "Move Units" flow: pick destination system, select units, confirm
- [ ] "Add System" → pick from map tile data
- [ ] Summary bar: total ships by type, total ground forces, fleet pool usage warning
- [ ] Faction flagship: show faction-specific name and stats

---

## Phase 5 — Production System

**Depends on:** Phase 0, Phase 1 (planets), Phase 4 (units)

### State methods

- [ ] `produceUnits(playerId, systemKey, buildQueue)` — validates capacity/resources, adds units, exhausts planets
- [ ] `getProductionCapacity(playerId, systemKey)` — space dock production value + planets in system
- [ ] `getAvailableResources(playerId)` — sum of unexhausted planet resources + trade goods

### New component: `ProductionCalculator.jsx`

- [ ] Modal/overlay (accessible from FleetRoster or quick action button)
- [ ] Step 1: Select active system (filtered to your systems with Space Docks)
- [ ] System details: production capacity shown
- [ ] Step 2: Build queue — unit type pickers with cost, running resource total, capacity total
- [ ] Warnings: over capacity for ships (hard block), over capacity for infantry/fighters (soft warn)
- [ ] Step 3: Confirm → auto-suggest which planets to exhaust → player confirms → units added, planets exhausted
- [ ] Trade goods can be used to supplement resources (toggle)

---

## Phase 6 — Combat Tracker

**Depends on:** Phase 0, Phase 1 (planets for ground combat), Phase 4 (units)

### State methods

- [ ] `startCombat(systemKey, attackerId, defenderId, type)` — creates `activeCombat` object
- [ ] `resolveAFB(attackerHits, defenderHits)` — pre-combat: assign AFB hits (fighters only)
- [ ] `resolveBombardment(hits)` — pre-combat: assign bombardment hits (ground forces only)
- [ ] `rollCombat(side)` — rolls dice for all units of given side (optional, can be manual)
- [ ] `assignHit(side, unitType)` — assign a pending hit to a specific unit
- [ ] `sustainDamageInCombat(side, unitType)` — sustain instead of destroy
- [ ] `endCombatRound()` — increments round, clears pending hits
- [ ] `retreatCombat(side, destinationSystem)` — moves retreating player's ships, ends combat
- [ ] `resolveCombat(winnerId)` — clears `activeCombat`, updates unit rosters, awards planet control on ground win

### New component: `CombatTracker.jsx`

- [ ] Full-screen overlay (most immersive, dedicated screen)
- [ ] Pre-combat section: AFB button (if destroyer present), Bombardment button (if applicable), Space Cannon button (if PDS adjacent)
- [ ] Unit grids for attacker and defender: each unit type with count, combat value, dice count
- [ ] "Roll Combat" button → auto-rolls dice (random), shows results, counts hits — OR manual hit entry
- [ ] Hit assignment: tap unit type to assign a hit → unit count decrements OR sustain badge added
- [ ] "Sustain" vs "Destroy" choice for eligible units
- [ ] Round counter, combat log (timestamped per round)
- [ ] "Next Round" / "Retreat" (attacker only) / "End Combat" buttons
- [ ] Tech upgrades: show upgraded combat stats if player owns relevant tech
- [ ] Faction abilities that affect combat highlighted inline

---

## Phase 7 — Relic System (Prophecy of Kings)

**Depends on:** Phase 0  
**Gated by:** PoK expansion enabled

### State methods

- [ ] `exploreFrontier(playerId, systemKey)` — draw frontier card result (relic fragment, relic, Mirage, or Enigmatic Device)
- [ ] `drawRelic(playerId)` — pops from relic deck, adds to player's relics list
- [ ] `exhaustRelic(playerId, relicId)` / `readyRelic(playerId, relicId)`
- [ ] `transferRelic(fromPlayerId, toPlayerId, relicId)` — for transferable relics (e.g., Shard of the Throne)
- [ ] Relic fragment tracking: collect 3 of a colour → trade for relic
- [ ] Status Phase hook: ready all exhausted relics

### New component: `RelicTracker.jsx`

- [ ] Tab in `PlayerRow` (visible only if PoK enabled)
- [ ] List of held relics: name, text, exhausted toggle, transfer button (if transferable)
- [ ] Relic Fragment counter (by colour: cultural/hazardous/industrial)
- [ ] "Explore Frontier" button → draws result, grants items
- [ ] "Trade 3 Fragments" button → unlocked when 3 of same type held → draws relic
- [ ] Shard of the Throne: auto-prompt transfer after losing a combat

---

## Phase 8 — Pre-Game Draft System

**Depends on:** Phase 0 (standalone)

### Draft modes

| Mode | Description |
|------|-------------|
| Random | App randomly assigns factions and seats |
| Snake | Speaker picks first, then last-to-first-to-last |
| Milty | Players bid on slices + faction + speaker position simultaneously |
| Manual | Host assigns directly (existing behaviour) |

### State methods

- [ ] `initDraft(mode, playerCount)` — sets up `draft` state, generates slices if Milty
- [ ] `makeDraftPick(playerId, factionId, sliceIndex, seatIndex)` — records pick, advances `currentPick`
- [ ] `completeDraft()` — finalises state: populates player factions, map tiles, speaker, clears `draft`
- [ ] Milty slice generation: pull from tile pool (expansion-filtered), balance check (~9-11 total res+inf per slice)

### New screen: `DraftScreen.jsx`

- [ ] Shown in place of SetupScreen step 2 when a draft mode is chosen
- [ ] Milty view: grid of available slices (tile previews) + faction pool
- [ ] Slice card: 5 tile thumbnails, total resources, total influence, special tokens (wormholes, legendaries, tech skips)
- [ ] Each player's turn indicator (snake order or simultaneous for Milty)
- [ ] Pick clock: optional countdown timer per pick (configurable seconds)
- [ ] Draft summary: show all picks before confirming and starting game
- [ ] Integration: after draft complete, map auto-fills with chosen slices at correct seat positions

---

## Phase 9 — Enhanced Agenda Phase

**Depends on:** Phase 0, Phase 1 (for Elect Planet), Phase 2 (for Elect Law)

### Elect type handling

- [ ] Add `outcome` type field to all entries in `AGENDAS` data: `'for_against' | 'elect_player' | 'elect_planet' | 'elect_law' | 'elect_strategy_card'`
- [ ] Render appropriate picker per outcome type in `AgendaPhase.jsx`:
  - `elect_player` → player name buttons
  - `elect_planet` → all controlled planets grouped by player
  - `elect_law` → current laws in play
  - `elect_strategy_card` → strategy card names 1–8

### Influence auto-fill

- [ ] Show available influence total on vote input (computed from player's unexhausted planets)
- [ ] "Use Planets" button → opens planet picker → auto-exhausts selected on vote commit
- [ ] Manual override still available

### Speaker tiebreak

- [ ] On tied vote: highlight Speaker badge prominently
- [ ] Host: "Speaker Decides" button → prompt for tiebreak choice → log decision

### Rider tracking

- [ ] Pre-vote window: any player can declare a Rider (Political Favor, etc.)
- [ ] Track active riders per agenda
- [ ] On resolution: if agenda matches rider, prompt benefit grant

---

## Phase 10 — Thunder's Edge Deep Features

**Depends on:** Phase 0  
**Gated by:** Thunder's Edge expansion enabled

### Full Expedition mechanics

- [ ] Visual hex grid of expedition sectors (5-sector layout) in `ExpeditionTracker.jsx`
- [ ] Each sector: which player controls it (colour coded), claim button
- [ ] Breakthrough auto-check: player controls all 5 sectors → `breakthrough: true`, +1 VP
- [ ] Fracture event: resets all expedition claims (host-triggered)

### Entropic Scars

- [ ] Track which systems have active Entropic Scars (anomaly type in tiles already)
- [ ] Scar rules reminder when unit attempts to move through scarred system
- [ ] Visual indicator on map for active scars

### Space Stations

- [ ] New unit type: Space Station (TE only) in `units.js`
- [ ] Track per-system, per-player
- [ ] Production/defence bonus display

### Neutral Units

- [ ] `src/data/neutralUnits.js` — Fracture neutral unit combat stats
- [ ] Reference card in Rules overlay (TE section)
- [ ] Can be added to combat tracker as "neutral" combatant

---

## Phase 11 — Promissory Note Tracking

**Depends on:** Phase 0 (standalone)

### State methods

- [ ] `givePromissoryNote(fromPlayerId, toPlayerId, noteId)` — transfers note, updates given/held lists
- [ ] `playPromissoryNote(holderId, noteId)` — removes from holder; if `returnsToOwner: true`, send back; if `purgeOnUse: true`, remove permanently
- [ ] Initialize on game create: each player receives their faction's 2 promissory notes + generic notes

### Updated `PlayerRow` promissory section

- [ ] Replace current display-only list with interactive given/held lists
- [ ] "Give Note" action → select recipient, select note → triggers transfer + auto-logs to Trade Log
- [ ] "Play Note" action → marks used, handles return or purge
- [ ] Integration with Trade Log: any trade containing a promissory note auto-logs the transfer

---

## Phase 12 — Statistics & Game History

**Depends on:** all phases (captures data from all systems)

### New Supabase table: `game_history`

```sql
CREATE TABLE game_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  played_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  player_count INT,
  winner_faction TEXT,
  winner_vp   INT,
  total_rounds INT,
  duration_minutes INT,
  expansions  JSONB,
  players     JSONB,
  objectives  JSONB,
  round_summaries JSONB
);
```

- [ ] Write history record to `game_history` when `gameOver: true` is set
- [ ] Round snapshots: capture VP per player at end of each Status Phase

### New screen: `StatsScreen.jsx`

- [ ] VP over time line chart (per-round snapshots)
- [ ] Win rate leaderboard (wins / games played per user account)
- [ ] Objective scoring heatmap (which objectives hit the table most often)
- [ ] Agenda pass/fail record per agenda name
- [ ] Most common strategy card picks per faction
- [ ] Post-game summary card: shareable image with winner, faction, VP, rounds played

---

## Current Coverage Summary

| System | Status |
|--------|--------|
| VP Tracking | ✅ Complete |
| Phase Cycling | ✅ Complete |
| Strategy Cards | ✅ Complete |
| Agenda Voting | ✅ Complete |
| Trade Log | ✅ Complete |
| Map Builder | ✅ Complete |
| Leader Tracking | ✅ Complete |
| Technology | ✅ Complete |
| Command Tokens | ✅ Complete |
| Planet Control | ❌ Phase 1 |
| Objective System | ❌ Phase 2 |
| Action Cards | ❌ Phase 3 |
| Unit/Fleet Tracker | ❌ Phase 4 |
| Production System | ❌ Phase 5 |
| Combat Tracker | ❌ Phase 6 |
| Relic System | ❌ Phase 7 |
| Draft System | ❌ Phase 8 |
| Enhanced Agenda | ❌ Phase 9 |
| TE Deep Features | 🔶 Phase 10 |
| Promissory Notes | 🔶 Phase 11 |
| Statistics | ❌ Phase 12 |
