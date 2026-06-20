import { useMemo, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
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

  // During strategy phase, bots pick simultaneously rather than sequentially,
  // so active_player_id doesn't cycle. The host picks for all unpicked bots.
  const botsNeedingStrategyPick = useMemo(() => {
    if (!isHost || game.phase !== 'strategy') return []
    return players.filter(p => p.is_bot && p.strategy_card == null)
  }, [isHost, game.phase, players])

  const isStrategyPickPending = botsNeedingStrategyPick.length > 0

  const isTicking = useRef(false)
  const isStrategyTicking = useRef(false)

  // Strategy phase: auto-pick for all bots that haven't chosen yet
  useEffect(() => {
    if (!isStrategyPickPending || isStrategyTicking.current) return
    isStrategyTicking.current = true

    async function pickAll() {
      // strategy_card is stored as card number (1–8)
      const picked = new Set(players.map(p => p.strategy_card).filter(n => n != null))
      const available = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => !picked.has(n))

      for (const bot of botsNeedingStrategyPick) {
        await delay(800)
        const card = available.shift()
        if (card == null) break
        picked.add(card)
        await supabase
          .from('game_players')
          .update({ strategy_card: card })
          .eq('id', bot.id)
      }
    }

    pickAll().catch(console.error).finally(() => { isStrategyTicking.current = false })
  }, [isStrategyPickPending, botsNeedingStrategyPick.length]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return { isBotTurn: isBotTurn || isStrategyPickPending }
}
