# fn-game-pass-action-window-p29b
**File:** `supabase/functions/game-pass-action-window/index.ts`
**Status:** Modify
**Prereqs:** migration-042-action-window, fn-game-pass-action-window

## Changes

Extend the Phase 20 function to handle game-level windows in addition to combat-level windows. Branch on presence of `combat_id` in the request body.

```pseudocode
// After existing CORS / AUTH / BODY / PLAYER:

if body.combat_id:
  // Phase 20 combat window path (unchanged)
  [existing combat window logic]
  return

// Phase 29b: game-level window path
GAME(pending_action_window)

ERR 409 'No active window' if game.pending_action_window is null
window = game.pending_action_window
ERR 409 'Not eligible for this window' if player.id NOT IN window.eligible_player_ids
ERR 409 'Already passed' if player.id IN window.passed_player_ids

updatedPassed = [...window.passed_player_ids, player.id]
if updatedPassed.length === window.eligible_player_ids.length:
  UPDATE games SET pending_action_window=null WHERE id=gameId
else:
  UPDATE games SET pending_action_window={ ...window, passed_player_ids: updatedPassed }

OK({})
```

## Tests

Extend `tests/functions/game-pass-action-window.test.js`:
```pseudocode
it('uses combat path when combat_id provided (existing tests unaffected)')
it('409 if no pending_action_window and no combat_id')
it('409 if player not in eligible_player_ids')
it('409 if player already in passed_player_ids')
GIVEN last eligible player passes
  EXPECT pending_action_window set to null
GIVEN not last eligible player passes
  EXPECT pending_action_window updated with player added to passed_player_ids
```
