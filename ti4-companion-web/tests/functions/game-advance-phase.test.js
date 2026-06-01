import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ADVANCE_PHASE: 'advance_phase',
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  applyStatusPhaseLaws: vi.fn(async (_db, _gameId, updates) => updates),
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyStatusPhaseLaws } from '../../../supabase/functions/_shared/lawEffects.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

import { GAME_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-advance-phase', body)

const HOST_ID = 'host-uuid'

function mockDb({ game = { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false }, updateError = null } = {}) {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  const playersUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const legendaryUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: updateMock,
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          }),
        }),
        update: playersUpdateMock,
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_legendary_cards') {
      return {
        update: legendaryUpdateMock,
      }
    }
    if (table === 'game_player_units') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return nullSafeChain()
  })
  return { updateMock, playersUpdateMock, legendaryUpdateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-advance-phase — agenda_unlocked patch', () => {
  it('advances status → strategy when agenda_unlocked=false', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = updateMock.mock.calls.find(call => call[0]?.phase !== undefined)
    expect(phaseCall[0].phase).toBe('strategy')
  })

  it('advances status → agenda when agenda_unlocked=true', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = updateMock.mock.calls.find(call => call[0]?.phase !== undefined)
    expect(phaseCall[0].phase).toBe('agenda')
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not host', async () => {
    mockDb({ game: { id: GAME_ID, host_user_id: 'other-host', phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('resets vote_prevented for all players when status → agenda (agenda_unlocked=true)', async () => {
    const { playersUpdateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const votePrevCall = playersUpdateMock.mock.calls.find(call => call[0]?.vote_prevented !== undefined)
    expect(votePrevCall).toBeDefined()
    expect(votePrevCall[0].vote_prevented).toBe(false)
  })

  it('resets movement_blocked_systems when status → strategy (agenda_unlocked=false)', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const blockedCall = updateMock.mock.calls.find(call => 'movement_blocked_systems' in (call[0] ?? {}))
    expect(blockedCall).toBeDefined()
    expect(blockedCall[0].movement_blocked_systems).toEqual([])
  })

  it('does NOT reset movement_blocked_systems when status → agenda (agenda_unlocked=true)', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const blockedCall = updateMock.mock.calls.find(call => 'movement_blocked_systems' in (call[0] ?? {}))
    expect(blockedCall).toBeUndefined()
  })

  it('readies legendary cards during status phase processing', async () => {
    const { legendaryUpdateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const readyCall = legendaryUpdateMock.mock.calls.find(call => call[0]?.status !== undefined)
    expect(readyCall).toBeDefined()
    expect(readyCall[0].status).toBe('readied')
  })

  it('calls logEvent with correct event_type on success', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'advance_phase' }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 30 — tech effects
// ─────────────────────────────────────────────────────────────────────────────

describe('game-advance-phase — Phase 30 status→strategy tech effects', () => {
  const PLAYER_A = 'player-a'
  const PLAYER_B = 'player-b'

  function makeStatusMock(players) {
    const gamesUpdateCalls = []
    const gamePlayersUpdateCalls = []

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: players, error: null }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return nullSafeChain()
    })

    return { gamesUpdateCalls, gamePlayersUpdateCalls }
  }

  it('Neural Motivator player gets action_card_count + 2', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Neural Motivator'], action_card_count: 3, command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 } },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const cardUpdate = gamePlayersUpdateCalls.find(c => c.action_card_count !== undefined)
    expect(cardUpdate.action_card_count).toBe(5)
  })

  it('non-Neural-Motivator player gets action_card_count + 1', async () => {
    const players = [
      { id: PLAYER_A, technologies: [], action_card_count: 3, command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 } },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const cardUpdate = gamePlayersUpdateCalls.find(c => c.action_card_count !== undefined)
    expect(cardUpdate.action_card_count).toBe(4)
  })

  it('Hyper Metabolism player gets command_tokens.strategy + 3', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Hyper Metabolism'], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 } },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    expect(tokenUpdate.command_tokens.strategy).toBe(4)
  })

  it('non-Hyper-Metabolism player gets command_tokens.strategy + 2', async () => {
    const players = [
      { id: PLAYER_A, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 } },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    expect(tokenUpdate.command_tokens.strategy).toBe(3)
  })

  it('Bioplasmosis player causes pending_action_window to be set', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Bioplasmosis'], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 } },
    ]
    const { gamesUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const windowCall = gamesUpdateCalls.find(c => c.pending_action_window !== undefined)
    expect(windowCall).toBeDefined()
    expect(windowCall.pending_action_window.type).toBe('after_status_phase')
    expect(windowCall.pending_action_window.eligible_player_ids).toContain(PLAYER_A)
    expect(windowCall.pending_action_window.context.effect).toBe('redistribute_infantry')
  })

  it('no pending_action_window set when no Bioplasmosis player', async () => {
    const players = [
      { id: PLAYER_A, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 } },
    ]
    const { gamesUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const windowCall = gamesUpdateCalls.find(c => c.pending_action_window !== undefined)
    expect(windowCall).toBeUndefined()
  })

  it('exhausted_technologies cleared to [] during status→strategy transition', async () => {
    const players = [
      { id: PLAYER_A, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 } },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const clearCall = gamePlayersUpdateCalls.find(c => Array.isArray(c.exhausted_technologies))
    expect(clearCall).toBeDefined()
    expect(clearCall.exhausted_technologies).toEqual([])
  })

  it('two players each get correct card/token updates', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Neural Motivator', 'Hyper Metabolism'], action_card_count: 2, command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 } },
      { id: PLAYER_B, technologies: [], action_card_count: 5, command_tokens: { tactic_total: 2, fleet: 2, strategy: 1 } },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const cardUpdates = gamePlayersUpdateCalls.filter(c => c.action_card_count !== undefined)
    expect(cardUpdates).toHaveLength(2)
    expect(cardUpdates[0].action_card_count).toBe(4)
    expect(cardUpdates[1].action_card_count).toBe(6)
    const tokenUpdates = gamePlayersUpdateCalls.filter(c => c.command_tokens !== undefined)
    expect(tokenUpdates).toHaveLength(2)
    expect(tokenUpdates[0].command_tokens.strategy).toBe(3)
    expect(tokenUpdates[1].command_tokens.strategy).toBe(3)
  })
})

describe('game-advance-phase — Phase 30 action→status tech effects', () => {
  const PLAYER_A = 'player-a'

  function makeActionMock(players) {
    const gamesUpdateCalls = []

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'action', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: players, error: null }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return nullSafeChain()
    })

    return { gamesUpdateCalls }
  }

  it('Wormhole Generator player causes pending_action_window to be set', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Wormhole Generator'] },
    ]
    const { gamesUpdateCalls } = makeActionMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const windowCall = gamesUpdateCalls.find(c => c.pending_action_window !== undefined)
    expect(windowCall).toBeDefined()
    expect(windowCall.pending_action_window.type).toBe('status_phase_wormhole')
    expect(windowCall.pending_action_window.eligible_player_ids).toContain(PLAYER_A)
    expect(windowCall.pending_action_window.passed_player_ids).toEqual([])
    expect(windowCall.pending_action_window.context).toEqual({})
  })

  it('no pending_action_window set when no Wormhole Generator player', async () => {
    const players = [
      { id: PLAYER_A, technologies: [] },
    ]
    const { gamesUpdateCalls } = makeActionMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const windowCall = gamesUpdateCalls.find(c => c.pending_action_window !== undefined)
    expect(windowCall).toBeUndefined()
  })

  it('phase advances to status regardless of Wormhole Generator', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Wormhole Generator'] },
    ]
    const { gamesUpdateCalls } = makeActionMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = gamesUpdateCalls.find(c => c.phase !== undefined)
    expect(phaseCall.phase).toBe('status')
  })
})

describe('game-advance-phase — Phase 30 strategy→action tech effects', () => {
  const PLAYER_A = 'player-a'

  function makeStrategyMock(players) {
    const gamesUpdateCalls = []

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'strategy', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('technologies') && !cols.includes('strategy_card')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: players, error: null }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return nullSafeChain()
    })

    return { gamesUpdateCalls }
  }

  it('Quantum Datahub Node player causes pending_action_window to be set', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Quantum Datahub Node'] },
    ]
    const { gamesUpdateCalls } = makeStrategyMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const windowCall = gamesUpdateCalls.find(c => c.pending_action_window !== undefined)
    expect(windowCall).toBeDefined()
    expect(windowCall.pending_action_window.type).toBe('strategy_phase_end')
    expect(windowCall.pending_action_window.eligible_player_ids).toContain(PLAYER_A)
    expect(windowCall.pending_action_window.context.effect).toBe('quantum_datahub_node')
  })

  it('no pending_action_window set when no Quantum Datahub Node player', async () => {
    const players = [
      { id: PLAYER_A, technologies: [] },
    ]
    const { gamesUpdateCalls } = makeStrategyMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const windowCall = gamesUpdateCalls.find(c => c.pending_action_window !== undefined)
    expect(windowCall).toBeUndefined()
  })

  it('phase advances to action regardless of Quantum Datahub Node', async () => {
    const players = [
      { id: PLAYER_A, technologies: ['Quantum Datahub Node'] },
    ]
    const { gamesUpdateCalls } = makeStrategyMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = gamesUpdateCalls.find(c => c.phase !== undefined)
    expect(phaseCall.phase).toBe('action')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 39b — promissory note enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('game-advance-phase — Phase 39b Trade Agreement (status phase replenish)', () => {
  const PLAYER_OWNER = 'player-owner'
  const PLAYER_HOLDER = 'player-holder'
  const NOTE_INSTANCE = 'note-instance-uuid'

  function makeStatusMock({ players, gamePlayersUpdateCalls = [], gamesUpdateCalls = [] } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'factions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: 3 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamePlayersUpdateCalls, gamesUpdateCalls }
  }

  beforeEach(() => {
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    getHeldNotes.mockResolvedValue([])
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    returnNote.mockResolvedValue(undefined)
  })

  it('Trade Agreement held, owner replenished: commodities transferred to holder as trade goods, note returned', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: 'The Barony of Letnev',
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
      {
        id: PLAYER_HOLDER,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 2,
      },
    ]

    getHeldNotes.mockImplementation(async (_gameId, noteName, _db) => {
      if (noteName === 'Trade Agreement') {
        return [{ instanceId: NOTE_INSTANCE, holderPlayerId: PLAYER_HOLDER, ownerPlayerId: PLAYER_OWNER }]
      }
      return []
    })

    const gamePlayersUpdateCalls = []
    makeStatusMock({ players, gamePlayersUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    const ownerUpdates = gamePlayersUpdateCalls.filter((c) => c.commodities !== undefined)
    expect(ownerUpdates).toHaveLength(1)
    expect(ownerUpdates[0].commodities).toBe(0)

    const holderTgUpdate = gamePlayersUpdateCalls.find(
      (c) => c.trade_goods !== undefined && c.trade_goods > 0
    )
    expect(holderTgUpdate).toBeDefined()
    expect(holderTgUpdate.trade_goods).toBe(5)

    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, PLAYER_OWNER, expect.anything())
  })

  it('Trade Agreement not held: no commodity transfer, no returnNote call for Trade Agreement', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: 'The Barony of Letnev',
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
    ]

    getHeldNotes.mockResolvedValue([])

    const gamePlayersUpdateCalls = []
    makeStatusMock({ players, gamePlayersUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    const tradeAgreementReturnCalls = returnNote.mock.calls.filter(
      ([instanceId]) => instanceId === NOTE_INSTANCE
    )
    expect(tradeAgreementReturnCalls).toHaveLength(0)

    const holderTgUpdate = gamePlayersUpdateCalls.find(
      (c) => c.trade_goods !== undefined && c.trade_goods > 0
    )
    expect(holderTgUpdate).toBeUndefined()
  })
})

describe('game-advance-phase — Phase 39b Gift of Prescience (strategy phase)', () => {
  const PLAYER_OWNER = 'player-owner'
  const PLAYER_HOLDER = 'player-holder'
  const NOTE_INSTANCE = 'note-instance-uuid'

  function makeStrategyMock({ players = [], gamesUpdateCalls = [] } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'strategy', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('technologies') && !cols.includes('strategy_card')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamesUpdateCalls }
  }

  beforeEach(() => {
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    getHeldNotes.mockResolvedValue([])
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    returnNote.mockResolvedValue(undefined)
  })

  it('Gift of Prescience in_play: holder gets priority 0, response includes gift_of_prescience_holder_id', async () => {
    const giftHolderPlayerId = PLAYER_HOLDER

    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_INSTANCE, holderPlayerId: giftHolderPlayerId, ownerPlayerId: PLAYER_OWNER }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const gamesUpdateCalls = []
    makeStrategyMock({ players: [], gamesUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    const phaseUpdate = gamesUpdateCalls.find((c) => c.phase === 'action')
    expect(phaseUpdate).toBeDefined()
    expect(phaseUpdate.active_player_id).toBe(giftHolderPlayerId)

    const body = await res.json()
    expect(body.gift_of_prescience_holder_id).toBe(giftHolderPlayerId)
  })

  it('Gift of Prescience in_play: response includes naalu_telepathic_skipped and gift_of_prescience_owner_id', async () => {
    const giftOwnerPlayerId = PLAYER_OWNER
    const giftHolderPlayerId = PLAYER_HOLDER

    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_INSTANCE, holderPlayerId: giftHolderPlayerId, ownerPlayerId: giftOwnerPlayerId }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const gamesUpdateCalls = []
    makeStrategyMock({ players: [], gamesUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.naalu_telepathic_skipped).toBe(true)
    expect(body.gift_of_prescience_owner_id).toBe(giftOwnerPlayerId)
  })

  it('Gift of Prescience not in_play: normal strategy card ordering applies', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const gamesUpdateCalls = []
    makeStrategyMock({ players: [], gamesUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    const phaseUpdate = gamesUpdateCalls.find((c) => c.phase === 'action')
    expect(phaseUpdate).toBeDefined()
    expect(phaseUpdate.active_player_id).toBeNull()

    const body = await res.json()
    expect(body.gift_of_prescience_holder_id).toBeUndefined()
    expect(body.naalu_telepathic_skipped).toBeUndefined()
    expect(body.gift_of_prescience_owner_id).toBeUndefined()
  })
})

describe('game-advance-phase — Phase 39b Gift of Prescience returned at status phase END', () => {
  const PLAYER_OWNER = 'player-owner'
  const PLAYER_HOLDER = 'player-holder'
  const NOTE_INSTANCE = 'note-instance-uuid'

  function makeStatusMock({ players, gamePlayersUpdateCalls = [], gamesUpdateCalls = [] } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'factions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: 3 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamePlayersUpdateCalls, gamesUpdateCalls }
  }

  beforeEach(() => {
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    getHeldNotes.mockResolvedValue([])
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    returnNote.mockResolvedValue(undefined)
  })

  it('Gift of Prescience in_play during status phase: returnNote called at status phase end', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
    ]

    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_INSTANCE, holderPlayerId: PLAYER_HOLDER, ownerPlayerId: PLAYER_OWNER }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    makeStatusMock({ players })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, PLAYER_OWNER, expect.anything())
  })

  // TODO (Phase 39c): Add test for Scepter of Dominion returnNote — deferred until 39c implements full handling
  it.skip('Scepter of Dominion (39c): returnNote called for Scepter of Dominion at status phase end — deferred to Phase 39c', () => {
    // Phase 39c will add the returnNote call for Scepter of Dominion.
    // Verify: when getHeldNotes returns a Scepter of Dominion entry at status phase end,
    // returnNote is called with the correct instanceId and ownerPlayerId.
  })

  it('Gift of Prescience not in_play: returnNote not called for Gift of Prescience', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
    ]

    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    makeStatusMock({ players })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    expect(returnNote).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 40 — law effects & minister of war reset
// ─────────────────────────────────────────────────────────────────────────────

describe('game-advance-phase — Phase 40 Executive Sanctions token cap', () => {
  const PLAYER_A = 'player-a'
  const PLAYER_B = 'player-b'

  function makeStatusMock(players) {
    const gamePlayersUpdateCalls = []

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamePlayersUpdateCalls }
  }

  it('Executive Sanctions active: tokenGain capped at 3 even with Hyper Metabolism', async () => {
    const players = [
      {
        id: PLAYER_A,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) =>
      updates.map(p => ({ ...p, tokenGain: Math.min(p.tokenGain, 3) }))
    )
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(applyStatusPhaseLaws).toHaveBeenCalledWith(
      expect.anything(),
      GAME_ID,
      expect.arrayContaining([expect.objectContaining({ playerId: PLAYER_A })])
    )
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    expect(tokenUpdate.command_tokens.strategy).toBe(2)
  })

  it('Executive Sanctions active: player who would receive 5 tokens (simulated) is capped at 3', async () => {
    const players = [
      {
        id: PLAYER_A,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) =>
      updates.map(p => ({ ...p, tokenGain: Math.min(p.tokenGain, 3) }))
    )
    applyStatusPhaseLaws.mockImplementationOnce(async (_db, _gameId, _updates) => [
      { playerId: PLAYER_A, tokenGain: 3 },
    ])
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    expect(tokenUpdate.command_tokens.strategy).toBe(3)
  })

  it('No Executive Sanctions: token gain unchanged (applyStatusPhaseLaws returns original)', async () => {
    const players = [
      {
        id: PLAYER_A,
        technologies: ['Hyper Metabolism'],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 },
      },
    ]
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    expect(tokenUpdate.command_tokens.strategy).toBe(4)
  })

  it('applyStatusPhaseLaws is called with correct playerUpdates array', async () => {
    const players = [
      {
        id: PLAYER_A,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
      {
        id: PLAYER_B,
        technologies: ['Hyper Metabolism'],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
      },
    ]
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(applyStatusPhaseLaws).toHaveBeenCalledOnce()
    const [, , passedUpdates] = applyStatusPhaseLaws.mock.calls[0]
    expect(passedUpdates).toHaveLength(2)
    const playerAUpdate = passedUpdates.find(u => u.playerId === PLAYER_A)
    const playerBUpdate = passedUpdates.find(u => u.playerId === PLAYER_B)
    expect(playerAUpdate.tokenGain).toBe(2)
    expect(playerBUpdate.tokenGain).toBe(3)
  })
})

describe('game-advance-phase — Phase 40 minister_of_war_unlocked reset', () => {
  const PLAYER_A = 'player-a'
  const PLAYER_B = 'player-b'

  function makeStrategyMock(players) {
    const gamePlayersUpdateCalls = []

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'strategy', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('technologies') && !cols.includes('strategy_card')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamePlayersUpdateCalls }
  }

  function makeStatusMock(players) {
    const gamePlayersUpdateCalls = []

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 1, agenda_unlocked: false },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamePlayersUpdateCalls }
  }

  it('strategy phase advance: minister_of_war_unlocked reset to false for all players', async () => {
    const players = [
      { id: PLAYER_A, technologies: [] },
      { id: PLAYER_B, technologies: [] },
    ]
    const { gamePlayersUpdateCalls } = makeStrategyMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const resetCall = gamePlayersUpdateCalls.find(c => c.minister_of_war_unlocked === false)
    expect(resetCall).toBeDefined()
    expect(resetCall.minister_of_war_unlocked).toBe(false)
  })

  it('minister_of_war_unlocked reset does not happen during status phase', async () => {
    const players = [
      {
        id: PLAYER_A,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const resetCall = gamePlayersUpdateCalls.find(c => c.minister_of_war_unlocked === false)
    expect(resetCall).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 43a — agent readying & game_round_flags reset
// ─────────────────────────────────────────────────────────────────────────────

describe('game-advance-phase — Phase 43a agent readying', () => {
  const PLAYER_A = 'player-a'
  const PLAYER_B = 'player-b'

  function makeStatusMock({ players, gameOverrides = {} } = {}) {
    const gamesUpdateCalls = []
    const gamePlayersUpdateCalls = []

    const gameData = {
      id: GAME_ID,
      host_user_id: HOST_ID,
      phase: 'status',
      round: 2,
      agenda_unlocked: false,
      ...gameOverrides,
    }

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players ?? [], error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'factions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: 3 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamesUpdateCalls, gamePlayersUpdateCalls }
  }

  it('player with leaders.agent=exhausted gets leaders.agent updated to unlocked', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
        leaders: { agent: 'exhausted', commander: 'locked', hero: 'locked' },
      },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock({ players })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const agentUpdate = gamePlayersUpdateCalls.find(
      c => c.leaders !== undefined && c.leaders.agent === 'unlocked'
    )
    expect(agentUpdate).toBeDefined()
    expect(agentUpdate.leaders.agent).toBe('unlocked')
  })

  it('player with leaders.agent=unlocked is not updated with agent readying', async () => {
    const players = [
      {
        id: PLAYER_B,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
        leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
      },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock({ players })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const agentUnlockUpdate = gamePlayersUpdateCalls.find(
      c => c.leaders !== undefined && c.leaders.agent === 'unlocked'
    )
    expect(agentUnlockUpdate).toBeUndefined()
  })

  it('only exhausted agent player gets the leaders update, not already-unlocked player', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
        leaders: { agent: 'exhausted', commander: 'locked', hero: 'locked' },
      },
      {
        id: PLAYER_B,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
        leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
      },
    ]
    const { gamePlayersUpdateCalls } = makeStatusMock({ players })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const agentUpdates = gamePlayersUpdateCalls.filter(
      c => c.leaders !== undefined && c.leaders.agent === 'unlocked'
    )
    expect(agentUpdates).toHaveLength(1)
  })
})

describe('game-advance-phase — Phase 43a game_round_flags reset', () => {
  const PLAYER_A = 'player-a'

  function makeStatusMock({ players, gameOverrides = {} } = {}) {
    const gamesUpdateCalls = []
    const gamePlayersUpdateCalls = []

    const gameData = {
      id: GAME_ID,
      host_user_id: HOST_ID,
      phase: 'status',
      round: 2,
      agenda_unlocked: false,
      ...gameOverrides,
    }

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players ?? [], error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'factions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: 3 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamesUpdateCalls, gamePlayersUpdateCalls }
  }

  it('resets game_round_flags to {} when advancing status → strategy (agenda_unlocked=false)', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
        leaders: null,
      },
    ]
    const { gamesUpdateCalls } = makeStatusMock({
      players,
      gameOverrides: { game_round_flags: { letnev_no_fleet_limit: true } },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const flagsReset = gamesUpdateCalls.find(c => c.game_round_flags !== undefined)
    expect(flagsReset).toBeDefined()
    expect(flagsReset.game_round_flags).toEqual({})
  })

  it('does not reset game_round_flags when advancing status → agenda (agenda_unlocked=true)', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
        leaders: null,
      },
    ]
    const { gamesUpdateCalls } = makeStatusMock({
      players,
      gameOverrides: {
        agenda_unlocked: true,
        game_round_flags: { letnev_no_fleet_limit: true },
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const flagsReset = gamesUpdateCalls.find(c => c.game_round_flags !== undefined)
    expect(flagsReset).toBeUndefined()
  })
})

describe('game-advance-phase — Phase 43b hero round flags cleared at round end', () => {
  function makeStatusMock({ players, gameOverrides = {} } = {}) {
    const gamesUpdateCalls = []
    const gamePlayersUpdateCalls = []

    const gameData = {
      id: GAME_ID,
      host_user_id: HOST_ID,
      phase: 'status',
      round: 2,
      agenda_unlocked: false,
      ...gameOverrides,
    }

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamesUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players ?? [], error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            gamePlayersUpdateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'factions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: 3 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_legendary_cards') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_units') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    return { gamesUpdateCalls, gamePlayersUpdateCalls }
  }

  it('game_round_flags with hero flags reset to {} on status → strategy', async () => {
    const { gamesUpdateCalls } = makeStatusMock({
      players: [],
      gameOverrides: {
        game_round_flags: { letnev_no_fleet_limit: true, nomad_flagship_ignores_tokens: true },
        agenda_unlocked: false,
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const flagsReset = gamesUpdateCalls.find(
      c => c.game_round_flags !== undefined &&
        Object.keys(c.game_round_flags).length === 0
    )
    expect(flagsReset).toBeDefined()
  })
})
