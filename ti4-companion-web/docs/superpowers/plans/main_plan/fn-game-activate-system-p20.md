# fn-game-activate-system-p20

**File:** `supabase/functions/game-activate-system/index.ts`
**Status:** Modify
**Prereqs:** migration-036-combat-action-cards

## Changes

### Phase 20 addition

When inserting the `game_combats` row, set `ships_moved_in = true` if the activating player moved at least one ship from another system into the combat system during this tactical action (i.e. the movement payload includes ships originating outside the active system).

```pseudocode
// In existing combat creation block, after determining attacker/defender:
shipsMovedIn = movementPayload.some(ship => ship.origin_system_key !== activatedSystemKey)
INSERT game_combats (..., ships_moved_in=shipsMovedIn)
```

Also set initial phase to `'window_pre_space_cannon'` (was `'space_cannon'`) so the new In The Silence Of Space window is offered before space cannon fires.

## Tests

```pseudocode
// Extend tests/functions/game-activate-system.test.js

GIVEN ships moved in from another system
  EXPECT game_combats.ships_moved_in=true
  EXPECT game_combats.phase='window_pre_space_cannon'

GIVEN activating player already had ships in system (no movement)
  EXPECT game_combats.ships_moved_in=false
```
