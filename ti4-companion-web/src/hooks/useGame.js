import { useState, useEffect, startTransition } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  updateGameSettings, pickFactionColor, setSpeaker, startGame,
  endTurn, passAction, advancePhase, scoreObjective,
  revealObjective, shuffleDeck, updateCommandTokens,
  drawActionCard, discardActionCard,
  researchTechnology, discardSecretObjective,
  scoreSecretObjective, statusPhase,
  drawAgenda, castVotes, resolveAgenda,
  createTransaction, confirmTransaction, rejectTransaction, rescindTransaction, playPromissoryNote,
} from '../lib/edgeFunctions.js'

export function useGame(code, userId) {
  const navigate = useNavigate()
  const location = useLocation()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [objectives, setObjectives] = useState([])
  const [planets, setPlanets] = useState([])
  const [myCards, setMyCards] = useState([])
  const [mySecrets, setMySecrets] = useState([])
  const [myNotes, setMyNotes] = useState([])
  const [pendingIncomingTrades, setPendingIncomingTrades] = useState([])
  const [agendaVotes, setAgendaVotes] = useState([])
  const [enactedLaws, setEnactedLaws] = useState([])
  const [currentAgenda, setCurrentAgenda] = useState(null)
  const [combats, setCombats] = useState([])
  const [myRelicFragments, setMyRelicFragments] = useState([])
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
      let mySecretsData = []
      let myNotesData = []
      let pendingIncomingTradesData = []
      let enactedLawsData = []
      let currentAgendaData = null
      let combatsData = []
      let myRelicFragmentsData = []
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

          const { data: secrets } = await supabase
            .from('game_player_secret_objectives')
            .select('*, secret_objectives(name, timing, condition)')
            .eq('game_id', gameData.id)
            .eq('player_id', myPlayer.id)
            .eq('state', 'held')
          if (!mounted) return
          mySecretsData = secrets ?? []

          const { data: notes } = await supabase
            .from('game_player_promissory_notes')
            .select('id, state, held_by_player_id, note_id, promissory_notes(name, text, into_play_area), origin_player_id')
            .eq('game_id', gameData.id)
            .eq('held_by_player_id', myPlayer.id)
          if (!mounted) return
          myNotesData = notes ?? []

          const { data: trades } = await supabase
            .from('game_transactions')
            .select('*')
            .eq('game_id', gameData.id)
            .eq('to_player_id', myPlayer.id)
            .eq('status', 'pending')
          if (!mounted) return
          pendingIncomingTradesData = trades ?? []

          const { data: relicFrags } = await supabase
            .from('game_exploration_decks')
            .select('id, relic_fragment_type')
            .eq('game_id', gameData.id)
            .eq('resolved_by_player_id', myPlayer.id)
            .eq('state', 'held')
            .not('relic_fragment_type', 'is', null)
          if (!mounted) return
          myRelicFragmentsData = relicFrags ?? []
        }

        const { data } = await supabase
          .from('game_combats')
          .select('*')
          .eq('game_id', gameData.id)
        if (!mounted) return
        combatsData = data ?? []
        // fetch enacted laws
        const { data: laws } = await supabase
          .from('game_laws')
          .select('*, agendas(name, note)')
          .eq('game_id', gameData.id)
        if (!mounted) return
        enactedLawsData = laws ?? []

        // fetch current agenda card if one is in play
        if (gameData.agenda_current_card_id) {
          const { data: ag } = await supabase
            .from('agendas')
            .select('*')
            .eq('id', gameData.agenda_current_card_id)
            .maybeSingle()
          if (!mounted) return
          currentAgendaData = ag ?? null
        }
      }

      setGame(gameData)
      setPlayers(playersData ?? [])
      setObjectives(objectivesData)
      setPlanets(planetsData)
      setMyCards(myCardsData)
      setMySecrets(mySecretsData)
      setMyNotes(myNotesData)
      setPendingIncomingTrades(pendingIncomingTradesData)
      setAgendaVotes([])
      setEnactedLaws(enactedLawsData)
      setCurrentAgenda(currentAgendaData)
      setCombats(combatsData ?? [])
      setMyRelicFragments(myRelicFragmentsData)
      setLoading(false)

      channel = supabase
        .channel(`session:${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          async (payload) => {
            if (!mounted) return
            startTransition(() => { setGame(prev => ({ ...prev, ...payload.new })) })
            // Re-fetch current agenda when card changes
            if (payload.new.agenda_current_card_id !== payload.old?.agenda_current_card_id) {
              if (payload.new.agenda_current_card_id) {
                const { data: ag } = await supabase
                  .from('agendas')
                  .select('*')
                  .eq('id', payload.new.agenda_current_card_id)
                  .maybeSingle()
                if (mounted) setCurrentAgenda(ag ?? null)
              } else {
                setCurrentAgenda(null)
                // Re-fetch laws after resolution
                const { data: updatedLaws } = await supabase
                  .from('game_laws')
                  .select('*, agendas(name, note)')
                  .eq('game_id', gameData.id)
                if (mounted && updatedLaws) setEnactedLaws(updatedLaws)
              }
            }
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
            startTransition(() => {
              setPlayers(prev => {
                if (payload.eventType === 'INSERT') return [...prev, payload.new]
                if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
                if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
                return prev
              })
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
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_player_secret_objectives', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted || !myPlayer) return
              const { data } = await supabase
                .from('game_player_secret_objectives')
                .select('*, secret_objectives(name, timing, condition)')
                .eq('game_id', gameData.id)
                .eq('player_id', myPlayer.id)
                .eq('state', 'held')
              if (mounted && data) setMySecrets(data)
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_agenda_votes', filter: `game_id=eq.${gameData.id}` },
            (payload) => {
              if (!mounted) return
              setAgendaVotes(prev => {
                if (payload.eventType === 'INSERT') return [...prev, payload.new]
                if (payload.eventType === 'UPDATE') return prev.map(v => v.id === payload.new.id ? payload.new : v)
                if (payload.eventType === 'DELETE') return prev.filter(v => v.id !== payload.old.id)
                return prev
              })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_player_promissory_notes', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted || !myPlayer) return
              const { data } = await supabase
                .from('game_player_promissory_notes')
                .select('id, state, held_by_player_id, note_id, promissory_notes(name, text, into_play_area), origin_player_id')
                .eq('game_id', gameData.id)
                .eq('held_by_player_id', myPlayer.id)
              if (mounted && data) setMyNotes(data)
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_transactions', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted || !myPlayer) return
              const { data } = await supabase
                .from('game_transactions')
                .select('*')
                .eq('game_id', gameData.id)
                .eq('to_player_id', myPlayer.id)
                .eq('status', 'pending')
              if (mounted && data) setPendingIncomingTrades(data)
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_combats', filter: `game_id=eq.${gameData.id}` },
            async () => {
              const { data } = await supabase.from('game_combats').select('*').eq('game_id', gameData.id)
              if (mounted) setCombats(data ?? [])
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

  async function refetchPlayers() {
    if (!game?.id) return
    const { data } = await supabase.from('game_players').select('*').eq('game_id', game.id)
    if (data) setPlayers(data)
  }

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

  function createTheTransaction(toPlayerId, offer, request) {
    return game ? createTransaction(game.id, toPlayerId, offer, request) : Promise.reject(new Error('Game not loaded'))
  }

  function confirmTheTransaction(transactionId) {
    return game ? confirmTransaction(game.id, transactionId) : Promise.reject(new Error('Game not loaded'))
  }

  function rejectTheTransaction(transactionId) {
    return game ? rejectTransaction(game.id, transactionId) : Promise.reject(new Error('Game not loaded'))
  }

  function rescindTheTransaction(transactionId) {
    return game ? rescindTransaction(game.id, transactionId) : Promise.reject(new Error('Game not loaded'))
  }

  function playTheNote(noteInstanceId, options = {}) {
    return game ? playPromissoryNote(game.id, noteInstanceId, options) : Promise.reject(new Error('Game not loaded'))
  }

  return {
    game,
    players,
    objectives,
    planets,
    myCards,
    mySecrets,
    myNotes,
    pendingIncomingTrades,
    combats,
    currentPlayer,
    isEliminated: currentPlayer?.eliminated ?? false,
    isHost,
    loading,
    error,
    refetchPlayers,
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
    // Phase 4a wrappers (tech research)
    researchTech: (techName, exhaustPlanetIds, bypassPrerequisites) =>
      game ? researchTechnology(game.id, techName, exhaustPlanetIds, bypassPrerequisites) : Promise.reject(new Error('Game not loaded')),
    // Phase 6 wrappers
    discardTheSecret: (objectiveId) => game ? discardSecretObjective(game.id, objectiveId) : Promise.reject(new Error('Game not loaded')),
    scoreTheSecret: (objectiveId) => game ? scoreSecretObjective(game.id, objectiveId) : Promise.reject(new Error('Game not loaded')),
    endStatusPhase: () => game ? statusPhase(game.id) : Promise.reject(new Error('Game not loaded')),
    // Phase 7 wrappers (agenda)
    agendaVotes,
    enactedLaws,
    currentAgenda,
    drawTheAgenda: () => game ? drawAgenda(game.id) : Promise.reject(new Error('Game not loaded')),
    castTheVotes: (payload) => game ? castVotes(game.id, payload) : Promise.reject(new Error('Game not loaded')),
    resolveTheAgenda: (agendaId, electedTarget) => game ? resolveAgenda(game.id, agendaId, electedTarget) : Promise.reject(new Error('Game not loaded')),
    // Phase 8 wrappers (promissory notes & transactions)
    createTheTransaction,
    confirmTheTransaction,
    rejectTheTransaction,
    rescindTheTransaction,
    playTheNote,
    // Phase 45 additions
    myRelicFragments,
  }
}
