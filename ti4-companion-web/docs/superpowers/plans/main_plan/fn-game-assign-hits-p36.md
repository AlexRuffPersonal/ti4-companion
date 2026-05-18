# fn-game-assign-hits-p36
**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** migration-046-objective-conditions

## Changes

```pseudocode
// When a unit is destroyed (count reaches 0 or row deleted), if it is a ship (non-planet unit):
  side = (destroyed player is attacker) ? 'attacker' : 'defender'
  unitSlug = unit_type slug (e.g. 'fighter', 'destroyer', 'cruiser')

  // Update ships_destroyed JSONB on the game_combats row:
  current = combat.ships_destroyed[side][unitSlug] ?? 0
  combat.ships_destroyed[side][unitSlug] = current + destroyedCount

  UPDATE game_combats SET ships_destroyed = updated WHERE id = combat.id
```

## Tests

```pseudocode
STD_MOCKS

it('increments attacker ships_destroyed when attacker unit is destroyed')
  mock: attacker loses 2 fighters
  EXPECT game_combats.ships_destroyed.attacker.fighter = 2

it('increments defender ships_destroyed when defender unit is destroyed')
  mock: defender loses 1 cruiser
  EXPECT game_combats.ships_destroyed.defender.cruiser = 1

it('accumulates across multiple destroy calls in same combat')
  mock: two separate hit assignments destroying 1 destroyer each
  EXPECT ships_destroyed.attacker.destroyer = 2

it('does not update ships_destroyed for ground force hits (on_planet units)')
  mock: infantry destroyed
  EXPECT ships_destroyed unchanged
```
