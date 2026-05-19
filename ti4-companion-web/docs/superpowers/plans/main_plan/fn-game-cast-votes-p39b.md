# fn-game-cast-votes-p39b
**File:** `supabase/functions/game-cast-votes/index.ts`
**Status:** Modify
**Prereqs:** fn-game-cast-votes-p30, shared-promissoryEnforcement-p39a

## Functionality
- After vote is recorded, check getActiveNotes(gameId, db) for bloodPact
- For each bloodPact in_play: if holderPlayerId = activatingPlayerId OR ownerPlayerId = activatingPlayerId
  - Check if both holder and owner are voting for the same outcome this agenda
  - If so → add 4 bonus votes for the activating player (update game_agenda_votes vote_count += 4)

## Tests (game-cast-votes.phase39b.test.js)
- Blood Pact in_play, holder and Empyrean vote same outcome → +4 votes for holder
- Blood Pact in_play, holder and Empyrean vote different outcomes → no bonus
- Blood Pact not in_play → no bonus
