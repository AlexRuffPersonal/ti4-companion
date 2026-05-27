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
  applyStatusPhaseLaws: vi.fn(),
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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyStatusPhaseLaws } from '../../../supabase/functions/_shared/lawEffects.ts'
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
          if (cols.includes('trade_goods') && !cols.includes('action_card_count')) {
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trade_goods: 0 }, error: null }),
              }),
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
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    if (table === 'game_player_legendary_cards') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    if (table === 'game_player_units') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
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
    return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
  })

  return { gamePlayersUpdateCalls }
}

// ─── STRATEGY PHASE MOCK ──────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(HOST_ID)
})

// ─── EXECUTIVE SANCTIONS ──────────────────────────────────────────────────────

describe('game-advance-phase — Phase 40 Executive Sanctions token cap', () => {
  it('Executive Sanctions active: DB write uses tokenGain returned by applyStatusPhaseLaws', async () => {
    // applyStatusPhaseLaws is called with the computed updates; the value it returns is used for DB writes
    const players = [
      {
        id: PLAYER_A,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    // Mock: pass through (no cap needed here — we just verify the returned value drives the DB write)
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(applyStatusPhaseLaws).toHaveBeenCalledWith(
      expect.anything(),
      GAME_ID,
      expect.arrayContaining([expect.objectContaining({ playerId: PLAYER_A })])
    )
    // tokenGain 2 (no Hyper Metabolism), strategy was 0, so strategy = 0 + 2 = 2
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
    // Mock: Executive Sanctions caps at 3 — return tokenGain=3 even though normal gain is 2,
    // verifying the returned (capped) array is used for DB writes
    applyStatusPhaseLaws.mockImplementationOnce(async (_db, _gameId, _updates) => [
      { playerId: PLAYER_A, tokenGain: 3 },
    ])
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    // strategy was 0, gained 3 (as returned by applyStatusPhaseLaws)
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
    // Mock: no Executive Sanctions, pass through unchanged
    applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
    const { gamePlayersUpdateCalls } = makeStatusMock(players)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const tokenUpdate = gamePlayersUpdateCalls.find(c => c.command_tokens !== undefined)
    // Hyper Metabolism: +3; strategy was 1, so strategy = 1 + 3 = 4
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
    expect(playerAUpdate.tokenGain).toBe(2) // no Hyper Metabolism
    expect(playerBUpdate.tokenGain).toBe(3) // Hyper Metabolism
  })
})

// ─── MINISTER OF WAR RESET ────────────────────────────────────────────────────

describe('game-advance-phase — Phase 40 minister_of_war_unlocked reset', () => {
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
