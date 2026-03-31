import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

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
    leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
    breakthrough: false,
    secretObjectivesHeld: 1,
    secretObjectivesScored: 0,
    promissoryNotes: [],
    ...overrides,
  }
}

const FACTION_STARTING_TECHS = {
  'The Arborec': ['Magen Defense Grid'],
  'The Barony of Letnev': ['Non-Euclidean Shielding', 'Antimass Deflectors'],
  'The Clan of Saar': ['Chaos Mapping', 'Antimass Deflectors'],
  'The Embers of Muaat': ['Magmus Reactor'],
  'The Emirates of Hacan': ['Sarween Tools', 'Quantum Datahub Node'],
  'The Federation of Sol': ['Neural Motivator', 'Antimass Deflectors'],
  'The Ghosts of Creuss': ['Quantum Entanglement', 'Sling Relay'],
  'The L1Z1X Mindnet': ['Neural Motivator', 'Spacial Conduit Cylinder'],
  'The Mentak Coalition': ['Sarween Tools', 'Mirror Computing'],
  'The Naalu Collective': ['Neural Motivator', 'Neuroglaive'],
  'The Nekro Virus': ['Dacxive Animators', 'Valefar Assimilator X'],
  "Sardakk N'orr": [],
  'The Universities of Jol-Nar': ['Neural Motivator', 'Antimass Deflectors', 'Sarween Tools'],
  'The Winnu': [],
  'The Xxcha Kingdom': ['Instinct Training', 'Scanlink Drone Network'],
  'The Yin Brotherhood': ['Sarween Tools', 'Predictive Intelligence'],
  'The Yssaril Tribes': ['Neural Motivator', 'Mageon Implants'],
  'The Argent Flight': ['Instinct Training', 'Aetherpassage'],
  'The Empyrean': ['Vortex', 'Bio-Stims'],
  'The Mahact Gene-Sorcerers': ['Bio-Stims', 'Predictive Intelligence'],
  'The Naaz-Rokha Alliance': ['Scanlink Drone Network', 'Supercharge'],
  'The Nomad': ['Sling Relay'],
  'The Titans of Ul': ['Scanlink Drone Network', 'Spacial Conduit Cylinder'],
  "The Vuil'raith Cabal": ['Chaos Mapping', 'Vortex Canon'],
  'The Council Keleres': ['Scanlink Drone Network'],
  'Last Bastion': ['Duranium Armor'],
  'The Ral Nel Consortium': ['Antimass Deflectors'],
  'The Crimson Rebellion': ['Sarween Tools'],
  'The Deepwrought Scholarate': ['Neural Motivator', 'Sarween Tools'],
  'The Firmament / The Obsidian': ['Aetherpassage'],
}

export function getStartingTechs(faction) {
  return FACTION_STARTING_TECHS[faction] || []
}


export function defaultGameState() {
  return {
    round: 1, phase: 'strategy', vpGoal: 10, speakerId: null,
    custodiansClaimed: false, agendaPhaseUnlocked: false,
    expansions: { base: true, pok: true, te: true }, galacticEvent: null,
    players: [], laws: [], agendaDeck: [], agendaDiscard: [],
    currentAgendas: [], agendaVotes: {}, transactions: [],
    theFractureInPlay: false, thundersEdgeInPlay: false, thundersEdgeSlices: {},
    permissions: {}, hostBrowserId: null, createdAt: null,
  }
}

export function useGameState(userId) {
  const [gameState, setGameState] = useState(null)
  const [roomCode, setRoomCode]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [syncing, setSyncing]     = useState(false)
  const channelRef                = useRef(null)
  const myBrowserId               = useRef(userId)

  useEffect(() => { myBrowserId.current = userId }, [userId])

  useEffect(() => {
    const lastRoom = localStorage.getItem('ti4:lastRoom')
    if (lastRoom) joinGame(lastRoom).catch(() => localStorage.removeItem('ti4:lastRoom'))
  }, [])

  const subscribeToRoom = useCallback((code) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase.channel(`room:${code}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `code=eq.${code}` },
        (payload) => { setGameState(payload.new.state); setSyncing(false) })
      .subscribe()
    channelRef.current = channel
  }, [])

  const createGame = useCallback(async (initialState) => {
    setLoading(true); setError(null)
    try {
      const code  = generateRoomCode()
      const state = { ...defaultGameState(), ...initialState, hostBrowserId: myBrowserId.current, createdAt: new Date().toISOString() }
      const { error: err } = await supabase.from('games').insert({ code, state })
      if (err) throw err
      setRoomCode(code); setGameState(state)
      localStorage.setItem('ti4:lastRoom', code)
      subscribeToRoom(code)
      return code
    } catch (e) { setError(e.message); throw e } finally { setLoading(false) }
  }, [subscribeToRoom])

  const joinGame = useCallback(async (code) => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await supabase.from('games').select('state').eq('code', code.toUpperCase()).single()
      if (err) throw new Error('Room not found. Check the code and try again.')
      setRoomCode(code.toUpperCase()); setGameState(data.state)
      localStorage.setItem('ti4:lastRoom', code.toUpperCase())
      subscribeToRoom(code.toUpperCase())
    } catch (e) { setError(e.message); throw e } finally { setLoading(false) }
  }, [subscribeToRoom])

  const updateGame = useCallback(async (updater) => {
    if (!roomCode || !gameState) return
    setSyncing(true)
    const newState = typeof updater === 'function' ? updater(gameState) : { ...gameState, ...updater }
    setGameState(newState)
    try {
      const { error: err } = await supabase.from('games').update({ state: newState }).eq('code', roomCode)
      if (err) throw err
    } catch (e) { setGameState(gameState); setError(e.message); setSyncing(false) }
  }, [roomCode, gameState])

  const updatePlayer = useCallback((playerId, updater) => {
    updateGame(state => ({ ...state, players: state.players.map(p => p.id === playerId ? (typeof updater === 'function' ? updater(p) : { ...p, ...updater }) : p) }))
  }, [updateGame])

  const adjustPlayerVP        = useCallback((id, d) => updatePlayer(id, p => ({ ...p, vp: Math.max(0, p.vp + d) })), [updatePlayer])
  const adjustCounter         = useCallback((id, field, d, min=0, max=99) => { if (field === 'commandTokens') return; updatePlayer(id, p => ({ ...p, [field]: Math.max(min, Math.min(max, (p[field]||0)+d)) })) }, [updatePlayer])
  const adjustCommandToken    = useCallback((id, pool, d) => updatePlayer(id, p => ({ ...p, commandTokens: { ...p.commandTokens, [pool]: Math.max(0, Math.min(16, p.commandTokens[pool]+d)) } })), [updatePlayer])
  const toggleTechnology      = useCallback((id, tech) => updatePlayer(id, p => ({ ...p, technologies: p.technologies.includes(tech) ? p.technologies.filter(t => t !== tech) : [...p.technologies, tech] })), [updatePlayer])
  const setLeaderStatus       = useCallback((id, leader, status) => updatePlayer(id, p => ({ ...p, leaders: { ...p.leaders, [leader]: status } })), [updatePlayer])
  const assignStrategyCard    = useCallback((id, cardId, slot=1) => updatePlayer(id, p => ({ ...p, strategyCard: slot===1?cardId:p.strategyCard, strategyCard2: slot===2?cardId:p.strategyCard2 })), [updatePlayer])
  const togglePassed          = useCallback((id) => updatePlayer(id, p => ({ ...p, passed: !p.passed })), [updatePlayer])

  const advancePhase = useCallback(() => {
    updateGame(state => {
      const phases = state.agendaPhaseUnlocked ? ['strategy','action','status','agenda'] : ['strategy','action','status']
      const ni = (phases.indexOf(state.phase) + 1) % phases.length
      const np = phases[ni]
      return { ...state, phase: np, round: ni===0 ? state.round+1 : state.round,
        players: np==='strategy' ? state.players.map(p => ({ ...p, passed:false, strategyCard:null, strategyCard2:null })) : state.players }
    })
  }, [updateGame])

  const claimCustodians = useCallback((claimantPlayerId) => {
    updateGame(state => ({ ...state, custodiansClaimed: true, agendaPhaseUnlocked: true,
      players: state.players.map(p => p.id === claimantPlayerId ? { ...p, vp: (p.vp||0)+1 } : p) }))
  }, [updateGame])

  const drawAgenda = useCallback(() => {
    updateGame(state => {
      if (!state.agendaDeck?.length) return state
      const [drawn, ...remaining] = state.agendaDeck
      return { ...state, agendaDeck: remaining, currentAgendas: [...(state.currentAgendas||[]), drawn] }
    })
  }, [updateGame])

  const castVote = useCallback((playerId, agendaDeckIndex, choice, votes) => {
    updateGame(state => ({ ...state, agendaVotes: { ...state.agendaVotes, [`${agendaDeckIndex}-${playerId}`]: { choice, votes, playerId } } }))
  }, [updateGame])

  const resolveAgenda = useCallback((agendaDeckIndex, outcome, isLaw) => {
    updateGame(state => ({
      ...state,
      currentAgendas: (state.currentAgendas||[]).filter(a => a !== agendaDeckIndex),
      agendaDiscard: [...(state.agendaDiscard||[]), agendaDeckIndex],
      laws: isLaw ? [...(state.laws||[]), agendaDeckIndex] : (state.laws||[]),
      agendaVotes: Object.fromEntries(Object.entries(state.agendaVotes||{}).filter(([k]) => !k.startsWith(`${agendaDeckIndex}-`))),
    }))
  }, [updateGame])

  const repealLaw           = useCallback((i) => updateGame(state => ({ ...state, laws: (state.laws||[]).filter(l => l !== i) })), [updateGame])
  const setPlayerPermission = useCallback((browserId, level) => updateGame(state => ({ ...state, permissions: { ...state.permissions, [browserId]: level } })), [updateGame])

  const logTransaction = useCallback((fromId, toId, items) => {
    updateGame(state => ({ ...state, transactions: [...(state.transactions||[]),
      { id: crypto.randomUUID(), fromId, toId, items, round: state.round, phase: state.phase, timestamp: new Date().toISOString() }] }))
  }, [updateGame])

  const claimExpeditionSlice = useCallback((playerId, sliceIndex) => {
    updateGame(state => {
      const existing = state.thundersEdgeSlices?.[playerId] || []
      const newSlices = { ...state.thundersEdgeSlices, [playerId]: [...existing, sliceIndex] }
      return { ...state, thundersEdgeSlices: newSlices,
        thundersEdgeInPlay: Object.values(newSlices).flat().length >= 6,
        players: existing.length===0 ? state.players.map(p => p.id===playerId ? { ...p, breakthrough:true } : p) : state.players }
    })
  }, [updateGame])

  const triggerFracture = useCallback(() => updateGame(state => ({ ...state, theFractureInPlay: true })), [updateGame])

  const isHost   = !!gameState && gameState.hostBrowserId === myBrowserId.current
  const canEdit  = useCallback(() => { if (!gameState) return false; if (isHost) return true; return gameState.permissions?.[myBrowserId.current] === 'all' }, [gameState, isHost])
  const leaveGame = useCallback(() => { if (channelRef.current) supabase.removeChannel(channelRef.current); localStorage.removeItem('ti4:lastRoom'); setGameState(null); setRoomCode(null) }, [])

  return {
    gameState, roomCode, myPlayerId: myBrowserId.current, myBrowserId: myBrowserId.current,
    loading, error, syncing, isHost,
    createGame, joinGame, leaveGame, setError,
    updateGame, updatePlayer, adjustPlayerVP, adjustCounter, adjustCommandToken,
    toggleTechnology, setLeaderStatus, assignStrategyCard, togglePassed,
    advancePhase, claimCustodians, drawAgenda, castVote, resolveAgenda, repealLaw,
    setPlayerPermission, canEdit, logTransaction, claimExpeditionSlice, triggerFracture,
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function getInitiativeOrder(players) {
  return [...players].filter(p => p.strategyCard != null).sort((a, b) => a.strategyCard - b.strategyCard)
}

export function getLeaderWithMostVP(players) {
  return players.reduce((best, p) => (!best || p.vp > best.vp) ? p : best, null)
}

export function getPlayerWithFewestVP(players) {
  return players.reduce((least, p) => (!least || p.vp < least.vp) ? p : least, null)
}
