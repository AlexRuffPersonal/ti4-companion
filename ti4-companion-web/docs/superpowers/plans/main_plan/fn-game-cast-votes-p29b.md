# fn-game-cast-votes-p29b
**File:** `supabase/functions/game-cast-votes/index.ts`
**Status:** Modify
**Prereqs:** migration-042-action-window

## Changes

Two window openings added to the existing vote-casting logic.

```pseudocode
// (A) When voting begins for a new agenda (first vote cast, no votes exist yet for this agenda):
existingVotes = SELECT COUNT(*) FROM game_agenda_votes
  WHERE game_id=gameId AND agenda_id=game.agenda_current_card_id
if existingVotes = 0:
  eligibleWhenVoting = SELECT deck.held_by_player_id
    FROM game_action_card_deck deck JOIN action_cards card ON deck.action_card_id=card.id
    WHERE deck.game_id=gameId AND deck.state='hand'
      AND card.timing = 'When voting begins:' AND card.ability IS NOT NULL
  if eligibleWhenVoting.length > 0:
    // Open window; do not process this vote yet — caller must wait for window to resolve
    UPDATE games SET pending_action_window = {
      type: 'when_voting_begins',
      eligible_player_ids: eligibleWhenVoting.map(r => r.held_by_player_id),
      passed_player_ids: [],
      context: { agenda_id: game.agenda_current_card_id }
    }
    OK({ window_opened: 'when_voting_begins' })
    return  // vote not yet cast; caller re-submits after window resolves

// (B) After the speaker casts their vote, open after_speaker_votes window:
speakerPlayer = SELECT id FROM game_players WHERE game_id=gameId AND user_id=game.speaker_player_id
if speakerPlayer.id === player.id:
  [cast the vote as normal first]
  eligibleAfterSpeaker = SELECT deck.held_by_player_id
    FROM game_action_card_deck deck JOIN action_cards card ON deck.action_card_id=card.id
    WHERE deck.game_id=gameId AND deck.state='hand'
      AND card.timing = 'After the speaker votes on an agenda:' AND card.ability IS NOT NULL
  if eligibleAfterSpeaker.length > 0:
    UPDATE games SET pending_action_window = {
      type: 'after_speaker_votes',
      eligible_player_ids: eligibleAfterSpeaker.map(r => r.held_by_player_id),
      passed_player_ids: [],
      context: { agenda_id: game.agenda_current_card_id }
    }
```

## Tests

Extend `tests/functions/game-cast-votes.test.js`:
```pseudocode
GIVEN first vote for agenda + player holds 'When voting begins:' card with ability
  EXPECT pending_action_window opened; vote NOT yet cast; OK({ window_opened })
GIVEN first vote for agenda + no player holds such a card
  EXPECT vote cast normally; no window opened
GIVEN speaker player casts vote + player holds 'After the speaker votes:' card
  EXPECT vote cast; pending_action_window opened for after_speaker_votes
GIVEN non-speaker player casts vote
  EXPECT no after_speaker_votes window opened
```
