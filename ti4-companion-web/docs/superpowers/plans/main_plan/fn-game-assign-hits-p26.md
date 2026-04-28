# fn-game-assign-hits-p26
**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** shared-eliminationHandler

## Changes

```pseudocode
// At end of existing handler, after casualties are applied and before OK():
import { checkAndEliminate } from '../_shared/eliminationHandler.ts'

eliminatedPlayerIds = await checkAndEliminate(db, game_id)

// Include in success response:
OK({ ...existingResponse, eliminatedPlayerIds })
```

## Tests

```pseudocode
it('eliminatedPlayerIds included in response when a player meets §33.1 conditions after hit assignment')
it('eliminatedPlayerIds is empty array when no player is eliminated')
```
