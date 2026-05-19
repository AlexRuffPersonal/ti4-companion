# fn-game-activate-system-p43c
**File:** `supabase/functions/game-activate-system/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c, fn-game-activate-system-p43a

## Changes
```pseudocode
// Before the "already has token" 409 check, check Mahact commander:
isMahact = player.faction === 'The Mahact Gene-Sorcerers' AND player.leaders?.commander === 'unlocked'
if isMahact AND system already has player's own token:
  // Allow activation: return both tokens to reinforcements, proceed
  await getHandler('mahact_il_na_viroset')(context, db)
  // skip the ERR 409 check below

// After existing activation logic, apply SYSTEM_ACTIVATED passives:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('SYSTEM_ACTIVATED', {
  gameId, activatingPlayerId: player.id, systemKey
}, db)
// Arborec: window if system has Arborec production unit
// Yssaril: window if system has Yssaril units
// Empyrean: window if system has Empyrean's command token (handled in SHIPS_MOVED in fn-game-move-ships)
// Mentak: window if won combat (checked post-combat, not here)

// Merge with reactive agent windows from p43a:
allWindows = [...existingReactiveAgentWindows, ...pendingWindows]
return okResponse({ ...result, pending_window: allWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Mahact commander — activate own-token system'):
  mock Mahact player with unlocked commander, system has their token
  EXPECT activation succeeds (no 409)
  EXPECT token returned to reinforcements

describe('Arborec commander — produce window emitted'):
  mock Arborec player with unlocked commander, system contains Arborec production unit
  another player activates that system
  EXPECT pending_window.type='commander_passive' for Arborec

describe('Yssaril commander — peek window emitted'):
  mock Yssaril with unlocked commander, activating player has system with Yssaril units
  EXPECT pending_window for hand peek
```
