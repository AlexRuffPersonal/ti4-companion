# component-GameScreen-p45
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useGame-p45

## Functionality

### Destructure myRelicFragments from useGame

```js
const { ..., playTheNote, myRelicFragments } = useGame(gameCode)
```

### Update handlePlayNote

Change signature from `handlePlayNote(noteId, planetName)` to `handlePlayNote(noteId, options = {})`:

```js
const handlePlayNote = async (noteId, options = {}) => {
  try {
    await playTheNote(noteId, options)
  } catch (e) {
    console.error('Play note error:', e)
  }
}
```

### Pass myRelicFragments to PromissoryNotesModal

```jsx
<PromissoryNotesModal
  ...
  myRelicFragments={myRelicFragments}
  onPlay={handlePlayNote}
  ...
/>
```

## Tests (`tests/components/game/GameScreen.test.jsx`)

Update the `useGame` mock to include `myRelicFragments: []`.
No new test cases needed — GameScreen is a thin pass-through; the logic under test is in hooks and child components.
