# fn-game-advance-phase-p39b
**File:** `supabase/functions/game-advance-phase/index.ts`
**Status:** Modify
**Prereqs:** fn-game-advance-phase-p30, shared-promissoryEnforcement-p39a

## Functionality

**At status phase commodity replenish step — Trade Agreement (Model D, held):**
- After each player's commodities are replenished, getHeldNotes(gameId, 'Trade Agreement', db)
- For each: if note.ownerPlayerId = the player being replenished → transfer all owner's commodities to holder (owner commodities → 0, holder trade_goods += amount); returnNote

**At strategy phase start — Scepter of Dominion (Model D, held):**
- getHeldNotes(gameId, 'Scepter of Dominion', db)
- For each held note: flag in response that holder must place command token in chosen system; returnNote after placement (handled client-side prompt → separate action)
- NOTE: full implementation deferred to 39c handler; 39b just detects and returns note

**At strategy phase — Gift of Prescience (Model B, in_play):**
- getActiveNotes for giftOfPrescience
- If any in_play: strategy order inserts holder at initiative 0 (before all other picks); Naalu loses Telepathic (skip in strategy assignment)
- At status phase END: returnNote for giftOfPrescience

## Tests (game-advance-phase.phase39b.test.js)
- Status phase replenish: Trade Agreement held, owner replenished → commodities transferred; note returned
- Status phase replenish: Trade Agreement not held → no effect
- Strategy phase: Gift of Prescience in_play → holder priority 0 in order
- Status phase end: Gift of Prescience in_play → returned
