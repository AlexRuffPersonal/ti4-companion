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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_A = 'player-a'
const PLAYER_B = 'player-b'

function makeRequest(body) {
  return new Request('http://localhost/game-advance-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// ─── STATUS PHASE MOCK ────────────────────────────────────────────────────────

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
            // Full player load for tech effects
            return {
              eq: vi.fn().mockResolvedValue({ data: players, error: null }),
            }
          }
          // Fallback (shouldn't be hit in status phase)
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
    return {
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })

  return { gamesUpdateCalls, gamePlayersUpdateCalls }
}

// ─── ACTION PHASE MOCK ────────────────────────────────────────────────────────

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
    return {
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })

  return { gamesUpdateCalls }
}

// ─── STRATEGY PHASE MOCK ──────────────────────────────────────────────────────

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
            // All-players select for tech check
            return {
              eq: vi.fn().mockResolvedValue({ data: players, error: null }),
            }
          }
          // strategy_card select for first player
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
    return {
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })

  return { gamesUpdateCalls }
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(HOST_ID)
})

// ─── STATUS PHASE TECH EFFECTS ────────────────────────────────────────────────

describe('game-advance-phase — Phase 30 status→strategy tech effects', () => {
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
    // Player A: Neural Motivator → +2 = 4
    expect(cardUpdates[0].action_card_count).toBe(4)
    // Player B: no Neural Motivator → +1 = 6
    expect(cardUpdates[1].action_card_count).toBe(6)
    const tokenUpdates = gamePlayersUpdateCalls.filter(c => c.command_tokens !== undefined)
    expect(tokenUpdates).toHaveLength(2)
    // Player A: Hyper Metabolism → +3 = 3
    expect(tokenUpdates[0].command_tokens.strategy).toBe(3)
    // Player B: no Hyper Metabolism → +2 = 3
    expect(tokenUpdates[1].command_tokens.strategy).toBe(3)
  })
})

// ─── ACTION PHASE TECH EFFECTS ────────────────────────────────────────────────

describe('game-advance-phase — Phase 30 action→status tech effects', () => {
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

// ─── STRATEGY PHASE TECH EFFECTS ─────────────────────────────────────────────

describe('game-advance-phase — Phase 30 strategy→action tech effects', () => {
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
