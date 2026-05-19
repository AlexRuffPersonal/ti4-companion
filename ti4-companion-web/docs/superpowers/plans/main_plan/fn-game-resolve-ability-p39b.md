# fn-game-resolve-ability-p39b
**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** fn-game-resolve-ability-p30, shared-promissoryEnforcement-p39a

## Functionality
- At start of ability resolution: getActiveNotes(gameId, db)

**Alliance (Model B, in_play):**
- If ability_key = 'use_commander' AND activatingPlayerId = note.holderPlayerId for an alliance note
  - Allow holder to use ownerPlayerId's commander ability (fetch and apply owner's commander)

**Promise of Protection (Model B, in_play):**
- If ability_key = 'pillage' (Mentak) AND target = holderPlayerId of a promiseOfProtection note where ownerPlayerId = activatingPlayerId (Mentak)
  - Return 409 'Promise of Protection blocks Pillage'

**Antivirus (Model B, in_play):**
- If ability_key = 'technological_singularity' (Nekro) AND target = holderPlayerId of an antivirus note where ownerPlayerId = activatingPlayerId (Nekro)
  - Return 409 'Antivirus blocks Technological Singularity'

## Tests (game-resolve-ability.phase39b.test.js)
- Alliance in_play, holder uses commander → allowed
- Promise of Protection in_play, Mentak pillages holder → 409
- Antivirus in_play, Nekro targets holder with TS → 409
- No relevant notes in_play → no effect on ability resolution
