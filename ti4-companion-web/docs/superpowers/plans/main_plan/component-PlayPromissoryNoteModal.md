# component-PlayPromissoryNoteModal
**File:** `src/components/game/PlayPromissoryNoteModal.jsx`
**Status:** New
**Prereqs:** hook-usePromissoryNotes

## Props
```js
{ note, players, myPlanets, onPlay, onClose }
```

## Functionality
```pseudocode
return null if !note

MODAL_WRAPPER → PANEL(md)
  LABEL(note.name)
  MUTED(note.flavor_text with {{owner}} replaced by owner faction/color label)

  // Selection inputs based on note name
  IF note.name in ['Political Secret', 'Scepter Of Dominion', "Ragh's Call"]:
    player picker → chosenPlayerId
  ELIF note.name in ['Military Support', 'Terraform', 'Creuss IFF']:
    planet picker (myPlanets) → chosenDestinationPlanet
  // else: confirm only — no extra selection

  error MUTED if server returns 409/error

  "Play" btn → onPlay(note.id, { chosenPlayerId?, chosenDestinationPlanet? })
  "Cancel" btn → onClose
```

## Tests
New file: `tests/components/game/PlayPromissoryNoteModal.test.jsx`

```pseudocode
renders null when note=null
renders note name and flavor text
renders player picker for Political Secret; does NOT render planet picker
renders planet picker for Military Support; does NOT render player picker
renders only Play + Cancel for a note with no selection (e.g. Ceasefire)
Play btn calls onPlay with selections object
Cancel btn calls onClose
shows error message when onPlay rejects with server error
```
