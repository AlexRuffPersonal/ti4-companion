# fn-game-shuffle-exploration-deck
**File:** `supabase/functions/game-shuffle-exploration-deck/index.ts`
**Status:** New
**Prereqs:** migration-034-exploration

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, deck_type)
GAME(); PLAYER

ERR 400 'Invalid deck_type' if deck_type NOT IN ['cultural','hazardous','industrial','frontier']

// Fetch discarded rows for this deck
discards = select game_exploration_decks where game_id + deck_type + state='discarded'
ERR 409 'No discards to shuffle' if discards empty

// Assign random deck_position values and reset state
shuffle(discards)
forEach discard with index:
  update game_exploration_decks SET state='deck', deck_position=index+1 WHERE id=discard.id

OK({ reshuffled: discards.length })
```

Note: This function is called automatically by `game-explore-planet` and `game-explore-frontier` when the draw deck is empty. It can also be called manually by the host if needed.

## Tests
```pseudocode
STD_MOCKS

T401; TCORS
T400('game_id'); T400('deck_type')
T404_PLAYER
T400 'Invalid deck_type' — deck_type='action_card'
T409('No discards to shuffle') — no discarded rows

it('resets discarded cards to deck state with randomized positions')
it('returns count of reshuffled cards')
```
