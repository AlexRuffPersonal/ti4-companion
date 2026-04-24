# Space Combat Design — Phase 10

## Overview

Adds a full server-authoritative space combat system to the Galaxy tab. Triggered when a player activates a system containing enemy ships. Covers Space Cannon Offense (pre-combat), Anti-Fighter Barrage (round 1 only), sequential dice rolling, hit assignment with Sustain Damage, and retreat with CC placement.

---

## Database Schema

### New table: `game_combats`

```sql
CREATE TABLE game_combats (
  id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                   UUID    NOT NULL REFERENCES games(id),
  system_key                TEXT    NOT NULL,
  attacker_player_id        UUID    NOT NULL REFERENCES game_players(id),
  defender_player_id        UUID    NOT NULL REFERENCES game_players(id),
  round                     INTEGER NOT NULL DEFAULT 1,
  phase                     TEXT    NOT NULL DEFAULT 'space_cannon',
  space_cannon_pending      JSONB,  -- [{player_id, system_key, unit_type, dice_count, resolved}]
  attacker_dice             JSONB,  -- [{unit_type, roll, hit}]
  defender_dice             JSONB,
  attacker_hits             INTEGER NOT NULL DEFAULT 0,
  defender_hits             INTEGER NOT NULL DEFAULT 0,
  retreat_declared_by       UUID    REFERENCES game_players(id),
  retreat_destination       TEXT,
  status                    TEXT    NOT NULL DEFAULT 'active',
  winner_player_id          UUID    REFERENCES game_players(id),
  created_at                TIMESTAMPTZ DEFAULT now()
);
```

**Phase state machine:**
- `space_cannon` → (when all opportunities resolved or none present) → `barrage` or `attacker_roll`
- Round 1: `barrage` → `attacker_roll` → `defender_assign` → `defender_roll` → `attacker_assign`
- Round 2+: `attacker_roll` → `defender_assign` → `defender_roll` → `attacker_assign`
- `space_cannon` phase is skipped (advance immediately) if no eligible Space Cannon units exist
- `barrage` phase is skipped on round 1 if neither player has Destroyers in the system
- Loop repeats until one side reaches 0 ships or a retreat executes; then `complete`

### Modified table: `game_player_units`

Add column: `damaged BOOLEAN NOT NULL DEFAULT false`

Tracks Sustain Damage state per unit row. Reset to `false` for all units in the game when the status phase begins.

### New table: `game_system_tokens`

Tracks non-activation command tokens placed in systems (e.g. retreat CCs).

```sql
CREATE TABLE game_system_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID NOT NULL REFERENCES games(id),
  system_key  TEXT NOT NULL,
  player_id   UUID NOT NULL REFERENCES game_players(id),
  token_type  TEXT NOT NULL DEFAULT 'retreat_cc',
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## Edge Functions

### `game-activate-system` (modified)

Two new responsibilities run before the activation record is inserted:

1. **Combat creation + Space Cannon** — immediately inserts a `game_combats` row with phase `space_cannon`. Queries `game_player_units` for units with `space_cannon` ability in the activated system and all adjacent systems (axial neighbors + wormhole-connected systems via `game_system_state`). Stores opportunities as `space_cannon_pending` JSONB: `[{player_id, system_key, unit_type, dice_count, resolved: false}]`. If no eligible units exist, advances phase to `barrage` or `attacker_roll` immediately.

2. **If no enemy ships present** — activation proceeds normally with no combat record created.

**Space Cannon targeting rules:** the active player's Space Cannon targets the defender's ships in the activated system; all other players' Space Cannon targets the active player's ships.

### `game-fire-space-cannon` (new)

Called by each eligible player to fire or pass their Space Cannon opportunity. Rolls dice server-side, applies hits to the target fleet in `game_player_units`, and marks that player's entry in `space_cannon_pending` as `resolved: true`. When all entries are resolved, advances `game_combats.phase` to `barrage` (if Destroyers present) or `attacker_roll`.

### `game-roll-combat-dice` (new)

Called by the player whose roll phase it is (`attacker_roll` or `defender_roll`). Fetches their unit counts from `game_player_units`, looks up each unit's combat value from the `units` reference table, rolls a d10 per unit server-side, stores results as `attacker_dice` / `defender_dice` JSONB, counts hits, and advances phase to the opponent's assign step.

Barrage (round 1 only): Destroyers roll their Anti-Fighter Barrage dice against the opponent's fighters before the main combat roll. AFB hits are applied immediately and reduce fighter counts before `attacker_roll` begins.

### `game-assign-hits` (new)

Called with a casualties list: `[{ unit_type, player_unit_id, action: "destroy" | "sustain" }]`.

**Validation:**
- Correct number of hits assigned (matches `attacker_hits` or `defender_hits`)
- `sustain` only accepted for units with Sustain Damage ability
- `sustain` rejected for already-damaged units (`damaged = true`)
- Optional `modifiers` array reserved for future action card integration (Direct Hit, Maneuvering Jets)

**On application:**
- Destroyed units: decrement count in `game_player_units`; remove row if count reaches 0
- Sustained units: set `damaged = true`

**End-of-round logic:**
- If `retreat_declared_by` is set after the `attacker_assign` step: move surviving ships to `retreat_destination`, insert a `game_system_tokens` row (retreat CC), mark combat `complete`
- If either side has 0 ships: set `winner_player_id`, mark combat `complete`
- Otherwise: advance phase (after `attacker_assign` → increment round, reset to `attacker_roll` or `barrage` only on round 1)

### `game-declare-retreat` (new)

Validates the proposed `retreat_destination`:
- Exists in `games.map_tiles`
- Adjacent to the combat system (axial neighbors + wormhole connections)
- Retreating player has units or controlled planets in that system
- Retreating player has at least one CC available in reinforcements

If valid, sets `retreat_declared_by` and `retreat_destination` on the `game_combats` row. Can be called by either player before their roll phase in any round.

### `game-advance-phase` (modified)

When transitioning into the status phase: bulk-updates `game_player_units` to set `damaged = false` for all units in the game. One UPDATE, no new function needed.

---

## React Components + Hooks

### `useCombat(gameCode, combatId)`

Subscribes to the `game_combats` row via Realtime. Exposes combat state and dispatchers: `rollDice()`, `assignHits(casualties)`, `declareRetreat(destination)`. Used by `GalaxyTab`.

### `useGalaxy` (modified)

Gains a `game_combats` Realtime subscription (subscribes to the active combat row by `game_id`). Passes `activeCombat` to `GalaxyTab`. `SpaceCannonModal` derives its visibility from `activeCombat.phase === 'space_cannon'`.

### `CombatModal`

Top-level modal over the galaxy map. Layout: both fleets side-by-side (attacker left, defender right), action panel below. Phase drives which sub-panel is active. Closes only when `combat.status === 'complete'`, showing a brief result screen (winner, round count) before closing.

### `FleetDisplay`

Renders one player's fleet as unit chips. Damaged units shown with amber border + ⚡ icon. In hit-assignment phases the *receiving* player's chips are interactive: tap cycles neutral → sustain (amber, eligible undamaged units only) → destroy (red ✕) → neutral. Confirm button enabled only when all hits are assigned.

### `DiceResultsPanel`

Shown after rolling. Displays each die result grouped by unit type. Green highlight for hits, grey for misses. Visible to both players via Realtime.

### `SpaceCannonModal`

Shown when `activeCombat.phase === 'space_cannon'`. Each player sees only their own unresolved entry in `space_cannon_pending` (unit, location, dice count) and fires or passes via `game-fire-space-cannon`. Players with no entry see a waiting state. Dismisses automatically when phase advances.

### `RetreatDestinationPicker`

Shown inline in `CombatModal` when Declare Retreat is tapped. Lists valid adjacent systems where the retreating player has units/planets and a CC available. Selecting one calls `declareRetreat(destination)`.

### `GalaxyTab` (modified)

Renders `SpaceCannonModal` when `activeCombat.phase === 'space_cannon'`, then `CombatModal` for all subsequent phases.

### `edgeFunctions.js` (modified)

Adds: `fireSpaceCannon`, `rollCombatDice`, `assignHits`, `declareRetreat`.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/007_combat.sql` | Create |
| `supabase/functions/game-activate-system/index.ts` | Modify |
| `supabase/functions/game-fire-space-cannon/index.ts` | Create |
| `supabase/functions/game-roll-combat-dice/index.ts` | Create |
| `supabase/functions/game-assign-hits/index.ts` | Create |
| `supabase/functions/game-declare-retreat/index.ts` | Create |
| `supabase/functions/game-advance-phase/index.ts` | Modify |
| `src/hooks/useCombat.js` | Create |
| `src/hooks/useGalaxy.js` | Modify |
| `src/components/game/CombatModal.jsx` | Create |
| `src/components/game/FleetDisplay.jsx` | Create |
| `src/components/game/DiceResultsPanel.jsx` | Create |
| `src/components/game/SpaceCannonModal.jsx` | Create |
| `src/components/game/RetreatDestinationPicker.jsx` | Create |
| `src/components/game/GalaxyTab.jsx` | Modify |
| `src/lib/edgeFunctions.js` | Modify |
| `tests/functions/game-activate-system.test.js` | Modify |
| `tests/functions/game-fire-space-cannon.test.js` | Create |
| `tests/functions/game-roll-combat-dice.test.js` | Create |
| `tests/functions/game-assign-hits.test.js` | Create |
| `tests/functions/game-declare-retreat.test.js` | Create |
| `tests/functions/game-advance-phase.test.js` | Modify |
| `tests/hooks/useCombat.test.js` | Create |
| `tests/hooks/useGalaxy.test.js` | Modify |
| `tests/components/game/CombatModal.test.jsx` | Create |
| `tests/components/game/FleetDisplay.test.jsx` | Create |
| `tests/components/game/DiceResultsPanel.test.jsx` | Create |
| `tests/components/game/SpaceCannonModal.test.jsx` | Create |
| `tests/components/game/RetreatDestinationPicker.test.jsx` | Create |
| `tests/lib/edgeFunctions.phase10.test.js` | Create |

---

## Deferred (POTENTIAL_TODOS)

- **Trade not firing Space Cannon** — diplomatic deal / promissory note to pre-agree not to fire
- **Per-unit hit tracking in dice rolls** — store which unit generated each hit (prerequisite for Direct Hit action card)
- **Direct Hit action card** — cancel Sustain Damage during hit assignment
- **Maneuvering Jets action card** — cancel one hit during assignment
- **Dark Energy Tap** — +1 movement extending valid retreat range to 2 hops
- **Skilled Retreat action card** — retreat to enemy-free adjacent system; draw outcome; CC from reinforcements (same CC rule as normal retreat, different destination validation and outcome)
