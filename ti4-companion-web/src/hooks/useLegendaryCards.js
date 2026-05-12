import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { exhaustLegendaryCard as exhaustLegendaryCardFn } from '../lib/edgeFunctions.js'

export function useLegendaryCards(gameId, myPlayerId) {
  const [allCards, setAllCards] = useState([])

  useEffect(() => {
    if (!gameId) {
      setAllCards([])
      return
    }
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_player_legendary_cards')
        .select('*')
        .eq('game_id', gameId)
      if (mounted && data) setAllCards(data)

      channel = supabase
        .channel('legendary_cards')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_player_legendary_cards', filter: `game_id=eq.${gameId}` },
          (payload) => {
            if (!mounted) return
            if (payload.eventType === 'INSERT') {
              setAllCards((prev) => [...prev, payload.new])
            } else if (payload.eventType === 'UPDATE') {
              setAllCards((prev) => prev.map((c) => (c.id === payload.new.id ? payload.new : c)))
            } else if (payload.eventType === 'DELETE') {
              setAllCards((prev) => prev.filter((c) => c.id !== payload.old.id))
            }
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [gameId])

  const myCards = allCards.filter((c) => c.player_id === myPlayerId)

  const exhaustCard = (planetName) => exhaustLegendaryCardFn(gameId, planetName)

  return { allCards, myCards, exhaustCard }
}
