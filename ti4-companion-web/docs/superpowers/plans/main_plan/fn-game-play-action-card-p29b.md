# fn-game-play-action-card-p29b
**File:** `supabase/functions/game-play-action-card/index.ts`
**Status:** Modify
**Prereqs:** fn-game-play-action-card-p29a, shared-abilityDsl-p29b, migration-042-action-window

## Changes

Add a reactive-timing branch at the top of the handler, before the existing `Action:` check.

```pseudocode
const TIMING_MAP = {
  when_agenda_revealed:        'When an agenda is revealed:',
  after_speaker_votes:         'After the speaker votes on an agenda:',
  when_voting_begins:          'When voting begins:',
  after_technology_researched: 'After a player researches a technology:',
}

// After fetching the card row, before the Action: timing check:
if (!card.timing?.startsWith('Action:')):
  window = game.pending_action_window
  ERR 409 'No active window for this card timing' if window is null
  ERR 409 'Card timing does not match open window' if card.timing !== TIMING_MAP[window.type]
  ERR 409 'Not eligible for this window' if player.id NOT IN window.eligible_player_ids
  ERR 409 'Card effect not implemented' if card.ability is null

  result = resolveAbility(db, gameId, player.id, card.ability, body.selections ?? {},
                          { context: window.context })

  UPDATE game_action_card_deck SET state='discard', held_by_player_id=null WHERE id=card_id
  UPDATE game_players SET action_card_count -= 1 WHERE id=player.id

  updatedPassed = [...window.passed_player_ids, player.id]
  if updatedPassed.length === window.eligible_player_ids.length:
    UPDATE games SET pending_action_window=null WHERE id=gameId
  else:
    UPDATE games SET pending_action_window={ ...window, passed_player_ids: updatedPassed }

  OK({ discarded: card_id, result })
  return

// existing Action: branch continues below...
```

## Tests

Extend `tests/functions/game-play-action-card.test.js`:
```pseudocode
it('409 if non-Action: card played with no open window')
it('409 if card timing does not match open window type')
it('409 if player not in eligible_player_ids')
it('409 if non-Action: card has null ability')
GIVEN matching window, eligible player, valid ability
  EXPECT resolveAbility called with window.context
  EXPECT deck row discarded, action_card_count decremented
  EXPECT player added to passed_player_ids
  EXPECT window cleared when all eligible have acted
  EXPECT window updated (not cleared) when others still eligible
```
