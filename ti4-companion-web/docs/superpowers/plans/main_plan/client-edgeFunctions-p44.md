# client-edgeFunctions-p44

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-play-promissory-note-p44

## Functionality

Extend `playPromissoryNote` to accept optional `planetName`:

```js
export const playPromissoryNote = (gameId, noteInstanceId, planetName) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(planetName ? { planet_name: planetName } : {}),
  })
```

Update `useGame.js`: `playTheNote(noteInstanceId, planetName)` passes `planetName` through to `playPromissoryNote`.

Update `GameScreen.jsx`:
- `handlePlayNote(noteId, planetName)` passes `planetName` to `playTheNote`
- Pass `myPlanets={myPlanets}` prop to `PromissoryNotesModal`

## Tests

Covered by `PromissoryNotesModal.test.jsx` (Task 6) which exercises the full call chain with mocked edge functions.
