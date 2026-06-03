# hook-useGame-p45
**File:** `src/hooks/useGame.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions-p45

## Functionality

### Update playTheNote

Change signature from `playTheNote(noteInstanceId, planetName)` to `playTheNote(noteInstanceId, options = {})`:

```js
function playTheNote(noteInstanceId, options = {}) {
  return game
    ? playPromissoryNote(game.id, noteInstanceId, options)
    : Promise.reject(new Error('Game not loaded'))
}
```

### Add myRelicFragments state

Query player's held typed relic fragments from `game_exploration_decks`:

```js
const [myRelicFragments, setMyRelicFragments] = useState([])

// In the useEffect that loads game state (or its own useEffect), after currentPlayer is set:
async function loadRelicFragments() {
  if (!currentPlayer?.id) { setMyRelicFragments([]); return }
  const { data } = await supabase
    .from('game_exploration_decks')
    .select('id, relic_fragment_type')
    .eq('game_id', gameId)
    .eq('resolved_by_player_id', currentPlayer.id)
    .eq('state', 'held')
    .not('relic_fragment_type', 'is', null)
  setMyRelicFragments(data ?? [])
}
```

Call `loadRelicFragments()` in the same useEffect that fetches game data, after `currentPlayer` is resolved. Add `myRelicFragments` to the return value.

## Tests (`tests/hooks/useGame.phase45.test.js`)

- `playTheNote('note-1', { planet_name: 'Mecatol Rex' })` calls `playPromissoryNote(gameId, 'note-1', { planet_name: 'Mecatol Rex' })`
- `playTheNote('note-1', { fragment_ids: ['a','b'] })` calls `playPromissoryNote(gameId, 'note-1', { fragment_ids: ['a','b'] })`
- `myRelicFragments` is populated from `game_exploration_decks` query filtered by `resolved_by_player_id`, `state='held'`, non-null `relic_fragment_type`
- `myRelicFragments` is `[]` when `currentPlayer` is null
