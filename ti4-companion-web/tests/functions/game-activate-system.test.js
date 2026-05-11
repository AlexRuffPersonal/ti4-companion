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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let insertMock

function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  playerError = null,
  game = { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
  gameError = null,
  activations = [],
  activationError = null,
  insertError = null,
} = {}) {
  insertMock = vi.fn().mockResolvedValue({ error: insertError })
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations, error: activationError }),
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
      // Single broad fetch: .eq('game_id').is('on_planet', null) — no enemy units in base tests
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-activate-system', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ system_key: '1,-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when system_key is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when caller is not the active player', async () => {
    mockDb({ game: { active_player_id: 'other-player', round: 2 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not the active player/i)
  })

  it('returns 409 when no tactic tokens available', async () => {
    mockDb({
      player: { id: PLAYER_ID, command_tokens: { tactic_total: 1, fleet: 2, strategy: 1 } },
      activations: [{ id: 'a1', system_key: '2,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no tactic tokens/i)
  })

  it('returns 409 when system already activated by caller this round', async () => {
    mockDb({
      activations: [{ id: 'a1', system_key: '1,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('returns 200 and inserts activation row on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(insertMock).toHaveBeenCalledWith({
      game_id: GAME_ID,
      player_id: PLAYER_ID,
      system_key: '1,-1',
      round: 2,
      token_owner_id: PLAYER_ID,
    })
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('GIVEN ships moved in from another system, EXPECT combat.ships_moved_in=true and phase=\'window_pre_space_cannon\'', async () => {
    const combatInsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
    })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch: does NOT include 'command_tokens', resolves with single .eq()
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }
            }
            // single player fetch: includes 'command_tokens', chains .eq().eq().maybeSingle()
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
              is: vi.fn().mockResolvedValue({
                data: [{ player_id: 'enemy-uuid', unit_type: 'cruiser', count: 2, system_key: '1,-1' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return { insert: combatInsertSpy }
      }
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [{ origin_system_key: '2,-1' }],
    }))
    expect(res.status).toBe(200)
    expect(combatInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ships_moved_in: true,
        phase: 'window_pre_space_cannon',
      })
    )
  })

  it('GIVEN no ships moved in (same-system origin), EXPECT combat.ships_moved_in=false', async () => {
    const combatInsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
    })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch: does NOT include 'command_tokens', resolves with single .eq()
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }
            }
            // single player fetch: includes 'command_tokens', chains .eq().eq().maybeSingle()
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
              is: vi.fn().mockResolvedValue({
                data: [{ player_id: 'enemy-uuid', unit_type: 'cruiser', count: 2, system_key: '1,-1' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return { insert: combatInsertSpy }
      }
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [{ origin_system_key: '1,-1' }],
    }))
    expect(res.status).toBe(200)
    expect(combatInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ships_moved_in: false,
        phase: 'window_pre_space_cannon',
      })
    )
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'activate_system' }))
  })
})