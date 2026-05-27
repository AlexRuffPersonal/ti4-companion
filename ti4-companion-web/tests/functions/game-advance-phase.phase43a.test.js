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
  getActiveNotes: vi.fn().mockResolvedValue({ giftOfPrescience: [] }),
  returnNote: vi.fn().mockResolvedValue(undefined),
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

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(HOST_ID)
  // Reset promissoryEnforcement mocks to defaults each test
  const { getHeldNotes, getActiveNotes, returnNote } = vi.getMockImplementation
    ? {} : {}
  // Re-apply defaults via dynamic import — mocks already set at module level
})

// ─── AGENT READYING ───────────────────────────────────────────────────────────

describe('game-advance-phase — Phase 43a agent readying', () => {
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
    // No update should carry leaders set from exhausted → unlocked for this player
    const agentUnlockUpdate = gamePlayersUpdateCalls.find(
      c => c.leaders !== undefined && c.leaders.agent === 'unlocked' && c.leaders.commander === 'locked'
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
    // Only PLAYER_A (exhausted → unlocked) should trigger this update
    expect(agentUpdates).toHaveLength(1)
  })
})

// ─── GAME_ROUND_FLAGS RESET ───────────────────────────────────────────────────

describe('game-advance-phase — Phase 43a game_round_flags reset', () => {
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
