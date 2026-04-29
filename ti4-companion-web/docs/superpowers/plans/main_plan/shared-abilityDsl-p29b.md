# shared-abilityDsl-p29b
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-042-action-window

## Changes

Add 3 new op handlers for reactive-timing cards.

```pseudocode
case 'replace_agenda':
  // Veto: replace the revealed agenda with the next card from the deck
  fetch games WHERE id=gameId → game
  currentAgendaId = game.agenda_current_card_id
  // discard the current agenda
  UPDATE game_agenda_deck SET state='discard' WHERE id=currentAgendaId
  // draw next
  fetch game_agenda_deck WHERE game_id=gameId AND state='deck'
    ORDER BY deck_position ASC LIMIT 1
  ERR 409 'Agenda deck empty' if not found
  UPDATE game_agenda_deck SET state='revealed' WHERE id=newCard.id
  UPDATE games SET agenda_current_card_id=newCard.id WHERE id=gameId

case 'add_votes':
  // Bribery: spend trade goods to cast extra votes
  amount = selections.vote_count  // number of trade goods to spend
  outcome = selections.vote_outcome
  ERR 409 'Insufficient trade goods' if player.trade_goods < amount
  UPDATE game_players SET trade_goods -= amount WHERE id=playerId
  fetch games WHERE id=gameId → game
  upsert game_agenda_votes { game_id:gameId, game_player_id:player.id,
    agenda_id:game.agenda_current_card_id, vote_count:amount, choice:outcome }
    ON CONFLICT (game_id, game_player_id, agenda_id): SET vote_count += amount

case 'research_same_technology':
  // Plagiarize: research the same technology as the triggering player
  techName = context.technology_name  // passed via window context
  ERR 409 'Technology already researched' if techName IN player.technologies
  UPDATE game_players SET technologies = array_append(technologies, techName) WHERE id=playerId
```

## Tests

Extend `tests/lib/abilityDsl.test.js`:
```pseudocode
replace_agenda: new agenda set as current; old agenda discarded; 409 if deck empty
add_votes: trade_goods decremented; vote row upserted; 409 insufficient trade goods
research_same_technology: technology appended; 409 already researched
```
