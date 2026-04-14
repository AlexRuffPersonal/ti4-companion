import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  updateGameSettings, pickFactionColor, setSpeaker, startGame,
  endTurn, passAction, advancePhase, scoreObjective,
  revealObjective, shuffleDeck, updateCommandTokens,
  drawActionCard, discardActionCard,
} from '../lib/edgeFunctions.js'

export function useGame(code, userId) {
  const navigate = useNavigate()
  const location = useLocation()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [objectives, setObjectives] = useState([])
  const [planets, setPlanets] = useState([])
  const [myCards, setMyCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isGameScreen = location.pathname.startsWith('/game/')

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

      if (gameData.status === 'active' && !isGameScreen) {
        navigate(`/game/${code}`, { replace: true })
        return
      }

      let objectivesData = []
      let planetsData = []
      let myCardsData = []
      let myPlayer = null

      if (isGameScreen) {
        const { data: objs } = await supabase
          .from('game_public_objectives')
          .select('*, public_objectives(name, stage, points, condition)')
          .eq('game_id', gameData.id)
        if (!mounted) return
        objectivesData = objs ?? []

        const { data: pls } = await supabase
          .from('game_player_planets')
          .select('*')
          .eq('game_id', gameData.id)
        if (!mounted) return
        planetsData = pls ?? []

        myPlayer = (playersData ?? []).find(p => p.user_id === userId) ?? null
        if (myPlayer) {
          const { data: cards } = await supabase
            .from('game_action_card_deck')
            .select('*, action_cards(name, timing, text)')
            .eq('game_id', gameData.id)
            .eq('held_by_player_id', myPlayer.id)
          if (!mounted) return
          myCardsData = cards ?? []
        }
      }

      setGame(gameData)
      setPlayers(playersData ?? [])
      setObjectives(objectivesData)
      setPlanets(planetsData)
      setMyCards(myCardsData)
      setLoading(false)

      channel = supabase
        .channel(`session:${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setGame(prev => ({ ...prev, ...payload.new }))
            if (payload.new.status === 'active' && !isGameScreen) {
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

      if (isGameScreen) {
        channel
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_public_objectives', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted) return
              const { data } = await supabase
                .from('game_public_objectives')
                .select('*, public_objectives(name, stage, points, condition)')
                .eq('game_id', gameData.id)
              if (mounted && data) setObjectives(data)
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_player_planets', filter: `game_id=eq.${gameData.id}` },
            (payload) => {
              if (!mounted) return
              setPlanets(prev => {
                if (payload.eventType === 'INSERT') return [...prev, payload.new]
                if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
                if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
                return prev
              })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_action_card_deck', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted || !myPlayer) return
              const { data } = await supabase
                .from('game_action_card_deck')
                .select('*, action_cards(name, timing, text)')
                .eq('game_id', gameData.id)
                .eq('held_by_player_id', myPlayer.id)
              if (mounted && data) setMyCards(data)
            }
          )
      }

      channel.subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, userId])

  const currentPlayer = players.find(p => p.user_id === userId) ?? null
  const isHost = game?.host_user_id === userId

  async function exhaustPlanet(planetName) {
    if (!currentPlayer) return
    await supabase
      .from('game_player_planets')
      .update({ exhausted: true })
      .eq('game_id', game.id)
      .eq('player_id', currentPlayer.id)
      .eq('planet_name', planetName)
  }

  async function readyPlanet(planetName) {
    if (!currentPlayer) return
    await supabase
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', game.id)
      .eq('player_id', currentPlayer.id)
      .eq('planet_name', planetName)
  }

  async function pickStrategyCard(card) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ strategy_card: card })
      .eq('id', currentPlayer.id)
  }

  async function updateCommodities(n) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ commodities: n })
      .eq('id', currentPlayer.id)
  }

  async function updateTradeGoods(n) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ trade_goods: n })
      .eq('id', currentPlayer.id)
  }

  async function cycleLeader(leaderType, newStatus) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ leaders: { ...currentPlayer.leaders, [leaderType]: newStatus } })
      .eq('id', currentPlayer.id)
  }

  return {
    game,
    players,
    objectives,
    planets,
    myCards,
    currentPlayer,
    isHost,
    loading,
    error,
    // Phase 2 wrappers (lobby)
    updateSettings: (settings) => game ? updateGameSettings(game.id, settings) : Promise.reject(new Error('Game not loaded')),
    pickFaction: (faction, colour) => game ? pickFactionColor(game.id, faction, colour) : Promise.reject(new Error('Game not loaded')),
    setGameSpeaker: (playerId) => game ? setSpeaker(game.id, playerId) : Promise.reject(new Error('Game not loaded')),
    startTheGame: () => game ? startGame(game.id) : Promise.reject(new Error('Game not loaded')),
    // Phase 3 wrappers (in-game)
    endTheTurn: () => game ? endTurn(game.id) : Promise.reject(new Error('Game not loaded')),
    passTheAction: () => game ? passAction(game.id) : Promise.reject(new Error('Game not loaded')),
    advanceThePhase: () => game ? advancePhase(game.id) : Promise.reject(new Error('Game not loaded')),
    scoreAnObjective: (objectiveId, playerId) => game ? scoreObjective(game.id, objectiveId, playerId) : Promise.reject(new Error('Game not loaded')),
    revealAnObjective: (stage) => game ? revealObjective(game.id, stage) : Promise.reject(new Error('Game not loaded')),
    shuffleTheDeck: (deckType) => game ? shuffleDeck(game.id, deckType) : Promise.reject(new Error('Game not loaded')),
    updateTokens: (tokens) => game ? updateCommandTokens(game.id, tokens) : Promise.reject(new Error('Game not loaded')),
    exhaustPlanet,
    readyPlanet,
    pickStrategyCard,
    updateCommodities,
    updateTradeGoods,
    cycleLeader,
    // Phase 4b wrappers (action cards)
    drawTheActionCard: () => game ? drawActionCard(game.id) : Promise.reject(new Error('Game not loaded')),
    discardTheActionCard: (cardId) => game ? discardActionCard(game.id, cardId) : Promise.reject(new Error('Game not loaded')),
  }
}
