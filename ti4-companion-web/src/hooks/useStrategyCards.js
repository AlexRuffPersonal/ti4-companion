import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { playStrategyCard, useStrategySecondary, passStrategySecondary } from '../lib/edgeFunctions.js'

export function useStrategyCards(gameId, myPlayerId) {
  const [activePay, setActivePay] = useState(null)
  const [responses, setResponses] = useState([])

  // Subscribe to active play for this game
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel('strategy-plays')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_strategy_card_plays', filter: `game_id=eq.${gameId}` },
        (payload) => {
          setActivePay(payload.new?.status === 'active' ? payload.new : null)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [gameId])

  // Subscribe to responses when a play is active
  useEffect(() => {
    if (!activePay) return

    let mounted = true

    const channel = supabase
      .channel('strategy-responses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_strategy_card_responses', filter: `play_id=eq.${activePay.id}` },
        (payload) => {
          setResponses((prev) => {
            const idx = prev.findIndex((r) => r.id === payload.new.id)
            if (idx === -1) return [...prev, payload.new]
            return prev.map((r) => (r.id === payload.new.id ? payload.new : r))
          })
        }
      )
      .subscribe()

    // Initial fetch
    supabase
      .from('game_strategy_card_responses')
      .select('*')
      .eq('play_id', activePay.id)
      .then(({ data }) => {
        if (mounted) setResponses(data ?? [])
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [activePay?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const myResponse = responses.find((r) => r.player_id === myPlayerId)
  const pendingResponses = responses.filter((r) => r.status === 'pending')
  const nextPendingOrder =
    pendingResponses.length > 0
      ? Math.min(...pendingResponses.map((r) => r.initiative_order))
      : null

  const isMyTurnToRespond =
    myResponse?.status === 'pending' && myResponse.initiative_order === nextPendingOrder

  return {
    activePay,
    responses,
    isMyTurnToRespond,
    playPrimary: (abilityId, selections) => playStrategyCard(gameId, abilityId, selections),
    useSecondary: (abilityId, selections) =>
      useStrategySecondary(gameId, activePay?.id, abilityId, selections),
    passSecondary: () => passStrategySecondary(gameId, activePay?.id),
  }
}
