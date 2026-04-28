# fn-game-declare-retreat-p20

**File:** `supabase/functions/game-declare-retreat/index.ts`
**Status:** Modify
**Prereqs:** migration-036-combat-action-cards

## Changes

### Phase 20 addition — Dark Energy Tap extended retreat range

When validating the retreat destination, check if the retreating player has Dark Energy Tap technology. If so, allow destinations up to 2 hops away instead of 1.

```pseudocode
// In existing retreat destination validation block:
retreatingPlayer = query game_players WHERE id=retreat_declared_by, SELECT technologies
hasDarkEnergyTap = retreatingPlayer.technologies.includes('Dark Energy Tap')
maxHops = hasDarkEnergyTap ? 2 : 1

// Replace existing adjacency check:
// OLD: isAdjacent(combat.system_key, destination_system_key, game.map_tiles, wormholes)
// NEW:
isValidDest = isWithinHops(combat.system_key, destination_system_key, maxHops, game.map_tiles, wormholes)
if !isValidDest: ERR('Invalid retreat destination', 409)
```

`isWithinHops(from, to, maxHops, mapTiles, wormholes)` — performs BFS up to `maxHops` steps; reuses the existing axial-neighbor + wormhole logic already present in the function.

## Tests

```pseudocode
// Extend tests/functions/game-declare-retreat.test.js

GIVEN retreating player has Dark Energy Tap, destination 2 hops away
  EXPECT retreat accepted

GIVEN retreating player has Dark Energy Tap, destination 3 hops away
  EXPECT 409

GIVEN retreating player does NOT have Dark Energy Tap, destination 2 hops away
  EXPECT 409

GIVEN no Dark Energy Tap, destination 1 hop away
  EXPECT retreat accepted (regression)
```
