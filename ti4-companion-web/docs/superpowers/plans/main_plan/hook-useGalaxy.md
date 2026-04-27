# hook-useGalaxy
**File:** `src/hooks/useGalaxy.js`
**Status:** Modify
**Prereqs:** fn-game-move-ships, client-edgeFunctions

## Changes

### Phase 18 — Unit Transport

```js
// Add to imports:
import { moveShips as moveShipsFn } from '../lib/edgeFunctions.js'

// Add to return value:
moveShips: (payload) => moveShipsFn(gameId, payload),
```

## Tests

None — covered by GalaxyTab integration.
