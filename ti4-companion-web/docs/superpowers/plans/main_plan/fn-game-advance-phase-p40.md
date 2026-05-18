# fn-game-advance-phase-p40
**File:** `supabase/functions/game-advance-phase/index.ts`
**Status:** Modify
**Prereqs:** shared-lawEffects, migration-049-law-enforcement

## Functionality
- During status-phase command token distribution step:
  - Build playerUpdates array: { playerId, tokenGain } for each player (existing logic)
  - Pass through applyStatusPhaseLaws(db, gameId, playerUpdates) → may cap tokenGain at 3
  - Use returned (possibly modified) array for DB writes
- During strategy-phase start step:
  - UPDATE game_players SET minister_of_war_unlocked = false WHERE game_id = gameId (reset each round)

## Tests
- Executive Sanctions active: player would receive 5 tokens → capped to 3
- No Executive Sanctions: token gain unchanged
- Strategy phase advance: minister_of_war_unlocked reset to false for all players
