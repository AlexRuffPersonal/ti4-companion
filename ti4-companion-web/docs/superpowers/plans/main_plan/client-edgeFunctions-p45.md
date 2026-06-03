# client-edgeFunctions-p45
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-play-promissory-note-p45

## Functionality

Change `playPromissoryNote` signature from `(gameId, noteInstanceId, planetName)` to `(gameId, noteInstanceId, options = {})`:

```js
export const playPromissoryNote = (gameId, noteInstanceId, options = {}) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(options.planet_name ? { planet_name: options.planet_name } : {}),
    ...(options.fragment_ids?.length ? { selections: { fragment_ids: options.fragment_ids } } : {}),
  })
```

`fragment_ids` are sent inside `selections` (not top-level) so the edge function can read them from `body.selections.fragment_ids` → `ctx.selections.fragment_ids`.

## Tests (`tests/lib/edgeFunctions.phase45.test.js` or extend existing)

- `playPromissoryNote(gameId, noteId, { planet_name: 'Mecatol Rex' })` → calls `callFunction` with `{ planet_name: 'Mecatol Rex' }`
- `playPromissoryNote(gameId, noteId, { fragment_ids: ['a', 'b'] })` → calls `callFunction` with `{ selections: { fragment_ids: ['a', 'b'] } }`
- `playPromissoryNote(gameId, noteId)` (no options) → calls `callFunction` without `planet_name` or `selections.fragment_ids`
