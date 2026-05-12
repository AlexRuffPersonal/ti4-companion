import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { callFunction } from '../lib/edgeFunctions.js'

export function usePromissoryNotes(gameId, myPlayerId) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!gameId) return
    let mounted = true
    let channel = null

    async function load() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('game_player_promissory_notes')
        .select('*, promissory_notes(name, flavor_text)')
        .eq('game_id', gameId)
      if (!mounted) return
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      setNotes(data ?? [])
      setLoading(false)
    }

    load()

    channel = supabase
      .channel(`promissory-notes:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_player_promissory_notes', filter: `game_id=eq.${gameId}` },
        () => { if (mounted) load() }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const heldNotes = notes.filter(n => n.state === 'held' && n.held_by_player_id === myPlayerId)
  const inPlayNotes = notes.filter(n => n.state === 'in_play')

  return {
    heldNotes,
    inPlayNotes,
    loading,
    error,
    playNote: (noteInstanceId, selections = {}) =>
      callFunction('game-play-promissory-note', { game_id: gameId, note_instance_id: noteInstanceId, selections }),
  }
}
