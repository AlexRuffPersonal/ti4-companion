# fn-game-research-technology-p39b
**File:** `supabase/functions/game-research-technology/index.ts`
**Status:** Modify
**Prereqs:** fn-game-research-technology-p30, shared-promissoryEnforcement-p39a

## Functionality
- After technology is granted to activatingPlayerId: getHeldNotes(gameId, 'Research Agreement', db)
- For each held note where ownerPlayerId (Jol-Nar) = activatingPlayerId:
  - If the researched tech is NOT a faction-specific tech:
    - Grant the same technology to holderPlayerId (append to game_players.technologies)
    - returnNote

## Tests (game-research-technology.phase39b.test.js)
- Research Agreement held, Jol-Nar researches non-faction tech → holder also gets tech; note returned
- Research Agreement held, Jol-Nar researches faction tech → no grant
- Research Agreement not held → no effect
