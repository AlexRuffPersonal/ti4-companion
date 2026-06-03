# component-PlayPromissoryNoteModal-p45
**File:** `src/components/game/PlayPromissoryNoteModal.jsx`
**Status:** Modify
**Prereqs:** component-PromissoryNotesModal-p45

## Functionality

### Add FRAGMENT_PICKER_NOTES and myRelicFragments prop

```js
const FRAGMENT_PICKER_NOTES = ['Black Market Forgery']

export default function PlayPromissoryNoteModal({ note, players, myPlanets, myRelicFragments, onPlay, onClose }) {
  const [chosenPlayerId, setChosenPlayerId] = useState(null)
  const [chosenDestinationPlanet, setChosenDestinationPlanet] = useState(null)
  const [chosenFragmentIds, setChosenFragmentIds] = useState([])
  const [error, setError] = useState(null)

  const needsPlayer = PLAYER_PICKER_NOTES.includes(note.name)
  const needsPlanet = PLANET_PICKER_NOTES.includes(note.name)
  const needsFragments = FRAGMENT_PICKER_NOTES.includes(note.name)
```

### Fragment picker UI

```jsx
{needsFragments && (
  <div className="flex flex-col gap-2">
    <p className="text-dim text-xs font-body">Choose 2 relic fragments of the same type:</p>
    {(myRelicFragments ?? []).map(f => (
      <button
        key={f.id}
        className={chosenFragmentIds.includes(f.id) ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
        onClick={() => {
          setChosenFragmentIds(prev =>
            prev.includes(f.id)
              ? prev.filter(id => id !== f.id)
              : prev.length < 2 ? [...prev, f.id] : prev
          )
        }}
      >
        {f.relic_fragment_type}
      </button>
    ))}
  </div>
)}
```

### Validate on handlePlay

```js
async function handlePlay() {
  setError(null)
  if (needsFragments) {
    if (chosenFragmentIds.length !== 2) { setError('Select exactly 2 fragments'); return }
    const types = chosenFragmentIds.map(id => myRelicFragments.find(f => f.id === id)?.relic_fragment_type)
    if (types[0] !== types[1]) { setError('Both fragments must be the same type'); return }
  }
  try {
    await onPlay(note.id, {
      ...(needsPlayer ? { chosenPlayerId } : {}),
      ...(needsPlanet ? { chosenDestinationPlanet } : {}),
      ...(needsFragments ? { fragment_ids: chosenFragmentIds } : {}),
    })
  } catch (e) {
    setError(e.message)
  }
}
```

## Tests (`tests/components/game/PlayPromissoryNoteModal.test.jsx`)

- Black Market Forgery renders fragment picker, not player picker or planet picker
- Clicking PLAY with 0 fragments → shows 'Select exactly 2 fragments' error, does not call onPlay
- Clicking PLAY with 2 different-type fragments → shows 'Both fragments must be the same type' error
- Clicking PLAY with 2 same-type fragments → calls onPlay with `{ fragment_ids: [id1, id2] }`
- Fragment button toggles selection; selecting a 3rd fragment beyond 2 is a no-op
