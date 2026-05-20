# component-PromissoryNotesModal-p44

**File:** `src/components/game/PromissoryNotesModal.jsx`
**Status:** Modify
**Prereqs:** client-edgeFunctions-p44

## Functionality

Add `myPlanets` prop. Add `pendingNote` state for Terraform sub-modal flow.

```
props: notes, players, myPlanets, currentPlayerId, onGive, onPlay, onClose

state: pendingNote = null

For each note:
  needsSubModal = ref.name === 'Terraform'
  PLAY button: always visible (remove old 'canPlay = !into_play_area' guard)
  onClick: needsSubModal ? setPendingNote(note) : onPlay(note.id)

After notes list, if pendingNote:
  render PlayPromissoryNoteModal(
    note=pendingNote.promissory_notes,
    players, myPlanets,
    onPlay=(noteId, selections) => { onPlay(noteId, selections.chosenDestinationPlanet); setPendingNote(null) }
    onClose=() => setPendingNote(null)
  )
```

## Tests

Create `tests/components/game/PromissoryNotesModal.test.jsx`:

- Non-Terraform note: PLAY calls `onPlay(noteId)` directly
- Terraform note: PLAY button visible even though `into_play_area=true`
- Terraform note: PLAY opens sub-modal (planet list renders)
- Sub-modal: selecting planet + PLAY calls `onPlay(noteId, 'PlanetName')`
- Sub-modal: CANCEL closes without calling onPlay
