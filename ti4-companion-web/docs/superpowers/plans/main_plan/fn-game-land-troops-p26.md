# fn-game-land-troops-p26
**File:** `supabase/functions/game-land-troops/index.ts`
**Status:** Modify
**Prereqs:** shared-eliminationHandler

## Changes

```pseudocode
// At end of existing handler, after invasion outcome is resolved and before OK():
import { checkAndEliminate } from '../_shared/eliminationHandler.ts'

eliminatedPlayerIds = await checkAndEliminate(db, game_id)

// Include in success response:
OK({ ...existingResponse, eliminatedPlayerIds })
```

## Tests

```pseudocode
it('eliminatedPlayerIds included in response when defender loses last planet and units in invasion')
it('eliminatedPlayerIds is empty array when defender retains planets or units')
```
