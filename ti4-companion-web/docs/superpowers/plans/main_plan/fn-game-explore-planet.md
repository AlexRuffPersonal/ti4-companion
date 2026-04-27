# fn-game-explore-planet
**File:** `supabase/functions/game-explore-planet/index.ts`
**Status:** New
**Prereqs:** migration-034-exploration, shared-explorationEffects

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, player_id, planet_name, deck_type)
GAME(phase, active_player_id, map_tiles); PLAYER

validate deck_type IN ['cultural','hazardous','industrial']

fetch game_player_planets where game_id + player_id + planet_name
ERR 409 'Planet not controlled' if not found
ERR 409 'Planet already explored' if explored = true

// Validate deck_type matches planet traits
fetch tiles JOIN game_player_planets using tile_id
ERR 409 'Invalid deck for planet trait' if planet has no trait matching deck_type
// Exception: if planet has multiple traits, any matching trait is valid

// Draw top card
card = select game_exploration_decks where game_id + deck_type + state='deck'
       ORDER BY deck_position ASC LIMIT 1

if !card:
  // Reshuffle discards
  discards = select game_exploration_decks where game_id + deck_type + state='discarded'
  ERR 409 'Exploration deck empty' if discards empty
  assign random deck_position to each discard; update state='deck'
  card = re-fetch top card

update game_exploration_decks SET state='drawn', resolved_by_player_id=player_id
       WHERE id=card.id

OK({ card_id: card.id, card_name: card.name, card_text: card.text,
     has_attachment: card.has_attachment, relic_fragment_type: card.relic_fragment_type })
```

## Tests
```pseudocode
STD_MOCKS

T401; TCORS
T400('game_id'); T400('player_id'); T400('planet_name'); T400('deck_type')
T404_PLAYER
T409('Planet not controlled') — planet not in game_player_planets for player
T409('Planet already explored') — explored=true
T409('Invalid deck for planet trait') — deck_type mismatches planet's trait
T409('Exploration deck empty') — no deck or discard rows

it('draws top card and sets state=drawn') — mock deck with 3 cards; expect lowest deck_position returned, state updated
it('reshuffles discards when deck empty') — mock 0 deck rows, 3 discard rows; expect reshuffle + draw
it('returns card metadata') — verify OK includes card_id, card_name, relic_fragment_type
```
