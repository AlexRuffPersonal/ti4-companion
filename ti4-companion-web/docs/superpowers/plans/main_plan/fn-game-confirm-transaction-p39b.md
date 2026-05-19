# fn-game-confirm-transaction-p39b
**File:** `supabase/functions/game-confirm-transaction/index.ts`
**Status:** Modify
**Prereqs:** fn-game-confirm-transaction-p15, shared-promissoryEnforcement-p39a

## Functionality
- After note transfer loop (Model A, already handles SftT+Alliance hardcoded):
  - Add Dark Pact enforcement:
    - getActiveNotes(gameId, db) to find darkPact in_play entries
    - For each darkPact note: note.ownerPlayerId = Empyrean (origin); note.holderPlayerId = holder
    - If this tx transfers commodities FROM holder TO owner, AND amount >= owner's commodity_max → both +1 TG
    - Query game_players for owner's commodity_max to compare

## Tests (game-confirm-transaction.phase39b.test.js)
- Dark Pact in_play, holder → Empyrean with max commodities → both +1 TG
- Dark Pact in_play, holder → Empyrean below max → no bonus
- Dark Pact not in_play → no bonus
