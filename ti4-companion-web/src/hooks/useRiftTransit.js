import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { rollRiftDice } from '../lib/edgeFunctions.js'

export function useRiftTransit(gameId) {
  const [activeTransit, setActiveTransit] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const channel = supabase
      .channel(`rift_transit_${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_rift_transits',
        filter: `game_id=eq.${gameId}`,
      }, (payload) => {
        if (payload.new?.status === 'pending') setActiveTransit(payload.new)
        else if (payload.new?.status === 'complete') setActiveTransit(null)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  const rollAll = async () => {
    setLoading(true); setError(null)
    try { await rollRiftDice(activeTransit.id, true, undefined) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const rollOne = async (unitId) => {
    setLoading(true); setError(null)
    try { await rollRiftDice(activeTransit.id, false, unitId) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return { activeTransit, loading, error, rollAll, rollOne }
}
