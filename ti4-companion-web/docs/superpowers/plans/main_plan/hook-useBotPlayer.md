# hook-useBotPlayer

**File:** `src/hooks/useBotPlayer.js`
**Status:** New
**Prereqs:** client-edgeFunctions-p33, lib-botStrategies-scripted, lib-botStrategies-random

## Functionality

```pseudocode
// Mounted inside GameScreen. Drives bot turns automatically when host.
export function useBotPlayer({ game, players, currentPlayer, isHost, edgeFns })

  isBotTurn = useMemo(() =>
    isHost
    AND game.active_player_id is not null
    AND players.find(p => p.id === game.active_player_id)?.is_bot === true
  , [game.active_player_id, players, isHost])

  isTicking = useRef(false)

  useEffect(() =>
    if !isBotTurn OR isTicking.current: return
    isTicking.current = true

    async function tick()
      botPlayer = players.find(p => p.id === game.active_player_id)
      strategy = botPlayer.bot_strategy === 'random' ? randomStrategy : scriptedStrategy

      await delay(1000)  // brief pause so UI settles

      action = strategy.getNextAction(game, players, botPlayer)
      if !action:
        isTicking.current = false
        return

      await edgeFns[action.fnName](action.args)
      // Realtime update will re-trigger this effect via game.active_player_id change

    tick().catch(console.error)

    return () => { isTicking.current = false }
  , [isBotTurn, game.active_player_id])

  return { isBotTurn }
```

## Tests

```pseudocode
isBotTurn=false when current player is human: effect does not fire
isBotTurn=false when caller is not host: effect does not fire
isBotTurn=true: calls strategy.getNextAction; dispatches returned edge function
isBotTurn=true, getNextAction returns null: isTicking reset, no dispatch
Does not double-fire if effect re-runs while isTicking=true
```
