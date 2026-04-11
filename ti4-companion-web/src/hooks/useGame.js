import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { updateGameSettings, pickFactionColor, setSpeaker, startGame } from '../lib/edgeFunctions.js'

export function useGame(code, userId) {
  const navigate = useNavigate()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!code || !userId) return

    let channel = null
    let mounted = true

    async function load() {
      setLoading(true)
      setError(null)

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', code.toUpperCase())
        .maybeSingle()

      if (!mounted) return
      if (gameError) { setError('Failed to load game'); setLoading(false); return }
      if (!gameData) { setError('Game not found'); setLoading(false); return }

      const { data: playersData, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)

      if (!mounted) return
      if (playersError) { setError('Failed to load players'); setLoading(false); return }

      const isInGame = (playersData ?? []).some(p => p.user_id === userId)
      if (!isInGame) {
        navigate('/setup', { replace: true })
        return
      }

      setGame(gameData)
      setPlayers(playersData ?? [])
      setLoading(false)

      if (gameData.status === 'active') {
        navigate(`/game/${code}`, { replace: true })
        return
      }

      channel = supabase
        .channel(`lobby:${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setGame(prev => ({ ...prev, ...payload.new }))
            if (payload.new.status === 'active') {
              navigate(`/game/${code}`, { replace: true })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setPlayers(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
              return prev
            })
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [code, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentPlayer = players.find(p => p.user_id === userId) ?? null
  const isHost = game?.host_user_id === userId

  return {
    game,
    players,
    currentPlayer,
    isHost,
    loading,
    error,
    updateSettings: (settings) => updateGameSettings(game.id, settings),
    pickFaction: (faction, colour) => pickFactionColor(game.id, faction, colour),
    setGameSpeaker: (playerId) => setSpeaker(game.id, playerId),
    startTheGame: () => startGame(game.id),
  }
}
