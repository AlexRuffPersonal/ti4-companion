# component-PromissoryNotesModal-p45
**File:** `src/components/game/PromissoryNotesModal.jsx`
**Status:** Modify
**Prereqs:** component-GameScreen-p45

## Functionality

### Add myRelicFragments prop

```js
export default function PromissoryNotesModal({ notes, players, myPlanets, myRelicFragments, currentPlayerId, onGive, onPlay, onClose }) {
```

### Extend needsSubModal

```js
const needsSubModal = ref?.name === 'Terraform' || ref?.name === 'Black Market Forgery'
```

### Pass myRelicFragments to PlayPromissoryNoteModal

```jsx
<PlayPromissoryNoteModal
  note={pendingNote.promissory_notes}
  players={players}
  myPlanets={myPlanets}
  myRelicFragments={myRelicFragments}
  onPlay={(_noteId, selections) => {
    // Build options from selections
    const options = {}
    if (selections?.chosenDestinationPlanet) options.planet_name = selections.chosenDestinationPlanet
    if (selections?.fragment_ids) options.fragment_ids = selections.fragment_ids
    onPlay(pendingNote.id, options)
    setPendingNote(null)
  }}
  onClose={() => setPendingNote(null)}
/>
```

## Tests (`tests/components/game/PromissoryNotesModal.test.jsx`)

- 'Black Market Forgery' note → clicking PLAY opens PlayPromissoryNoteModal (sets pendingNote)
- Non-Terraform, non-BMF note → clicking PLAY calls `onPlay(noteId)` directly (no sub-modal)
- onPlay callback with `selections.fragment_ids` → calls `onPlay(noteId, { fragment_ids })` on outer handler
- onPlay callback with `selections.chosenDestinationPlanet` → calls `onPlay(noteId, { planet_name })` on outer handler
