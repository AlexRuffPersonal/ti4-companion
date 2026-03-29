import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

// ─── Default player state ─────────────────────────────────────────────────────

export function defaultPlayer(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: '',
    faction: '',
    colour: 'yellow',
    vp: 0,
    strategyCard: null,
    strategyCard2: null, // for 3-4 player games
    passed: false,
    commandTokens: { tactic: 3, fleet: 3, strategy: 2 },
    commodities: 3,
    tradeGoods: 0,
    technologies: [],
    leaders: { agent: 'ready', commander: 'locked', hero: 'locked' },
    breakthrough: false,
    secretObjectivesHeld: 1,
    secretObjectivesScored: 0,
    promissoryNotes: [],
    canEditAll: false, // host-granted permission
    ...overrides,
  }
}

// ─── Default game state ───────────────────────────────────────────────────────

export function defaultGameState() {
  return {
    round: 1,
    phase: 'strategy',
    vpGoal: 10,
    speakerId: null,
    custodiansClaimed: false,
    agendaPhaseUnlocked: false,
    expansions: { base: true, pok: true, te: true },
    galacticEvent: null,
    players: [],
    laws: [],
    agendaDeck: [], // remaining agenda indices
    agendaDiscard: [],
    currentAgendas: [], // the 1-2 being voted on this phase
    agendaVotes: {}, // { playerId: { choice, votes } }
    transactions: [],
    theFractureInPlay: false,
    thundersEdgeInPlay: false,
    thundersEdgeSlices: {}, // { playerId: sliceIndex[] }
    permissions: {}, // { playerId: 'own' | 'all' }
    hostId: null,
    createdAt: null,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameState() {
  const [gameState, setGameState] = useState(null)
  const [roomCode, setRoomCode]   = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [syncing, setSyncing]     = useState(false)
  const channelRef = useRef(null)

  // ── Persist player ID across sessions ──
  useEffect(() => {
    let id = localStorage.getItem('ti4:playerId')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('ti4:playerId', id)
    }
    setMyPlayerId(id)

    // Rejoin last room if any
    const lastRoom = localStorage.getItem('ti4:lastRoom')
    if (lastRoom) {
      joinGame(lastRoom, id).catch(() => {
        localStorage.removeItem('ti4:lastRoom')
      })
    }
  }, [])

  // ── Subscribe to realtime changes ──
  const subscribeToRoom = useCallback((code) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`room:${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `code=eq.${code}` },
        (payload) => {
          setGameState(payload.new.state)
          setSyncing(false)
        }
      )
      .subscribe()

    channelRef.current = channel
  }, [])

  // ── Create game ──
  const createGame = useCallback(async (initialState) => {
    setLoading(true)
    setError(null)
    try {
      const code = generateRoomCode()
      const state = {
        ...defaultGameState(),
        ...initialState,
        hostId: myPlayerId,
        createdAt: new Date().toISOString(),
      }

      const { error: err } = await supabase
        .from('games')
        .insert({ code, state })

      if (err) throw err

      setRoomCode(code)
      setGameState(state)
      localStorage.setItem('ti4:lastRoom', code)
      subscribeToRoom(code)
      return code
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [myPlayerId, subscribeToRoom])

  // ── Join game ──
  const joinGame = useCallback(async (code, playerIdOverride) => {
    const pid = playerIdOverride || myPlayerId
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('games')
        .select('state')
        .eq('code', code.toUpperCase())
        .single()

      if (err) throw new Error('Room not found. Check the code and try again.')

      setRoomCode(code.toUpperCase())
      setGameState(data.state)
      localStorage.setItem('ti4:lastRoom', code.toUpperCase())
      subscribeToRoom(code.toUpperCase())
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [myPlayerId, subscribeToRoom])

  // ── Core update function — all mutations go through here ──
  const updateGame = useCallback(async (updater) => {
    if (!roomCode || !gameState) return
    setSyncing(true)

    const newState = typeof updater === 'function'
      ? updater(gameState)
      : { ...gameState, ...updater }

    // Optimistic local update
    setGameState(newState)

    try {
      const { error: err } = await supabase
        .from('games')
        .update({ state: newState })
        .eq('code', roomCode)

      if (err) throw err
    } catch (e) {
      // Revert on failure
      setGameState(gameState)
      setError(e.message)
      setSyncing(false)
    }
  }, [roomCode, gameState])

  // ── Player helpers ──

  const updatePlayer = useCallback((playerId, updater) => {
    updateGame(state => ({
      ...state,
      players: state.players.map(p =>
        p.id === playerId
          ? (typeof updater === 'function' ? updater(p) : { ...p, ...updater })
          : p
      )
    }))
  }, [updateGame])

  const adjustPlayerVP = useCallback((playerId, delta) => {
    updatePlayer(playerId, p => ({
      ...p,
      vp: Math.max(0, p.vp + delta)
    }))
  }, [updatePlayer])

  const adjustCounter = useCallback((playerId, field, delta, min = 0, max = 99) => {
    if (field === 'commandTokens') return
    updatePlayer(playerId, p => ({
      ...p,
      [field]: Math.max(min, Math.min(max, (p[field] || 0) + delta))
    }))
  }, [updatePlayer])

  const adjustCommandToken = useCallback((playerId, pool, delta) => {
    updatePlayer(playerId, p => ({
      ...p,
      commandTokens: {
        ...p.commandTokens,
        [pool]: Math.max(0, Math.min(16, p.commandTokens[pool] + delta))
      }
    }))
  }, [updatePlayer])

  const toggleTechnology = useCallback((playerId, tech) => {
    updatePlayer(playerId, p => ({
      ...p,
      technologies: p.technologies.includes(tech)
        ? p.technologies.filter(t => t !== tech)
        : [...p.technologies, tech]
    }))
  }, [updatePlayer])

  const setLeaderStatus = useCallback((playerId, leader, status) => {
    updatePlayer(playerId, p => ({
      ...p,
      leaders: { ...p.leaders, [leader]: status }
    }))
  }, [updatePlayer])

  const assignStrategyCard = useCallback((playerId, cardId, slot = 1) => {
    updatePlayer(playerId, p => ({
      ...p,
      strategyCard: slot === 1 ? cardId : p.strategyCard,
      strategyCard2: slot === 2 ? cardId : p.strategyCard2,
    }))
  }, [updatePlayer])

  const togglePassed = useCallback((playerId) => {
    updatePlayer(playerId, p => ({ ...p, passed: !p.passed }))
  }, [updatePlayer])

  // ── Phase / Round control ──

  const advancePhase = useCallback(() => {
    updateGame(state => {
      const phases = state.agendaPhaseUnlocked
        ? ['strategy', 'action', 'status', 'agenda']
        : ['strategy', 'action', 'status']
      const currentIndex = phases.indexOf(state.phase)
      const nextIndex = (currentIndex + 1) % phases.length
      const nextPhase = phases[nextIndex]
      const newRound = nextIndex === 0 ? state.round + 1 : state.round

      // Reset passed status on new strategy phase
      const players = nextPhase === 'strategy'
        ? state.players.map(p => ({ ...p, passed: false, strategyCard: null, strategyCard2: null }))
        : state.players

      return { ...state, phase: nextPhase, round: newRound, players }
    })
  }, [updateGame])

  const claimCustodians = useCallback((playerId) => {
    updateGame(state => ({
      ...state,
      custodiansClaimed: true,
      agendaPhaseUnlocked: true,
      players: state.players.map(p =>
        p.id === playerId ? { ...p, vp: p.vp + 1 } : p
      )
    }))
  }, [updateGame])

  // ── Agenda phase ──

  const drawAgenda = useCallback(() => {
    updateGame(state => {
      if (state.agendaDeck.length === 0) return state
      const [drawn, ...remaining] = state.agendaDeck
      return {
        ...state,
        agendaDeck: remaining,
        currentAgendas: [...(state.currentAgendas || []), drawn],
      }
    })
  }, [updateGame])

  const castVote = useCallback((playerId, agendaIndex, choice, votes) => {
    updateGame(state => ({
      ...state,
      agendaVotes: {
        ...state.agendaVotes,
        [`${agendaIndex}-${playerId}`]: { choice, votes }
      }
    }))
  }, [updateGame])

  const resolveAgenda = useCallback((agendaIndex, outcome, isLaw) => {
    updateGame(state => {
      const agenda = state.currentAgendas[agendaIndex]
      const newLaws = isLaw && outcome === 'for'
        ? [...state.laws, agenda]
        : state.laws
      const newCurrentAgendas = state.currentAgendas.filter((_, i) => i !== agendaIndex)
      const newDiscard = [...state.agendaDiscard, agenda]

      // Clear votes for this agenda
      const newVotes = Object.fromEntries(
        Object.entries(state.agendaVotes).filter(([k]) => !k.startsWith(`${agendaIndex}-`))
      )

      return {
        ...state,
        currentAgendas: newCurrentAgendas,
        agendaDiscard: newDiscard,
        agendaVotes: newVotes,
        laws: newLaws,
      }
    })
  }, [updateGame])

  const repealLaw = useCallback((lawName) => {
    updateGame(state => ({
      ...state,
      laws: state.laws.filter(l => l !== lawName)
    }))
  }, [updateGame])

  // ── Permissions ──

  const setPlayerPermission = useCallback((targetPlayerId, level) => {
    updateGame(state => ({
      ...state,
      permissions: {
        ...state.permissions,
        [targetPlayerId]: level
      }
    }))
  }, [updateGame])

  // ── Transactions ──

  const logTransaction = useCallback((fromId, toId, items) => {
    updateGame(state => ({
      ...state,
      transactions: [
        ...state.transactions,
        {
          id: crypto.randomUUID(),
          fromId,
          toId,
          items,
          round: state.round,
          phase: state.phase,
          timestamp: new Date().toISOString(),
        }
      ]
    }))
  }, [updateGame])

  // ── Thunder's Edge ──

  const claimExpeditionSlice = useCallback((playerId, sliceIndex) => {
    updateGame(state => {
      const existing = state.thundersEdgeSlices[playerId] || []
      const newSlices = { ...state.thundersEdgeSlices, [playerId]: [...existing, sliceIndex] }
      const allClaimed = Object.values(newSlices).flat().length >= 6

      // First slice = breakthrough
      const isFirst = existing.length === 0
      const players = isFirst
        ? state.players.map(p => p.id === playerId ? { ...p, breakthrough: true } : p)
        : state.players

      return {
        ...state,
        thundersEdgeSlices: newSlices,
        thundersEdgeInPlay: allClaimed,
        players,
      }
    })
  }, [updateGame])

  const triggerFracture = useCallback(() => {
    updateGame(state => ({ ...state, theFractureInPlay: true }))
  }, [updateGame])

  // ── Helpers ──

  const isHost = myPlayerId && gameState?.hostId === myPlayerId

  const canEdit = useCallback((targetPlayerId) => {
    if (!gameState || !myPlayerId) return false
    if (gameState.hostId === myPlayerId) return true
    if (myPlayerId === targetPlayerId) return true
    return gameState.permissions?.[myPlayerId] === 'all'
  }, [gameState, myPlayerId])

  const leaveGame = useCallback(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    localStorage.removeItem('ti4:lastRoom')
    setGameState(null)
    setRoomCode(null)
  }, [])

  return {
    // State
    gameState,
    roomCode,
    myPlayerId,
    loading,
    error,
    syncing,
    isHost,

    // Room
    createGame,
    joinGame,
    leaveGame,
    setError,

    // Game mutations
    updateGame,
    updatePlayer,
    adjustPlayerVP,
    adjustCounter,
    adjustCommandToken,
    toggleTechnology,
    setLeaderStatus,
    assignStrategyCard,
    togglePassed,

    // Phase control
    advancePhase,
    claimCustodians,

    // Agenda
    drawAgenda,
    castVote,
    resolveAgenda,
    repealLaw,

    // Permissions
    setPlayerPermission,
    canEdit,

    // Transactions
    logTransaction,

    // Thunder's Edge
    claimExpeditionSlice,
    triggerFracture,
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function getInitiativeOrder(players) {
  return [...players]
    .filter(p => p.strategyCard != null)
    .sort((a, b) => a.strategyCard - b.strategyCard)
}

export function getLeaderWithMostVP(players) {
  return players.reduce((best, p) => (!best || p.vp > best.vp) ? p : best, null)
}

export function getPlayerWithFewestVP(players) {
  return players.reduce((least, p) => (!least || p.vp < least.vp) ? p : least, null)
}
