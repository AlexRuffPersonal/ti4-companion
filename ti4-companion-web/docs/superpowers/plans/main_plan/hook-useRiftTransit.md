# hook-useRiftTransit
**File:** `src/hooks/useRiftTransit.js`
**Status:** New
**Prereqs:** client-edgeFunctions-p25

## Functionality

```pseudocode
export function useRiftTransit(gameId) {
  activeTransit = null  // pending game_rift_transits row
  loading = false
  error = null

  on mount:
    Realtime subscription on 'game_rift_transits' filter game_id=eq.gameId:
      INSERT/UPDATE: if payload.new.status === 'pending' → setActiveTransit(payload.new)
                     if payload.new.status === 'complete' → setActiveTransit(null)
    cleanup: supabase.removeChannel(channel)

  rollAll = async () =>
    setLoading(true); setError(null)
    try: await rollRiftDice(activeTransit.id, true, undefined)
    catch: setError(e.message)
    finally: setLoading(false)

  rollOne = async (unitId) =>
    setLoading(true); setError(null)
    try: await rollRiftDice(activeTransit.id, false, unitId)
    catch: setError(e.message)
    finally: setLoading(false)

  return { activeTransit, loading, error, rollAll, rollOne }
}
```

## Tests

```pseudocode
mock supabase Realtime channel; mock rollRiftDice

returns activeTransit=null when no Realtime event received
INSERT event with status='pending' → activeTransit set to payload.new
UPDATE event with status='complete' → activeTransit set to null
rollAll: calls rollRiftDice(transitId, true, undefined)
rollOne: calls rollRiftDice(transitId, false, unitId)
loading true during call; false after
error set when rollRiftDice rejects
channel removed on unmount
```
