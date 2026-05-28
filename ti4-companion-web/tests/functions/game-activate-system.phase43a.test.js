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
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  AGENT_REACTIVE_TRIGGERS: {
    'The Ghosts Of Creuss': ['SYSTEM_ACTIVATED'],
    'The Arborec': ['SYSTEM_ACTIVATED'],
    'The Yssaril Tribes': ['SYSTEM_ACTIVATED'],
  },
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
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const CREUSS_PLAYER_ID = 'creuss-player-uuid'
const AGENT_ID = 'creuss-agent-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

/**
 * Build a db mock that supports the full activate-system flow including
 * the reactive agent check at the end.
 *
 * otherPlayers: array of { id, faction, leaders } returned from the allGamePlayers fetch.
 *   The activating player (PLAYER_ID) is NOT included — the handler filters it in code.
 * agentRow: the leaders table row returned for the matching faction (or null)
 */
function mockDbForReactiveAgent({ otherPlayers = [], agentRow = null } = {}) {
  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          // allGamePlayers fetch (now includes faction, leaders): selects without command_tokens
          // The handler now reuses allGamePlayers for reactive agent check, single .eq() only
          if (fields && !fields.includes('command_tokens')) {
            return {
              eq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }),
            }
          }
          // Single player fetch: includes command_tokens, chains .eq().eq().maybeSingle()
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
                  error: null,
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: insertMock,
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: agentRow, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('reactive agent window on activation (Phase 43a)', () => {
  it('GIVEN Creuss player with unlocked agent, EXPECT response includes pending_window with type=reactive_agent and eligible containing Creuss player_id', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
      ],
      agentRow: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toHaveLength(1)
    expect(body.pending_window.eligible[0].player_id).toBe(CREUSS_PLAYER_ID)
    expect(body.pending_window.eligible[0].faction).toBe('The Ghosts Of Creuss')
    expect(body.pending_window.eligible[0].agent_id).toBe(AGENT_ID)
    expect(body.pending_window.context.trigger).toBe('SYSTEM_ACTIVATED')
    expect(body.pending_window.context.system_key).toBe('1,-1')
  })

  it('GIVEN Creuss player with locked agent, EXPECT no pending_window in response', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'locked' } },
      ],
      agentRow: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN no players with unlocked reactive agents, EXPECT no pending_window in response', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: 'some-player-uuid', faction: 'The Federation Of Sol', leaders: { agent: 'locked' } },
      ],
      agentRow: null,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN faction with no reactive trigger, EVEN IF agent is unlocked, EXPECT no pending_window', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: 'hacan-player-uuid', faction: 'The Emirates Of Hacan', leaders: { agent: 'unlocked' } },
      ],
      agentRow: { id: 'hacan-agent-uuid' },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN multiple factions with unlocked reactive agents, EXPECT all included in eligible', async () => {
    const ARBOREC_PLAYER_ID = 'arborec-player-uuid'
    const ARBOREC_AGENT_ID = 'arborec-agent-uuid'

    // Hoist the leaders maybeSingle mock outside db.from so it sequences correctly
    // across multiple db.from('leaders') calls (one per reactive faction)
    const leadersMaybeSingleMock = vi.fn()
      .mockResolvedValueOnce({ data: { id: AGENT_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: ARBOREC_AGENT_ID }, error: null })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch (now includes faction, leaders): single .eq() resolves
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
                    { id: ARBOREC_PLAYER_ID, faction: 'The Arborec', leaders: { agent: 'unlocked' } },
                  ],
                  error: null,
                }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
                    error: null,
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'leaders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: leadersMaybeSingleMock,
              }),
            }),
          }),
        }
      }
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '2,0' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toHaveLength(2)
    const playerIds = body.pending_window.eligible.map((e) => e.player_id)
    expect(playerIds).toContain(CREUSS_PLAYER_ID)
    expect(playerIds).toContain(ARBOREC_PLAYER_ID)
  })
})
