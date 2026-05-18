# hook-useGame-p36
**File:** `src/hooks/useGame.js`
**Status:** Modify
**Prereqs:** migration-046-objective-conditions

## Changes

```pseudocode
// In initial fetch, add:
const { data: combatsData } = await supabase
  .from('game_combats')
  .select('*')
  .eq('game_id', gameData.id)
setState(prev => ({ ...prev, combats: combatsData ?? [] }))

// In Realtime subscriptions, add:
channel.on('postgres_changes',
  { event: '*', schema: 'public', table: 'game_combats', filter: `game_id=eq.${gameData.id}` },
  async () => {
    const { data } = await supabase.from('game_combats').select('*').eq('game_id', gameData.id)
    setState(prev => ({ ...prev, combats: data ?? [] }))
  }
)

// Expose combats in returned game state object
```

## Tests

```pseudocode
it('fetches game_combats on load and includes in returned state')
  mock: game_combats returns [{ id: 'c1', ... }]
  EXPECT state.combats = [{ id: 'c1', ... }]

it('updates combats on realtime game_combats event')
  simulate realtime INSERT on game_combats
  EXPECT state.combats refreshed
```
