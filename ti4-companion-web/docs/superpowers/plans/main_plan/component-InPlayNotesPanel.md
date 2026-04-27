# component-InPlayNotesPanel
**File:** `src/components/game/InPlayNotesPanel.jsx`
**Status:** New
**Prereqs:** hook-usePromissoryNotes

## Props
```js
{ inPlayNotes, players }
```

## Functionality
```pseudocode
return null if inPlayNotes is empty

PANEL(sm)
  LABEL("Active Notes")
  for each note in inPlayNotes:
    holder = players.find(p => p.id === note.held_by_player_id)
    owner  = players.find(p => p.id === note.origin_player_id)
    ROW: "{note.name}" — held by {holder.faction}/{holder.color}, from {owner.faction}/{owner.color}
```

## Tests
New file: `tests/components/game/InPlayNotesPanel.test.jsx`

```pseudocode
renders null when inPlayNotes=[]
renders note name for each in-play note
renders holder faction/color label
renders owner faction/color label
multiple notes all rendered
```
