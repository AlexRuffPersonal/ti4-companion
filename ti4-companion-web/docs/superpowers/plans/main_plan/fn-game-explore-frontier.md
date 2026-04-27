# fn-game-explore-frontier
**File:** `supabase/functions/game-explore-frontier/index.ts`
**Status:** New
**Prereqs:** migration-034-exploration, shared-explorationEffects, shared-abilityDsl

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, player_id, system_key)
GAME(phase, map_tiles); PLAYER

// Validate Dark Energy Tap
playerTechs = fetch game_players.technologies where id=player_id
ERR 409 'Dark Energy Tap required' if 'Dark Energy Tap' NOT IN playerTechs

// Validate frontier token present
systemState = fetch game_system_state where game_id + system_key
ERR 409 'No frontier token in system' if !systemState?.has_frontier_token

// Draw top frontier card
card = select game_exploration_decks where game_id + deck_type='frontier' + state='deck'
       ORDER BY deck_position ASC LIMIT 1
if !card:
  discards = select where deck_type='frontier' + state='discarded'
  ERR 409 'Frontier deck empty' if discards empty
  reshuffle; re-fetch

ops = EXPLORATION_EFFECTS[card.name]
ERR 409 'Unknown frontier card' if ops undefined

context = { gameId, playerId, systemKey, choice: null, removeInfantry: false }
applyAbility(ops, context, db)

// Discard card (Enigmatic Device and Unknown Relic Fragment handled by their ops)
if card.name NOT IN ['Enigmatic Device','Unknown Relic Fragment']:
  update game_exploration_decks SET state='discarded' WHERE id=card.id

// Remove frontier token
update game_system_state SET has_frontier_token=false WHERE game_id + system_key

OK({ card_name: card.name })
```

## Tests
```pseudocode
STD_MOCKS

T401; TCORS
T400('game_id'); T400('player_id'); T400('system_key')
T404_PLAYER
T409('Dark Energy Tap required') — technology not in player's array
T409('No frontier token in system') — system_state missing or has_frontier_token=false
T409('Frontier deck empty') — no deck or discard rows

it('draws frontier card and removes frontier token')
it('applies relic fragment op for Unknown Relic Fragment')
it('applies place_mirage op and sets Mirage in game_player_planets')
it('applies place_map_token for Ion Storm')
it('keeps Enigmatic Device in held state')
```
