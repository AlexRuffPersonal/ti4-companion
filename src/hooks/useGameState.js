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
    strategyCard2: null,
    passed: false,
    commandTokens: { tactic: 3, fleet: 3, strategy: 2 },
    commodities: 3,
    tradeGoods: 0,
    technologies: [],
    // BUG #2 FIX: agent starts 'unlocked' (always available per rules),
    // commander and hero start 'locked'. Removed invalid 'ready' status.
    leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
    breakthrough: false,
    secretObjectivesHeld: 1,
    secretObjectivesScored: 0,
    promissoryNotes: [],
    canEditAll: false,
    ...overrides,
  }
}

// ─── Starting technologies per faction ───────────────────────────────────────
// BUG #11 FIX: pre-populate faction starting techs at setup

const FACTION_STARTING_TECHS = {
  'The Arborec':                   ['Magen Defense Grid'],
  'The Barony of Letnev':          ['Non-Euclidean Shielding', 'Antimass Deflectors'],
  'The Clan of Saar':              ['Chaos Mapping', 'Antimass Deflectors'],
  'The Embers of Muaat':           ['Magmus Reactor'],
  'The Emirates of Hacan':         ['Sarween Tools', 'Quantum Datahub Node'],
  'The Federation of Sol':         ['Neural Motivator', 'Antimass Deflectors'],
  'The Ghosts of Creuss':          ['Quantum Entanglement', 'Sling Relay'],
  'The L1Z1X Mindnet':             ['Neural Motivator', 'Spacial Conduit Cylinder'],
  'The Mentak Coalition':          ['Sarween Tools', 'Mirror Computing'],
  'The Naalu Collective':          ['Neural Motivator', 'Neuroglaive'],
  'The Nekro Virus':               ['Dacxive Animators', 'Valefar Assimilator X'],
  "Sardakk N'orr":                 [],
  'The Universities of Jol-Nar':   ['Neural Motivator', 'Antimass Deflectors', 'Sarween Tools'],
  'The Winnu':                     [],
  'The Xxcha Kingdom':             ['Instinct Training', 'Scanlink Drone Network'],
  'The Yin Brotherhood':           ['Sarween Tools', 'Predictive Intelligence'],
  'The Yssaril Tribes':            ['Neural Motivator', 'Mageon Implants'],
  'The Argent Flight':             ['Instinct Training', 'Aetherpassage'],
  'The Empyrean':                  ['Vortex', 'Bio-Stims'],
  'The Mahact Gene-Sorcerers':     ['Bio-Stims', 'Predictive Intelligence'],
  'The Naaz-Rokha Alliance':       ['Scanlink Drone Network', 'Supercharge'],
  'The Nomad':                     ['Sling Relay'],
  'The Titans of Ul':              ['Scanlink Drone Network', 'Spacial Conduit Cylinder'],
  "The Vuil'raith Cabal":          ['Chaos Mapping', 'Vortex Canon'],
  'The Council Keleres':           ['Scanlink Drone Network'],
  'Last Bastion':                  ['Duranium Armor'],
  'The Ral Nel Consortium':        ['Antimass Deflectors'],
  'The Crimson Rebellion':         ['Sarween Tools'],
  'The Deepwrought Scholarate':    ['Neural Motivator', 'Sarween Tools'],
  'The Firmament / The Obsidian':  ['Aetherpassage'],
}

export function getStartingTechs(faction) {
  return FACTION_STARTING_TECHS[faction] || []
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
    agendaDeck: [],
    agendaDiscard: [],
    currentAgendas: [],
    agendaVotes: {},
    transactions: [],
    theFractureInPlay: false,
    thundersEdgeInPlay: false,
    thundersEdgeSlices: {},
    permissions: {},
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

  // BUG #9 FIX: initialise playerId synchronously so it's available immediately
  // when createGame is called, avoiding the race condition where hostId was
  // written before myPlayerId state had resolved.
  const playerIdRef = useRef(null)
  if (!playerIdRef.current) {
    let id = localStorage.getItem('ti4:playerId')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('ti4:playerId', id)
    }
    playerIdRef.current = id
  }

  useEffect(() => {
    setMyPlayerId(playerIdRef.current)
    const lastRoom = localStorage.getItem('ti4:lastRoom')
    if (lastRoom) {
      joinGame(lastRoom, playerIdRef.current).catch(() => {
        localStorage.removeItem('ti4:lastRoom')
      })
    }
  }, [])

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
      // BUG #9 FIX: use ref directly — guaranteed to be set, no async race
      const hostId = playerIdRef.current
      const state = {
        ...defaultGameState(),
        ...initialState,
        hostId,
        createdAt: new Date().toISOString(),
      }

      const { error: err } = await supabase
        .from('games')
        .insert({ code, state })

      if (err) throw err

      setRoomCode(code)
      setGameState(state)
      setMyPlayerId(hostId)
      localStorage.setItem('ti4:lastRoom', code)
      subscribeToRoom(code)
      return code
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [subscribeToRoom])

  // ── Join game ──
  const joinGame = useCallback(async (code, playerIdOverride) => {
    const pid = playerIdOverride || playerIdRef.current
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
      setMyPlayerId(pid)
      localStorage.setItem('ti4:lastRoom', code.toUpperCase())
      subscribeToRoom(code.toUpperCase())
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [subscribeToRoom])

  // ── Core update ──
  const updateGame = useCallback(async (updater) => {
    if (!roomCode || !gameState) return
    setSyncing(true)

    const newState = typeof updater === 'function'
      ? updater(gameState)
      : { ...gameState, ...updater }

    setGameState(newState)

    try {
      const { error: err } = await supabase
        .from('games')
        .update({ state: newState })
        .eq('code', roomCode)

      if (err) throw err
    } catch (e) {
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
      strategyCard:  slot === 1 ? cardId : p.strategyCard,
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

      const players = nextPhase === 'strategy'
        ? state.players.map(p => ({ ...p, passed: false, strategyCard: null, strategyCard2: null }))
        : state.players

      return { ...state, phase: nextPhase, round: newRound, players }
    })
  }, [updateGame])

  // BUG #1 FIX: custodians claim now correctly awards +1 VP to the claimant
  // and also unlocks the agenda phase.
  const claimCustodians = useCallback((playerId) => {
    updateGame(state => ({
      ...state,
      custodiansClaimed: true,
      agendaPhaseUnlocked: true,
      players: state.players.map(p =>
        p.id === playerId ? { ...p, vp: (p.vp || 0) + 1 } : p
      )
    }))
  }, [updateGame])

  // ── Agenda phase ──

  const drawAgenda = useCallback(() => {
    updateGame(state => {
      if (!state.agendaDeck || state.agendaDeck.length === 0) return state
      const [drawn, ...remaining] = state.agendaDeck
      return {
        ...state,
        agendaDeck: remaining,
        currentAgendas: [...(state.currentAgendas || []), drawn],
        agendaVotes: state.agendaVotes || {},
      }
    })
  }, [updateGame])

  // BUG #7 FIX: vote key was using agendaIndex (position in currentAgendas array)
  // which changes after each resolve. Now keyed on the stable agenda deck index value.
  const castVote = useCallback((playerId, agendaDeckIndex, choice, votes) => {
    updateGame(state => ({
      ...state,
      agendaVotes: {
        ...state.agendaVotes,
        [`${agendaDeckIndex}-${playerId}`]: { choice, votes, playerId }
      }
    }))
  }, [updateGame])

  // BUG #6 FIX: laws were never persisting because the check was
  // `outcome === 'for'` but outcome is the display label e.g. 'Elect player'.
  // Fix: laws always persist when resolved (they are only drawn when in the
  // laws section of the deck). Directives are discarded. The isLaw flag
  // from the agenda type is the correct gate.
  const resolveAgenda = useCallback((agendaDeckIndex, outcome, isLaw) => {
    updateGame(state => {
      const agendaIdx = (state.currentAgendas || []).indexOf(agendaDeckIndex)
      if (agendaIdx === -1) return state

      const newCurrentAgendas = state.currentAgendas.filter(a => a !== agendaDeckIndex)
      const newDiscard = [...(state.agendaDiscard || []), agendaDeckIndex]

      // BUG #6 FIX: persist law if it IS a law type — outcome string is irrelevant
      const newLaws = isLaw
        ? [...(state.laws || []), agendaDeckIndex]
        : (state.laws || [])

      // Clear votes for this agenda
      const newVotes = Object.fromEntries(
        Object.entries(state.agendaVotes || {})
          .filter(([k]) => !k.startsWith(`${agendaDeckIndex}-`))
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

  const repealLaw = useCallback((agendaDeckIndex) => {
    updateGame(state => ({
      ...state,
      laws: (state.laws || []).filter(l => l !== agendaDeckIndex)
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
        ...(state.transactions || []),
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
      const existing = state.thundersEdgeSlices?.[playerId] || []
      const newSlices = { ...state.thundersEdgeSlices, [playerId]: [...existing, sliceIndex] }
      const allClaimed = Object.values(newSlices).flat().length >= 6
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

  // BUG #9 FIX: use ref for synchronous host check — state may lag behind ref
  const isHost = playerIdRef.current && gameState?.hostId === playerIdRef.current

  const canEdit = useCallback((targetPlayerId) => {
    if (!gameState) return false
    const pid = playerIdRef.current
    if (!pid) return false
    if (gameState.hostId === pid) return true
    if (pid === targetPlayerId) return true
    return gameState.permissions?.[pid] === 'all'
  }, [gameState])

  const leaveGame = useCallback(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    localStorage.removeItem('ti4:lastRoom')
    setGameState(null)
    setRoomCode(null)
  }, [])

  return {
    gameState,
    roomCode,
    myPlayerId: myPlayerId || playerIdRef.current,
    loading,
    error,
    syncing,
    isHost,

    createGame,
    joinGame,
    leaveGame,
    setError,

    updateGame,
    updatePlayer,
    adjustPlayerVP,
    adjustCounter,
    adjustCommandToken,
    toggleTechnology,
    setLeaderStatus,
    assignStrategyCard,
    togglePassed,

    advancePhase,
    claimCustodians,

    drawAgenda,
    castVote,
    resolveAgenda,
    repealLaw,

    setPlayerPermission,
    canEdit,

    logTransaction,
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
