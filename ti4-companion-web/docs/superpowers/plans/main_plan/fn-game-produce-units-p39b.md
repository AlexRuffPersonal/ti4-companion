# fn-game-produce-units-p39b
**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** Modify
**Prereqs:** fn-game-produce-units-p37, shared-promissoryEnforcement-p39a

## Functionality
- At start of production (before capacity check): getActiveNotes(gameId, db) for stymie
- If any stymie in_play: if activatingPlayerId = Arborec (note ownerPlayerId)
  - Check if production system contains holderPlayerId's units OR is adjacent to system with holder's units
  - If so → return 409 'Stymie prevents Arborec production in this system'

## Tests (game-produce-units.phase39b.test.js)
- Stymie in_play, Arborec produces in system with holder units → 409
- Stymie in_play, Arborec produces in system adjacent to holder units → 409
- Stymie in_play, non-Arborec player produces → no block
- Stymie not in_play → no block
