import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  fireSpaceCannon as fireSpaceCannonFn,
  rollCombatDice as rollCombatDiceFn,
  assignHits as assignHitsFn,
  declareRetreat as declareRetreatFn,
} from '../lib/edgeFunctions.js'

export function useCombat(gameId, combatId) {
  const [combat, setCombat] = useState(null)

  useEffect(() => {
    if (!gameId || !combatId) {
      setCombat(null)
      return
    }
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_combats')
        .select('*')
        .eq('id', combatId)
        .maybeSingle()
      if (mounted && data) setCombat(data)

      channel = supabase
        .channel(`combat:${combatId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_combats', filter: `id=eq.${combatId}` },
          (payload) => {
            if (!mounted) return
            if (payload.eventType === 'UPDATE') setCombat(payload.new)
            if (payload.eventType === 'DELETE') setCombat(null)
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [gameId, combatId])

  return {
    combat,
    fireSpaceCannon: (pass) => fireSpaceCannonFn(gameId, combatId, pass),
    rollDice: () => rollCombatDiceFn(gameId, combatId),
    assignHits: (casualties) => assignHitsFn(gameId, combatId, casualties),
    declareRetreat: (destination) => declareRetreatFn(gameId, combatId, destination),
  }
}