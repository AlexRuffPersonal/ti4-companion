# fn-game-resolve-exploration-card
**File:** `supabase/functions/game-resolve-exploration-card/index.ts`
**Status:** New
**Prereqs:** migration-034-exploration, shared-explorationEffects, shared-abilityDsl

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, player_id, card_id)
// Optional body fields: choice (0|1), remove_infantry (bool)
GAME(phase, map_tiles); PLAYER

fetch game_exploration_decks where id=card_id + game_id
ERR 404 if not found
ERR 409 'Card not in drawn state' if state != 'drawn'
ERR 409 'Not your card' if resolved_by_player_id != player_id

// Look up DSL ops from explorationEffects.ts
ops = EXPLORATION_EFFECTS[card.name]
ERR 409 'Unknown exploration card' if ops undefined

// Build context
context = { gameId, playerId, planetName: card.planet_name, systemKey, choice, removeInfantry }

// Apply ops via abilityDsl dispatcher
applyAbility(ops, context, db)

// Mark card resolved
if card.relic_fragment_type OR card.has_attachment:
  // state managed by gain_relic_fragment / attach_to_planet op
else if card.name === 'Enigmatic Device':
  update state='held', resolved_by_player_id=player_id  // stays in play area
else:
  update state='discarded', resolved_by_player_id=null

// Mark planet explored
update game_player_planets SET explored=true
       WHERE game_id + player_id + planet_name

OK({ applied: card.name })
```

Note: `planet_name` is stored on the exploration deck row when `game-explore-planet` draws it — add `planet_name TEXT` column to `game_exploration_decks` in migration-034.

## Tests
```pseudocode
STD_MOCKS

T401; TCORS
T400('game_id'); T400('player_id'); T400('card_id')
T404_PLAYER
T404 'card not found' — card_id not in game_exploration_decks
T409('Card not in drawn state') — state='deck'
T409('Not your card') — resolved_by_player_id differs

it('applies gain_commodities op for Abandoned Warehouses choice=0')
it('applies convert_commodities op for Abandoned Warehouses choice=1')
it('applies attach_to_planet and sets explored=true for attachment cards')
it('applies gain_relic_fragment and sets state=held for relic fragments')
it('applies conditional_mech_or_infantry when mech present — no remove_infantry needed')
it('applies conditional_mech_or_infantry with remove_infantry=true — removes 1 infantry')
it('skips effect when no mech and remove_infantry=false for conditional cards')
it('keeps Enigmatic Device in held state')
it('discards non-special cards and sets explored=true')
```
