import { useMemo, useRef, useEffect } from 'react'
import { getNextAction as scriptedGetNextAction } from '../lib/botStrategies/scripted.js'
import { getNextAction as randomGetNextAction } from '../lib/botStrategies/random.js'

const scriptedStrategy = { getNextAction: scriptedGetNextAction }
const randomStrategy = { getNextAction: randomGetNextAction }

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useBotPlayer({ game, players, currentPlayer, isHost, edgeFns }) {
  const isBotTurn = useMemo(() => {
    if (!isHost) return false
    if (game.active_player_id == null) return false
    const activePlayer = players.find(p => p.id === game.active_player_id)
    return activePlayer?.is_bot === true
  }, [game.active_player_id, players, isHost])

  const isTicking = useRef(false)

  useEffect(() => {
    if (!isBotTurn || isTicking.current) return
    isTicking.current = true

    async function tick() {
      const botPlayer = players.find(p => p.id === game.active_player_id)
      const strategy = botPlayer.bot_strategy === 'random' ? randomStrategy : scriptedStrategy

      await delay(1000)

      const action = strategy.getNextAction(game, players, botPlayer)
      if (!action) {
        isTicking.current = false
        return
      }

      if (!edgeFns[action.fnName]) {
        console.warn(`useBotPlayer: unknown edge function "${action.fnName}"`)
        isTicking.current = false
        return
      }

      await edgeFns[action.fnName](action.args)
    }

    tick().catch(console.error)

    return () => {
      isTicking.current = false
    }
  }, [isBotTurn, game.active_player_id])

  return { isBotTurn }
}
