# fn-game-create-transaction-p39b
**File:** `supabase/functions/game-create-transaction/index.ts`
**Status:** Modify
**Prereqs:** fn-game-confirm-transaction-p15, shared-promissoryEnforcement-p39a

## Functionality
- At neighbor-adjacency check (where game blocks non-neighbor transactions):
  - getActiveNotes(gameId, db) for tradeConvoys
  - If any tradeConvoys entry has holderPlayerId = one of the transaction parties → skip neighbor check, allow transaction

## Tests (game-create-transaction.phase39b.test.js)
- Trade Convoys in_play for initiating player → non-neighbor transaction allowed
- Trade Convoys not in_play → non-neighbor transaction blocked (existing behavior)
