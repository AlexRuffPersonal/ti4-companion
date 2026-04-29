# fn-game-research-technology-p29b
**File:** `supabase/functions/game-research-technology/index.ts`
**Status:** Modify
**Prereqs:** migration-042-action-window

## Changes

After the technology is appended to the player's list and before returning `OK(...)`, open the `after_technology_researched` window if any other player holds a matching card.

```pseudocode
// After existing research logic (technology appended to player.technologies):

eligible = SELECT deck.held_by_player_id
  FROM game_action_card_deck deck
  JOIN action_cards card ON deck.action_card_id = card.id
  WHERE deck.game_id=gameId
    AND deck.state='hand'
    AND deck.held_by_player_id != player.id  // others only; researcher cannot Plagiarize own research
    AND card.timing = 'After a player researches a technology:'
    AND card.ability IS NOT NULL

if eligible.length > 0:
  UPDATE games SET pending_action_window = {
    type: 'after_technology_researched',
    eligible_player_ids: eligible.map(r => r.held_by_player_id),
    passed_player_ids: [],
    context: { technology_name: researchedTechName }
  }
```

## Tests

Extend `tests/functions/game-research-technology.test.js`:
```pseudocode
GIVEN another player holds 'After a player researches a technology:' card with ability
  EXPECT pending_action_window set with context.technology_name = researched tech
GIVEN only the researching player holds such a card
  EXPECT no window opened (researcher excluded from eligible)
GIVEN no player holds such a card
  EXPECT no window opened
```
