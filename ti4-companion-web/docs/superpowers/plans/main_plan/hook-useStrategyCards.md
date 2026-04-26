# hook-useStrategyCards

**File:** `src/hooks/useStrategyCards.js`
**Status:** New
**Prereqs:** client-edgeFunctions

## Functionality

```pseudocode
export function useStrategyCards(gameId, myPlayerId) {
  [activePay, setActivePay] = useState(null)       // game_strategy_card_plays row
  [responses, setResponses] = useState([])          // game_strategy_card_responses rows

  // Subscribe to active play for this game
  useEffect:
    channel = supabase.channel('strategy-plays')
      .on postgres_changes { table:'game_strategy_card_plays', filter:`game_id=eq.${gameId}` }
        payload => setActivePay(payload.new if status==='active' else null)
      .subscribe()
    return () => supabase.removeChannel(channel)

  // Subscribe to responses when a play is active
  useEffect (depends on activePay?.id):
    if !activePay return
    channel = supabase.channel('strategy-responses')
      .on postgres_changes { table:'game_strategy_card_responses', filter:`play_id=eq.${activePay.id}` }
        payload => setResponses(prev => upsert payload.new by id)
      .subscribe()
    // initial fetch
    fetch game_strategy_card_responses WHERE play_id=activePay.id
    setResponses(data)
    return () => supabase.removeChannel(channel)

  myResponse = responses.find(r => r.player_id === myPlayerId)
  nextPendingOrder = min initiative_order where status='pending'
  isMyTurnToRespond = myResponse?.status === 'pending'
    && myResponse.initiative_order === nextPendingOrder

  return {
    activePay,
    responses,
    isMyTurnToRespond,
    playPrimary: (abilityId, selections) => playStrategyCard(gameId, abilityId, selections),
    useSecondary: (abilityId, selections) => useStrategySecondary(gameId, activePay.id, abilityId, selections),
    passSecondary: () => passStrategySecondary(gameId, activePay.id),
  }
}
```

## Tests

```pseudocode
Mock supabase channel + playStrategyCard/useStrategySecondary/passStrategySecondary imports.

it('subscribes to game_strategy_card_plays on mount')
it('sets activePay when play becomes active')
it('clears activePay when play completes')
it('subscribes to responses when activePay is set')
it('isMyTurnToRespond true when caller is next pending by initiative_order')
it('isMyTurnToRespond false when another player has lower pending initiative_order')
it('dispatchers call correct edge function wrappers')
```
