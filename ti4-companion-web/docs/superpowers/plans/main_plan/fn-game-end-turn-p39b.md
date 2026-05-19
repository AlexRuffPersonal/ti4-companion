# fn-game-end-turn-p39b
**File:** `supabase/functions/game-end-turn/index.ts`
**Status:** Modify
**Prereqs:** fn-game-end-turn-p30, shared-promissoryEnforcement-p39a

## Functionality
At start of player's turn (when game-end-turn runs for the PREVIOUS player, advancing to next):

**Cybernetic Enhancements (Model D, held):**
- getHeldNotes(gameId, 'Cybernetic Enhancements', db)
- For each where ownerPlayerId (L1Z1X) = the player about to act: origin −1 strategy token; holder +1 strategy token; returnNote

**Military Support (Sol, Model D, held):**
- getHeldNotes(gameId, 'Military Support', db)
- For each where ownerPlayerId (Sol) = the player about to act: origin −1 strategy token; holder places 2 infantry on chosen planet (selections.infantry_planet); returnNote

**Spy Net (Model D, held):**
- getHeldNotes(gameId, 'Spy Net', db)
- For each where holderPlayerId = the player about to act: look at ownerPlayerId's (Yssaril's) action card hand; holder steals 1 card (selections.stolen_card_id); returnNote

## Tests (game-end-turn.phase39b.test.js)
- Cybernetic Enhancements held, L1Z1X about to act → L1Z1X −1 strategy token; holder +1 strategy token; note returned
- Military Support held, Sol about to act → Sol −1 strategy token; holder gets 2 infantry; note returned
- Spy Net held, holder about to act → Yssaril card stolen; note returned
- No held notes → no effect
