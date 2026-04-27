# fn-game-confirm-transaction (Phase 15 additions)
**File:** `supabase/functions/game-confirm-transaction/index.ts`
**Status:** Modify
**Prereqs:** migration-032-promissory-effects

## Changes
```pseudocode
In note transfer loop (for each promissory note being sent):
  join promissory_notes on note_id to get name
  IF name = 'Support For The Throne':
    set state='in_play' (not 'held')
    grant recipient 1 VP: fetch current vp, update with vp+1 (NOT db.raw)
  ELIF name = 'Alliance':
    set state='in_play'
  ELSE:
    state='held', held_by_player_id=recipient (existing behavior)

Replace all remaining 'played' state references with 'in_play'.
```

## Tests
Existing test file: `tests/functions/game-confirm-transaction.test.js`

```pseudocode
GIVEN transaction includes Support For The Throne note:
  EXPECT note state='in_play'
  EXPECT recipient vp incremented by 1
GIVEN transaction includes Alliance note:
  EXPECT note state='in_play'
GIVEN transaction includes non-auto-fire note:
  EXPECT note state='held', held_by=recipient
```
