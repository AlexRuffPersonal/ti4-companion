# fn-game-play-strategy-card

**File:** `supabase/functions/game-play-strategy-card/index.ts`
**Status:** New
**Prereqs:** migration-029-strategy-production, fn-game-resolve-ability

## Functionality

```pseudocode
CORS AUTH BODY(game_id, ability_definition_id, selections?) PLAYER(id,strategy_card,seat_index) GAME(id,phase,active_player_id,round)

ACTIVE_PLAYER
ERR 409 if game.phase !== 'action'

// Validate the ability belongs to the caller's strategy card
fetch ability_sources WHERE ability_definition_id = body.ability_definition_id AND source_type = 'strategy_card'
ERR 404 if not found
ERR 409 if ability_source.source_id !== player.strategy_card::text ('Card not held by caller')

// Ensure no active play already exists this round
existing = query game_strategy_card_plays WHERE game_id AND round = game.round AND status = 'active'
ERR 409 if existing ('Strategy card already being played')

// Resolve primary effect via ability DSL
resolve ability_definition effects (same logic as game-resolve-ability)

// Create play row
insert game_strategy_card_plays { game_id, card_number: player.strategy_card, played_by_player_id: player.id, round: game.round, status: 'active' }

// Create response rows for all other players in clockwise seat order
fetch all other game_players SELECT id, seat_index
playerCount = total player count in game
for each other player:
  initiative_order = (other.seat_index - player.seat_index + playerCount) % playerCount
  insert game_strategy_card_responses { play_id, player_id: other.id, initiative_order, status: 'pending' }

OK({ play_id })
```

## Tests

```pseudocode
STD_MOCKS REQ(game_id, ability_definition_id)
T401 T400(game_id) T400(ability_definition_id) T404_PLAYER TCORS T409_ACTIVE

T409('not in action phase') — mock game.phase = 'strategy'
T409('card not held by caller') — mock ability_source.source_id !== player.strategy_card
T409('strategy card already being played') — mock existing active play

GIVEN valid primary ability (e.g. gain_trade_goods):
  EXPECT ability effect applied
  EXPECT game_strategy_card_plays row inserted with status='active'
  EXPECT game_strategy_card_responses rows created for all other players
  EXPECT initiative_order computed correctly using clockwise seat formula
  EXPECT response { play_id: string }

GIVEN 3-player game, active player seat=2:
  EXPECT response rows have initiative_order 1 (seat 0) and 2 (seat 1)
  -- clockwise: seat 0 = (0-2+3)%3=1, seat 1 = (1-2+3)%3=2
```
