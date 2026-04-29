# fn-game-draw-agenda-p29b
**File:** `supabase/functions/game-draw-agenda/index.ts`
**Status:** Modify
**Prereqs:** migration-042-action-window

## Changes

After setting `agenda_current_card_id` and before returning `OK(...)`, open the `when_agenda_revealed` window if any player holds a matching card.

```pseudocode
// After existing draw + reveal logic:

eligible = SELECT deck.held_by_player_id
  FROM game_action_card_deck deck
  JOIN action_cards card ON deck.action_card_id = card.id
  WHERE deck.game_id=gameId
    AND deck.state='hand'
    AND card.timing = 'When an agenda is revealed:'
    AND card.ability IS NOT NULL

if eligible.length > 0:
  UPDATE games SET pending_action_window = {
    type: 'when_agenda_revealed',
    eligible_player_ids: eligible.map(r => r.held_by_player_id),
    passed_player_ids: [],
    context: { agenda_id: newCard.id }
  }
```

## Tests

Extend `tests/functions/game-draw-agenda.test.js`:
```pseudocode
GIVEN player holds a 'When an agenda is revealed:' card with non-null ability
  EXPECT pending_action_window set with type='when_agenda_revealed' and that player eligible
GIVEN no player holds such a card
  EXPECT pending_action_window not set (remains null)
```
