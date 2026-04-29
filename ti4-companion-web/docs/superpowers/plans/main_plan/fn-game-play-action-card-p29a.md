# fn-game-play-action-card-p29a
**File:** `supabase/functions/game-play-action-card/index.ts`
**Status:** New
**Prereqs:** shared-abilityDsl-p29a

## Functionality

Phase 29a handles `Action:` timing cards only (component actions during the action phase).

```pseudocode
CORS
AUTH
BODY(game_id, card_id)
PLAYER
GAME(phase, active_player_id, round)

ERR 409 'Not the action phase' if game.phase !== 'action'
ERR 409 'Not your turn' if game.active_player_id !== player.id

fetch game_action_card_deck JOIN action_cards ON deck.action_card_id = card.id
  WHERE deck.id=card_id AND deck.held_by_player_id=player.id AND deck.state='hand'
ERR 404 'Card not in hand' if not found

ERR 409 'Card timing is not Action:' if !card.timing?.startsWith('Action:')
ERR 409 'Card effect not implemented' if card.ability is null

result = resolveAbility(db, gameId, player.id, card.ability, body.selections ?? {})

UPDATE game_action_card_deck SET state='discard', held_by_player_id=null WHERE id=card_id
UPDATE game_players SET action_card_count -= 1 WHERE id=player.id

// End player's action turn:
UPDATE game_players SET passed=true WHERE id=player.id
next = SELECT id FROM game_players WHERE game_id=gameId AND passed=false
       ORDER BY initiative_order ASC LIMIT 1
UPDATE games SET active_player_id = next?.id ?? null WHERE id=gameId

OK({ discarded: card_id, result })
```

## Tests

```pseudocode
STD_MOCKS; T401; T400(game_id, card_id); TCORS; T404_PLAYER

T409_ACTIVE
it('409 if game phase is not action')
it('404 if card not in player hand')
it('409 if card timing is not Action:')
it('409 if card ability is null')

GIVEN valid Action: card with ability in hand and it is player's turn
  EXPECT resolveAbility called with card.ability and selections
  EXPECT deck row updated to state='discard', held_by_player_id=null
  EXPECT action_card_count decremented
  EXPECT player.passed set to true
  EXPECT games.active_player_id set to next player in initiative order
  EXPECT OK({ discarded: card_id, result })

GIVEN all other players have passed
  EXPECT games.active_player_id set to null
```
