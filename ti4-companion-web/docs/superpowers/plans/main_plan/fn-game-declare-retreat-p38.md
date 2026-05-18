# fn-game-declare-retreat-p38

**File:** `supabase/functions/game-declare-retreat/index.ts`
**Status:** Modify
**Prereqs:** fn-game-declare-retreat-p20

## Changes

### Bug fix — remove incorrect 2-hop DET extension (Phase 20 error)

```pseudocode
// REMOVE:
const maxHops = hasDarkEnergyTap ? 2 : 1
// REPLACE WITH:
const maxHops = 1
```

### Replace destination presence check with DET branch

```pseudocode
if hasDarkEnergyTap:
  // destination must be completely empty — no ships from any player
  allShipsInDest = query game_player_units
    WHERE game_id=game_id AND system_key=destination AND on_planet IS NULL
  if allShipsInDest.length > 0:
    ERR('Destination must be empty for Dark Energy Tap retreat', 409)
else:
  // standard check: player must have presence in destination
  unitsInDest = query game_player_units
    WHERE game_id + system_key=destination + player_id=player.id + on_planet IS NULL LIMIT 1
  planetsInDest = query game_player_planets
    WHERE game_id + system_key=destination + player_id=player.id LIMIT 1
  if unitsInDest.length === 0 AND planetsInDest.length === 0:
    ERR('No presence in destination system: no units or controlled planets', 409)
```

## Tests

```pseudocode
// tests/functions/game-declare-retreat.test.js additions

// Bug fix regressions
GIVEN no DET, destination 2 hops away → EXPECT 409 (was incorrectly 200 in Phase 20 impl)
GIVEN DET, destination 2 hops away → EXPECT 409 (range still 1 hop)

// DET empty-system retreat
GIVEN DET, destination 1 hop, destination completely empty → EXPECT 200
GIVEN DET, destination 1 hop, destination has any ships → EXPECT 409 'must be empty'

// Non-DET regressions (unchanged)
GIVEN no DET, destination 1 hop, own units in dest → EXPECT 200
GIVEN no DET, destination 1 hop, own planets in dest → EXPECT 200
GIVEN no DET, destination 1 hop, no own presence → EXPECT 409
```
