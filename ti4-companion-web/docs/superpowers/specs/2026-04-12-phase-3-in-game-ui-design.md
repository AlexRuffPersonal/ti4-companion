# Phase 3 — In-Game UI Design

**Date:** 2026-04-12
**Status:** Approved

---

## Goal

Replace `GamePlaceholder` with a real in-game screen that lets players track their state, see the scoreboard, and advance through Strategy, Action, and Status phases.

---

## Scope

**In Phase 3:**
- Strategy, Action, and Status phases
- Active player tracking (initiative order)
- Public objective reveal and scoring
- Command token redistribution (status phase)
- Planet exhaust/ready tracking
- Generic deck shuffle function

**Deferred (Phase 4):**
- Agenda phase (draw, vote, resolve, laws)
- Action cards, relics, exploration cards, promissory notes
- Technology research
- Unit placement / combat

---

## Navigation & Layout

Single scrolling page at `/game/:code`. No tabs or sidebar. Sections stack top to bottom, visible to all players:

1. **Header** — Round N · Phase name · VP goal · Speaker name
2. **Scoreboard** — one row per player: colour dot, name, faction, strategy card, active/passed/waiting badge, VP
3. **My Panel** — command tokens with +/- controls, commodities, trade goods, planet list, tech count, leader status; Pass and End Turn buttons when it's the current player's turn
4. **Public Objectives** — revealed objectives with scorer names; empty state if none revealed
5. **Host Controls** — Score Objective, Reveal Objective, Shuffle Deck, Advance Phase; always rendered but only interactive for `isHost=true`

---

## Information Visibility

| Data | Visible to |
|---|---|
| VP, strategy card, passed/active status | All players |
| Command tokens, technologies, planets | All players |
| Action cards, secret objectives | Owner only (deferred to Phase 4) |

---

## Data Architecture

### Approach: Extend `useGame`

`useGame` remains the single data source for the game screen. It gains three additional fetches and Realtime subscriptions beyond the existing `games` + `game_players`:

| Table | What's loaded |
|---|---|
| `game_public_objectives` | All rows for this game — objective_id, revealed_at_round, scored_by, deck_position, state |
| `game_player_planets` | All rows for this game — planet_name, player_id, exhausted, attachments |

`game_player_units` is not loaded in Phase 3 (no map view).

### Active Player Tracking

`games.active_player_id UUID REFERENCES game_players(id)` stores whose turn it is during the action phase. It is managed entirely by Edge Functions — the client never writes it directly.

**Derivation rule (Edge Function logic):**
- Players are ordered by `strategy_card` ascending (initiative order)
- `active_player_id` advances to the next non-passed player in that cycle
- When all players have `passed = true`, `active_player_id` is set to `null` (action phase complete)
- During strategy and status phases `active_player_id` is `null`

### New Action Wrappers on `useGame`

```
passAction()              → game-player-pass
endTurn()                 → game-end-turn
scoreObjective(objId, playerId)  → game-score-objective
revealObjective()         → game-reveal-objective
shuffleDeck(deckType)     → game-shuffle-deck
advancePhase()            → game-advance-phase
updateTokens(tokens)      → game-update-command-tokens
exhaustPlanet(planetName) → direct Supabase UPDATE
readyPlanet(planetName)   → direct Supabase UPDATE
pickStrategyCard(card)    → direct Supabase UPDATE
updateCommodities(n)      → direct Supabase UPDATE
updateTradeGoods(n)       → direct Supabase UPDATE
cycleLeader(leader, status) → direct Supabase UPDATE
```

---

## Schema Changes — Migration 007_phase3.sql

```sql
-- Active player tracking during action phase
ALTER TABLE public.games
  ADD COLUMN active_player_id UUID REFERENCES public.game_players(id);

-- Objective deck ordering (to support shuffle + sequential reveal)
ALTER TABLE public.game_public_objectives
  ADD COLUMN deck_position INTEGER,
  ADD COLUMN state TEXT NOT NULL DEFAULT 'deck';
```

`game-start` is updated to initialise both objective decks (Stage I and Stage II) by inserting all eligible public objectives for the game's expansions into `game_public_objectives` with `state = 'deck'` and randomly assigned `deck_position` values.

---

## Edge Functions

Six new Edge Functions:

### `game-end-turn`
- Caller: active player
- Advances `active_player_id` to the next non-passed player in initiative order (wraps around)
- If all players have passed, sets `active_player_id = null`

### `game-player-pass`
- Caller: active player
- Sets `passed = true` on the calling player's `game_players` row
- Advances `active_player_id` to the next non-passed player in initiative order
- If all players are now passed, sets `active_player_id = null`

### `game-advance-phase`
- Caller: host
- Phase transitions: `strategy → action → status → strategy` (next round)
- On transition **to action**: sets `active_player_id` to the player with the lowest `strategy_card`
- On transition **to status**: sets `active_player_id = null`; readies all planets (`UPDATE game_player_planets SET exhausted = false`)
- On transition **to strategy** (new round): increments `games.round`; clears `strategy_card` on all `game_players`; clears `passed` on all players

### `game-score-objective`
- Caller: host
- Appends `player_id` to `scored_by` array on `game_public_objectives`
- Increments `game_players.vp` by the objective's point value

### `game-reveal-objective`
- Caller: host
- Selects the `game_public_objectives` row with the lowest `deck_position` where `state = 'deck'` and the matching stage
- Sets its `state = 'revealed'` and `revealed_at_round = current round`

### `game-shuffle-deck`
- Caller: host
- Generic — accepts `game_id` and `deck_type`
- Randomly reassigns `deck_position` values across all `state = 'deck'` rows for the specified deck

**`deck_type` values and their targets:**

| deck_type | Table | Additional filter |
|---|---|---|
| `public_objectives_1` | `game_public_objectives` | join to `public_objectives` where `stage = 1` |
| `public_objectives_2` | `game_public_objectives` | join to `public_objectives` where `stage = 2` |
| `action_cards` | `game_action_card_deck` | — |
| `agenda` | `game_agenda_deck` | — |
| `relics` | `game_relic_deck` | — |
| `exploration_cultural` | `game_exploration_decks` | `deck_type = 'cultural'` |
| `exploration_industrial` | `game_exploration_decks` | `deck_type = 'industrial'` |
| `exploration_hazardous` | `game_exploration_decks` | `deck_type = 'hazardous'` |
| `exploration_frontier` | `game_exploration_decks` | `deck_type = 'frontier'` |

### `game-update-command-tokens`
- Caller: any player (own row only)
- Validates new `{tactic_total, fleet, strategy}` satisfies `tactic_total + fleet + strategy <= 16`
- Updates `game_players.command_tokens`

---

## Components

All section components are purely presentational — they receive data as props from `GameScreen`, which owns `useGame`.

| Component | File | Props |
|---|---|---|
| `GameScreen` | `src/components/game/GameScreen.jsx` | `userId` |
| `GameHeader` | `src/components/game/GameHeader.jsx` | `game`, `speaker` |
| `ScoreboardSection` | `src/components/game/ScoreboardSection.jsx` | `players`, `activePlayerId`, `currentPlayerId` |
| `MyPanelSection` | `src/components/game/MyPanelSection.jsx` | `player`, `planets`, `isActive`, `onPass`, `onEndTurn`, `onUpdateTokens`, … |
| `ObjectivesSection` | `src/components/game/ObjectivesSection.jsx` | `objectives`, `players` |
| `HostControlsSection` | `src/components/game/HostControlsSection.jsx` | `isHost`, `game`, `onScoreObjective`, `onRevealObjective`, `onShuffleDeck`, `onAdvancePhase` |

`GamePlaceholder` is deleted. `App.jsx` route `/game/:code` is updated to render `GameScreen`.

---

## Status Phase Behaviour

Status phase is **key actions only** — no step-by-step wizard:

- **Objective scoring** — host marks who scored via Score Objective in host controls (available in all phases)
- **Command token redistribution** — each player adjusts their own tokens via My Panel +/- controls, then confirms via `game-update-command-tokens`
- **Planet readying** — happens automatically when `game-advance-phase` fires (not a player action)
- **Reveal next public objective** — host uses Reveal Objective in host controls

---

## Testing

**Unit — pure function:**
- `deriveActivePlayer(players, game)` — isolated function (not a hook); tests cover: correct player returned in initiative order, skips passed players, wraps around correctly, returns null when all passed, handles missing strategy cards

**Component rendering:**
- `ScoreboardSection` — active/passed/waiting badges render correctly; active player row highlighted; VP and strategy card displayed
- `MyPanelSection` — Pass and End Turn buttons shown only when `isActive=true`; token counts match props
- `ObjectivesSection` — renders revealed objectives; renders scorer names; renders empty state
- `HostControlsSection` — all buttons rendered when `isHost=true`; nothing interactive when `isHost=false`

**Integration — `useGame`:**
- Realtime update to `games.active_player_id` propagates correctly to component state
- `passAction` and `endTurn` wrappers call Edge Functions and handle errors

No Edge Function unit tests (consistent with Phases 1 and 2 — smoke tested manually post-deploy).
