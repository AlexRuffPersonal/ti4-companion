import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { playStrategyCard, useStrategySecondary, passStrategySecondary } from '../lib/edgeFunctions.js'

async function fetchAgendaTopCards(gameId) {
  const { data } = await supabase
    .from('game_agenda_deck')
    .select('agenda_cards(id, name, text)')
    .eq('game_id', gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(2)
  return ((data ?? []).map((row) => row.agenda_cards).filter(Boolean))
}

export function useStrategyCards(gameId, myPlayerId) {
  const [activePay, setActivePay] = useState(null)
  const [responses, setResponses] = useState([])
  const [agendaPeekCards, setAgendaPeekCards] = useState(null)
  const [warfareHomeSystemKey, setWarfareHomeSystemKey] = useState(null)

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
  }, [activePay?.id])  // eslint-disable-line react-hooks/exhaustive-deps -- only resubscribe when play ID changes, not on status updates to the same play row

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
    agendaPeekCards,
    clearAgendaPeekCards: () => setAgendaPeekCards(null),
    warfareHomeSystemKey,
    clearWarfareHomeSystemKey: () => setWarfareHomeSystemKey(null),
    fetchAgendaTopCards: () => fetchAgendaTopCards(gameId),
    playPrimary: async (abilityId, selections) => {
      const result = await playStrategyCard(gameId, abilityId, selections)
      if (result?.peek_cards) setAgendaPeekCards(result.peek_cards)
      return result
    },
    useSecondary: async (abilityId, selections) => {
      const result = await useStrategySecondary(gameId, activePay?.id, abilityId, selections)
      if (result?.home_system_key) setWarfareHomeSystemKey(result.home_system_key)
      return result
    },
    passSecondary: () => passStrategySecondary(gameId, activePay?.id),
  }
}
