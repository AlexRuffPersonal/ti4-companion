# hook-useStrategyCards-p37
**File:** `src/hooks/useStrategyCards.js`
**Status:** Modify
**Prereqs:** fn-game-play-strategy-card-p37, fn-game-use-strategy-secondary-p37

## Changes

```pseudocode
ADD state: agendaPeekCards = null  // [{id, name, text}, {id, name, text}] or null
ADD state: warfareHomeSystemKey = null  // string or null

MODIFY playPrimary: after resolving, if response.peek_cards → setAgendaPeekCards(response.peek_cards)
MODIFY useSecondary: after resolving, if response.home_system_key → setWarfareHomeSystemKey(response.home_system_key)

ADD fetchAgendaTopCards(gameId): supabase query game_agenda_deck joined agenda_cards,
  WHERE game_id + state='deck', ORDER BY deck_position ASC, LIMIT 2
  Returns [{id, name, text}]

EXPOSE in return:
  agendaPeekCards,
  clearAgendaPeekCards: () => setAgendaPeekCards(null),
  warfareHomeSystemKey,
  clearWarfareHomeSystemKey: () => setWarfareHomeSystemKey(null),
  fetchAgendaTopCards,
```

## Tests

```pseudocode
it('agendaPeekCards set from playPrimary response for Politics card')
it('agendaPeekCards cleared on clearAgendaPeekCards()')
it('warfareHomeSystemKey set from useSecondary response for Warfare card')
it('fetchAgendaTopCards queries deck and returns top 2 cards')
```
