import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { activateSystem as activateSystemFn, landTroops as landTroopsFn, moveShips as moveShipsFn } from '../lib/edgeFunctions.js'

export function useGalaxy(gameCode, userId) {
  const [gameId, setGameId] = useState(null)
  const [mapTiles, setMapTiles] = useState({})
  const [tileData, setTileData] = useState({})
  const [activations, setActivations] = useState([])
  const [allPlanets, setAllPlanets] = useState([])
  const [systemUnits, setSystemUnits] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [activeCombat, setActiveCombat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const gameIdRef = useRef(null)
  const roundRef = useRef(1)

  useEffect(() => {
    if (!gameCode || !userId) return
    let mounted = true
    let channel = null

    async function load() {
      setLoading(true)
      setError(null)

      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('id, map_tiles, round')
        .eq('code', gameCode.toUpperCase())
        .maybeSingle()

      if (!mounted) return
      if (gameError || !game) { setError('Failed to load game'); setLoading(false); return }

      gameIdRef.current = game.id
      roundRef.current = game.round
      setGameId(game.id)
      setMapTiles(game.map_tiles ?? {})

      const tileIds = Object.values(game.map_tiles ?? {}).map(t => t.tile_id)
      if (tileIds.length > 0) {
        const { data: tiles } = await supabase
          .from('tiles')
          .select('id, tile_number, planets, type, wormholes, anomalies')
          .in('id', tileIds)
        if (!mounted) return
        const indexed = {}
        for (const tile of tiles ?? []) indexed[tile.id] = tile
        setTileData(indexed)
      }

      const { data: acts } = await supabase
        .from('game_system_activations')
        .select('*')
        .eq('game_id', game.id)
        .eq('round', game.round)
      if (!mounted) return
      setActivations(acts ?? [])

      const { data: planets } = await supabase
        .from('game_player_planets')
        .select('*')
        .eq('game_id', game.id)
      if (!mounted) return
      setAllPlanets(planets ?? [])

      const { data: units } = await supabase
        .from('game_player_units')
        .select('*')
        .eq('game_id', game.id)
      if (!mounted) return
      setSystemUnits(units ?? [])

      const { data: myPlayer } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', game.id)
        .eq('user_id', userId)
        .maybeSingle()
      if (!mounted) return
      setMyPlayerId(myPlayer?.id ?? null)

      // Fetch active combat for this game
      const { data: combat } = await supabase
        .from('game_combats')
        .select('*')
        .eq('game_id', game.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!mounted) return
      setActiveCombat(combat ?? null)

      setLoading(false)

      channel = supabase
        .channel(`galaxy:${game.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
          async (payload) => {
            if (!mounted) return
            if (payload.new.map_tiles) setMapTiles(payload.new.map_tiles)
            if (payload.new.round && payload.new.round !== roundRef.current) {
              roundRef.current = payload.new.round
              const { data } = await supabase
                .from('game_system_activations')
                .select('*')
                .eq('game_id', gameIdRef.current)
                .eq('round', payload.new.round)
              if (mounted && data) setActivations(data)
            }
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_system_activations', filter: `game_id=eq.${game.id}` },
          async () => {
            if (!mounted) return
            const { data } = await supabase
              .from('game_system_activations')
              .select('*')
              .eq('game_id', gameIdRef.current)
              .eq('round', roundRef.current)
            if (mounted && data) setActivations(data)
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_planets', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            setAllPlanets(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
              if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
              return prev
            })
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_units', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            setSystemUnits(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(u => u.id === payload.new.id ? payload.new : u)
              if (payload.eventType === 'DELETE') return prev.filter(u => u.id !== payload.old.id)
              return prev
            })
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_combats', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            if (payload.eventType === 'INSERT') {
              setActiveCombat(payload.new)
            } else if (payload.eventType === 'UPDATE') {
              setActiveCombat(payload.new.status === 'complete' ? null : payload.new)
            } else if (payload.eventType === 'DELETE') {
              setActiveCombat(null)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, userId])

  const activatedSystems = new Set(activations.map(a => a.system_key))
  const myActivations = new Set(
    activations.filter(a => a.player_id === myPlayerId).map(a => a.system_key)
  )
  const planetOwnership = new Map(
    allPlanets.map(p => [p.planet_name, { player_id: p.player_id, exhausted: p.exhausted }])
  )

  const planetStaticMap = {}
  for (const tile of Object.values(tileData)) {
    for (const p of tile.planets ?? []) {
      planetStaticMap[p.name] = {
        resources:      p.resources,
        influence:      p.influence,
        tech_specialty: p.tech_specialty ?? null,
        traits:         p.type ?? [],
      }
    }
  }

  return {
    gameId,
    mapTiles,
    tileData,
    activations,
    allPlanets,
    systemUnits,
    activatedSystems,
    myActivations,
    planetOwnership,
    planetStaticMap,
    activeCombat,
    myPlayerId,
    loading,
    error,
    activateSystem: (systemKey) => activateSystemFn(gameId, systemKey),
    landTroops: (systemKey, planetName, troopCount) => landTroopsFn(gameId, systemKey, planetName, troopCount),
    moveShips: (payload) => moveShipsFn(gameId, payload),
  }
}