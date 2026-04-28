# fn-game-cast-votes

**File:** `supabase/functions/game-cast-votes/index.ts`
**Status:** Modify
**Prereqs:** migration-035-ability-dsl-completions

## Changes

After loading `callerPlayer`, also select `vote_prevented` and reject if set:

```pseudocode
select 'id, vote_prevented' from game_players WHERE game_id, user_id
ERR 403 'It is not your turn to vote' if callerPlayer.id !== game.agenda_vote_current_player_id
ERR 409 'Your vote has been prevented' if callerPlayer.vote_prevented = true
// ... rest of existing vote logic unchanged
```

## Tests

Extend `tests/functions/game-cast-votes.test.js`:

```pseudocode
T409('Your vote has been prevented') — mock callerPlayer.vote_prevented=true
```
