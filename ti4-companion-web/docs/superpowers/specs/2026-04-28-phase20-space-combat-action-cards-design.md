# Phase 20: Space Combat Action Cards Design

## Overview

Adds 14 space-combat-timing action cards to the combat system, plus Dark Energy Tap technology support for extended retreat range. Implemented via explicit action-card windows inserted into the existing `game_combats` phase state machine. Both players see a simultaneous "Play a card or Pass" prompt at each window; the window closes once both have passed.

**Cards in scope:**
Shields Holding, Maneuvering Jets, Direct Hit, Emergency Repairs, Courageous To The End, Morale Boost, Fighter Prototype, Waylay, Skilled Retreat, Rout, Intercept, Salvage, Experimental Battlestation, In The Silence Of Space.

**Rules basis:** LRR §2.6b (multiple same-name cards), §2.7 (discard on play), §2.8 (canceled cards); LRR FAQ: Skilled Retreat is not a retreat (Intercept does not apply); Courageous To The End does not produce hits (Sustain Damage cannot be used against it); Experimental Battlestation only fires if ships actually moved into the system and only targets the active player's ships.

---

## Database Schema — Migration 036

### `game_combats` — new columns

```sql
ALTER TABLE game_combats
  ADD COLUMN window_passes       JSONB NOT NULL DEFAULT '{"attacker": false, "defender": false}',
  ADD COLUMN pending_effects     JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN sustained_this_phase JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN destroyed_this_phase JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN ships_moved_in      BOOLEAN NOT NULL DEFAULT false;
```

**`window_passes`** — `{ attacker: bool, defender: bool }`. Reset to `{attacker: false, defender: false}` each time a new window phase is entered.

**`pending_effects`** — accumulates modifiers from played cards, consumed by the next step. Keys:
```
morale_boost_attacker: int      — +N to attacker die results this round
morale_boost_defender: int      — +N to defender die results this round
fighter_prototype_attacker: bool — +2 to attacker fighter rolls (round 1 only)
fighter_prototype_defender: bool — +2 to defender fighter rolls (round 1 only)
shields_holding_attacker: int   — cancel up to N hits before attacker assigns
shields_holding_defender: int   — cancel up to N hits before defender assigns
waylay_attacker: bool           — attacker AFB hits apply to all ships
waylay_defender: bool           — defender AFB hits apply to all ships
rout_active: bool               — defender forced attacker to retreat this round
silent_space_system: text       — system key added to space cannon opportunities
```
Reset to `{}` at the end of each round (after `attacker_assign` resolves).

**`sustained_this_phase`** — `[{ player_id, unit_id, unit_type }]`. Populated during hit assignment when a player chooses Sustain. Direct Hit reads this to identify valid targets. Reset to `[]` after `window_post_sustain` resolves.

**`destroyed_this_phase`** — `[{ player_id, unit_id, unit_type, combat_value }]`. Populated when a unit is destroyed during hit assignment. Courageous To The End reads this. Reset to `[]` after `window_post_destroy` resolves.

**`ships_moved_in`** — set to `true` by `game-activate-system` when the activating player moved at least one ship into the system. Experimental Battlestation is invalid if `false`.

---

## Combat State Machine — Full Phase Sequence

New window phases are prefixed `window_`. Each window phase requires both players to pass before advancing. Round-effect keys in `pending_effects` are cleared after being consumed.

```
[activation]
  game-activate-system sets ships_moved_in, creates game_combats row

  → window_pre_space_cannon
      eligible cards: In The Silence Of Space (attacker or defender — choose 1 system;
                        that system's ships join space cannon opportunities for this
                        tactical action; must be played before space cannon fires)

space_cannon  (existing — space cannon opportunities resolved)
  → window_space_cannon_assign
      eligible cards: Maneuvering Jets (cancel 1 space cannon hit, defender only)
                      Experimental Battlestation (fire space dock space cannon vs attacker,
                        only if ships_moved_in = true)
  → [space cannon hits applied to game_player_units]

  → window_pre_barrage
      eligible cards: Waylay (before AFB roll — hits vs all ships, not just fighters)
  → barrage  (existing)
  → [AFB hits applied]

  ┌─── ROUND LOOP ──────────────────────────────────────────────────────────────┐
  │                                                                             │
  │  window_start_round                                                         │
  │      eligible cards: Morale Boost (either player, +1 all rolls this round) │
  │                       Fighter Prototype (either, +2 fighter rolls, round 1) │
  │                       Skilled Retreat (either — move all ships to adjacent  │
  │                         enemy-free system; NOT a retreat; Intercept does    │
  │                         not apply; combat ends)                             │
  │                       Emergency Repairs (either — repair all sustained      │
  │                         units in system)                                    │
  │                                                                             │
  │  [announce retreats step — existing]                                        │
  │  window_announce_retreat                                                    │
  │      eligible cards: Rout (defender only — force attacker to retreat        │
  │                        if able; sets rout_active in pending_effects)        │
  │                       Intercept (non-retreating player only — cancel        │
  │                        opponent's declared retreat for this round;          │
  │                        nullifies retreat_declared_by)                       │
  │                                                                             │
  │  attacker_roll  (applies morale_boost_attacker, fighter_prototype_attacker) │
  │                                                                             │
  │  window_pre_assign_defender                                                 │
  │      eligible cards: Shields Holding (defender only — cancel up to 2 hits  │
  │                        against defender's ships from attacker's roll)       │
  │                                                                             │
  │  defender_assign  (hits reduced by shields_holding_defender first)          │
  │      ↳ each Sustain → append to sustained_this_phase                       │
  │          → window_post_sustain                                              │
  │              eligible cards: Direct Hit (attacker — target a unit in        │
  │                sustained_this_phase; destroy it; Sustain Damage cannot      │
  │                prevent this)                                                │
  │      ↳ each Destroy → append to destroyed_this_phase                       │
  │          → window_post_destroy  (runs after window_post_sustain)            │
  │              eligible cards: Courageous To The End (destroyed unit's owner  │
  │                — roll 2 dice vs that ship's combat value; each hit forces   │
  │                opponent to assign 1 hit; forced hits cannot be Sustained    │
  │                per LRR FAQ §1945)                                           │
  │                                                                             │
  │  defender_roll  (applies morale_boost_defender, fighter_prototype_defender) │
  │                                                                             │
  │  window_pre_assign_attacker                                                 │
  │      eligible cards: Shields Holding (attacker)                             │
  │                                                                             │
  │  attacker_assign  (same Sustain/Destroy sub-windows as defender_assign)     │
  │                                                                             │
  │  [end-of-round: clear pending_effects; check win/retreat; increment round]  │
  │  → loop or complete                                                         │
  └─────────────────────────────────────────────────────────────────────────────┘

complete
  → window_post_combat
      eligible cards: Salvage (winner only — transfer loser's commodities)
  → [combat dismissed]
```

---

## Edge Functions

### New: `game-play-combat-action-card`

**Body:** `{ game_code, combat_id, card_id, targets? }`

`targets` shape varies by card:
- Direct Hit: `{ unit_id }` — must appear in `sustained_this_phase`
- Skilled Retreat: `{ destination_system_key }` — adjacent, no enemy ships
- Experimental Battlestation: `{ space_dock_unit_id }` — must be in or adjacent to combat system
- In The Silence Of Space: `{ system_key }` — the system whose ships join space cannon

**Validation (all cards):**
- Player holds `card_id` in `game_player_action_cards`
- `game_combats.phase` matches card timing
- Same-name rule (LRR §2.6b): reject if another card with the same name was already played this window targeting the same unit/game effect; allow if targeting a different entity
- Player has not already passed this window (`window_passes[side] = false`)

**Per-card validation and effect:**

| Card | Extra validation | Effect |
|------|-----------------|--------|
| Morale Boost | — | `pending_effects.morale_boost_{side} += 1` |
| Fighter Prototype | round = 1 | `pending_effects.fighter_prototype_{side} = true` |
| Shields Holding | — | `pending_effects.shields_holding_{side} += 2` |
| Waylay | phase = `window_pre_barrage` | `pending_effects.waylay_{side} = true` |
| Maneuvering Jets | phase = `window_space_cannon_assign` | decrement target player's pending space cannon hits by 1 |
| Emergency Repairs | — | bulk-set `damaged = false` for player's units in combat system |
| Direct Hit | `unit_id` in `sustained_this_phase`; card played by player whose units produced the hit | destroy the targeted unit (`game_player_units` count decremented or row deleted); re-evaluate win condition |
| Skilled Retreat | destination adjacent, no enemy ships | move all player's ships to destination; insert `game_system_tokens` CC row; set `status = complete` |
| Rout | player is defender; phase = `window_announce_retreat` | `pending_effects.rout_active = true` |
| Intercept | opponent has `retreat_declared_by` set | nullify `retreat_declared_by` and `retreat_destination` |
| Courageous To The End | one of player's ships in `destroyed_this_phase` | roll 2 dice server-side vs destroyed ship's combat value; for each hit, increment opponent's pending hits; forced hits flagged `sustain_allowed: false` |
| Experimental Battlestation | `ships_moved_in = true`; space dock in/adjacent to system; phase = `window_space_cannon_assign` | fire space dock's space cannon dice vs attacker fleet; add hits to attacker's pending space cannon hits |
| In The Silence Of Space | chosen system contains player's ships; phase = `window_pre_space_cannon` | `pending_effects.silent_space_system = system_key`; re-run space cannon opportunity discovery including that system before `space_cannon` phase begins |
| Salvage | `winner_player_id = caller`; phase = `window_post_combat` | transfer loser's `commodities` to winner's `game_players` row |

Discards `card_id` from `game_player_action_cards` after applying. Resets opponent's `window_passes` entry to `false` (opponent may respond).

---

### New: `game-pass-action-window`

**Body:** `{ game_code, combat_id }`

Sets `window_passes[side] = true`. When both sides are `true`:
- If current phase has queued sub-windows (e.g. both `window_post_sustain` and `window_post_destroy` pending), advance to the next sub-window
- Otherwise advance to the next non-window phase via `advanceFromWindow()`

`advanceFromWindow()` clears `sustained_this_phase` / `destroyed_this_phase` / `window_passes` as appropriate and writes the next phase.

---

### Modified: `game-activate-system`

Sets `ships_moved_in = true` on the new `game_combats` row when the activating player moved at least one ship from another system into the combat system during this tactical action.

---

### Modified: `game-roll-combat-dice`

Before rolling, reads and applies:
- `morale_boost_{side}`: add N to each die result after rolling
- `fighter_prototype_{side}`: add 2 to each fighter die result (round 1 only)

Clears those keys from `pending_effects` after the roll. Transitions phase to the appropriate `window_pre_assign_*`.

AFB path: if `waylay_{side}` is set, AFB hits are produced against all ship types (not just fighters). Clears `waylay_{side}` after rolling.

---

### Modified: `game-assign-hits`

Before processing casualties, reduce `hits` by `shields_holding_{side}` from `pending_effects` (minimum 0). Clear that key.

Forced hits from Courageous To The End arrive with `sustain_allowed: false`; reject any sustain assignment for those specific hits.

For each casualty in the list:
- `sustain` → set `game_player_units.damaged = true`; append `{ player_id, unit_id, unit_type }` to `sustained_this_phase`
- `destroy` → decrement/delete `game_player_units` row; append `{ player_id, unit_id, unit_type, combat_value }` to `destroyed_this_phase`

After processing: if `sustained_this_phase` is non-empty, transition to `window_post_sustain`; else if `destroyed_this_phase` is non-empty, transition to `window_post_destroy`; else advance normally.

---

### Modified: `game-declare-retreat`

When validating retreat destination, if the retreating player has the **Dark Energy Tap** technology (check `game_players.technologies` array), extend the valid destination range from 1 hop to 2 hops (axial distance ≤ 2 or connected via wormhole within 2 steps).

---

## React Components & Hooks

### `useCombat` (modified)

New dispatchers: `playActionCard(cardId, targets?)`, `passActionWindow()`.

New derived state:
- `isWindowPhase: boolean` — true when `combat.phase` starts with `window_`
- `windowCards: ActionCard[]` — cards in the local player's hand legal for the current window phase
- `windowPasses: { attacker: bool, defender: bool }` — from `combat.window_passes`
- `localPlayerPassed: boolean` — whether local player has already passed this window

---

### `ActionCardWindowPanel` (new)

Rendered inside `CombatModal` when `isWindowPhase` is true. Contains:
- Window title (e.g. "Start of Round — play a card or pass")
- Eligible card chips (derived from `windowCards`); tapping a chip either plays it immediately (no-target cards) or opens an inline target picker
- Target pickers per card type:
  - Direct Hit → list of units in `sustained_this_phase`
  - Skilled Retreat → list of valid adjacent enemy-free systems
  - Experimental Battlestation → list of eligible space docks
  - In The Silence Of Space → system picker (systems with player's ships)
- **Pass** button; disabled once `localPlayerPassed` is true
- "Waiting for opponent…" indicator when local player has passed but opponent hasn't

Slides in above `FleetDisplay` without replacing it — both players see fleet state while deciding.

---

### `CombatModal` (modified)

Phase-to-subpanel mapping: any phase starting with `window_` renders `ActionCardWindowPanel` above existing content. All other phases unchanged.

---

### `edgeFunctions.js` (modified)

Adds:
```js
playCombatActionCard(combatId, cardId, targets)  // → game-play-combat-action-card
passActionWindow(combatId)                        // → game-pass-action-window
```

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/036_combat_action_cards.sql` | Create |
| `supabase/functions/game-play-combat-action-card/index.ts` | Create |
| `supabase/functions/game-pass-action-window/index.ts` | Create |
| `supabase/functions/game-activate-system/index.ts` | Modify — set `ships_moved_in` |
| `supabase/functions/game-roll-combat-dice/index.ts` | Modify — read `pending_effects` modifiers |
| `supabase/functions/game-assign-hits/index.ts` | Modify — shields, sustain/destroy tracking, forced hits |
| `supabase/functions/game-declare-retreat/index.ts` | Modify — Dark Energy Tap 2-hop range |
| `src/hooks/useCombat.js` | Modify — new dispatchers + derived window state |
| `src/components/game/ActionCardWindowPanel.jsx` | Create |
| `src/components/game/CombatModal.jsx` | Modify — render ActionCardWindowPanel |
| `src/lib/edgeFunctions.js` | Modify — add 2 wrappers |
| `tests/functions/game-play-combat-action-card.test.js` | Create |
| `tests/functions/game-pass-action-window.test.js` | Create |
| `tests/functions/game-assign-hits.test.js` | Modify |
| `tests/functions/game-roll-combat-dice.test.js` | Modify |
| `tests/functions/game-declare-retreat.test.js` | Modify |
| `tests/functions/game-activate-system.test.js` | Modify |
| `tests/hooks/useCombat.test.js` | Modify |
| `tests/components/game/ActionCardWindowPanel.test.jsx` | Create |
| `tests/components/game/CombatModal.test.jsx` | Modify |
| `tests/lib/edgeFunctions.phase20.test.js` | Create |

---

## Deferred

- **Sabotage** — cancel another player's action card; requires a card-cancellation handshake between players during any timing window
- **Faction abilities with combat timing** (Ambush, Devotion, Dimensional Splicer) — Direct Hit already supports them per rules, but triggering them requires faction-ability system wiring
- **Courageous To The End chaining** — if the forced hits from Courageous destroy a ship that also has Courageous To The End, the chain resolves recursively; defer until recursion depth is a practical concern
