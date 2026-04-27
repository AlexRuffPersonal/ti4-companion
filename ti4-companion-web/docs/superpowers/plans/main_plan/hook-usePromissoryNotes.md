# hook-usePromissoryNotes
**File:** `src/hooks/usePromissoryNotes.js`
**Status:** New
**Prereqs:** client-edgeFunctions

## Functionality
```pseudocode
fetch game_player_promissory_notes for gameId
  join promissory_notes for name, flavor_text
  on mount + Realtime subscription filter game_id=eq.{gameId}

derive:
  heldNotes = notes where state='held' AND held_by_player_id=myPlayerId
  inPlayNotes = notes where state='in_play' (all players)

expose:
  { heldNotes, inPlayNotes, loading, error }
  playNote(noteInstanceId, selections={}) → callFunction('game-play-promissory-note',
    { game_id: gameId, note_instance_id: noteInstanceId, selections })
```

## Tests
New file: `tests/hooks/usePromissoryNotes.test.js`

```pseudocode
mock supabase select + realtime channel
heldNotes only includes notes where held_by=myPlayerId AND state='held'
inPlayNotes includes all players' in_play notes
playNote calls callFunction with correct args
Realtime INSERT/UPDATE event triggers re-fetch
```
