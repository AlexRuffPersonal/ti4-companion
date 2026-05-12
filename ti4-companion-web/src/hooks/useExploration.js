import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  explorePlanet as explorePlanetFn,
  resolveExplorationCard as resolveExplorationCardFn,
  exploreFrontier as exploreFrontierFn,
  useRelicFragment as useRelicFragmentFn,
  useRelic as useRelicFn,
} from '../lib/edgeFunctions.js'

function canExplore(planetName) {
  return planetName !== 'Mecatol Rex'
}

export function useExploration({ currentPlayer, gameId, allPlanets, activePlayerId }) {
  const [allPlanetState, setAllPlanetState] = useState([])
  const [relicFragments, setRelicFragments] = useState([])
  const [relics, setRelics] = useState([])

  useEffect(() => {
    if (!gameId) return
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_player_planets')
        .select('*')
        .eq('game_id', gameId)
      if (mounted && data) setAllPlanetState(data)

      channel = supabase
        .channel(`exploration:planets:${gameId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_player_planets', filter: `game_id=eq.${gameId}` },
          async () => {
            if (!mounted) return
            const { data: refreshed } = await supabase
              .from('game_player_planets')
              .select('*')
              .eq('game_id', gameId)
            if (mounted && refreshed) setAllPlanetState(refreshed)
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

  useEffect(() => {
    if (!currentPlayer) return
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_exploration_decks')
        .select('*')
        .eq('resolved_by_player_id', currentPlayer.id)
        .eq('state', 'held')
      if (mounted && data) setRelicFragments(data)

      channel = supabase
        .channel(`exploration:fragments:${currentPlayer.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_exploration_decks', filter: `resolved_by_player_id=eq.${currentPlayer.id}` },
          async () => {
            if (!mounted) return
            const { data: refreshed } = await supabase
              .from('game_exploration_decks')
              .select('*')
              .eq('resolved_by_player_id', currentPlayer.id)
              .eq('state', 'held')
            if (mounted && refreshed) setRelicFragments(refreshed)
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [currentPlayer?.id])

  useEffect(() => {
    if (!currentPlayer) return
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_relic_deck')
        .select('*, relics(*)')
        .eq('held_by_player_id', currentPlayer.id)
      if (mounted && data) setRelics(data)

      channel = supabase
        .channel(`exploration:relics:${currentPlayer.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_relic_deck', filter: `held_by_player_id=eq.${currentPlayer.id}` },
          async () => {
            if (!mounted) return
            const { data: refreshed } = await supabase
              .from('game_relic_deck')
              .select('*, relics(*)')
              .eq('held_by_player_id', currentPlayer.id)
            if (mounted && refreshed) setRelics(refreshed)
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [currentPlayer?.id])

  if (!currentPlayer) {
    return {
      unexploredPlanets: [],
      relicFragments: [],
      relics: [],
      allPlanetState: [],
      isActivePlayer: false,
      explorePlanet: null,
      resolveExplorationCard: null,
      exploreFrontier: null,
      useRelicFragment: null,
      useRelic: null,
    }
  }

  const unexploredPlanets = allPlanetState.filter(
    (p) => p.player_id === currentPlayer.id && !p.explored && canExplore(p.planet_name)
  )

  const isActivePlayer = activePlayerId === currentPlayer.id

  return {
    unexploredPlanets,
    relicFragments,
    relics,
    allPlanetState,
    isActivePlayer,
    explorePlanet: (planetName, deckType) => explorePlanetFn(gameId, currentPlayer.id, planetName, deckType),
    resolveExplorationCard: (cardId, opts) => resolveExplorationCardFn(gameId, currentPlayer.id, cardId, opts),
    exploreFrontier: (systemKey) => exploreFrontierFn(gameId, currentPlayer.id, systemKey),
    useRelicFragment: (fragmentIds) => useRelicFragmentFn(gameId, currentPlayer.id, fragmentIds),
    useRelic: (relicId, choice) => useRelicFn(gameId, currentPlayer.id, relicId, choice),
  }
}
