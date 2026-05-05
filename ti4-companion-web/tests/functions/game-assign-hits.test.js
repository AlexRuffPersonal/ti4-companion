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

vi.mock('../../../supabase/functions/_shared/eliminationHandler.ts', () => ({
  checkAndEliminate: vi.fn().mockResolvedValue([])
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { handler } from '../../../supabase/functions/game-assign-hits/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-assign-hits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  combat_type: 'space',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'defender_assign',
  round: 1,
  status: 'active',
  attacker_hits: 1,
  defender_hits: 0,
  retreat_declared_by: null,
  retreat_destination: null,
}

function mockDb({
  player = { id: DEFENDER_ID },
  playerError = null,
  combat = BASE_COMBAT,
  combatError = null,
  unitDefs = [{ name: 'cruiser', sustain_damage: false }],
  assigneeUnits = [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
  atkUnitsLeft = [{ id: 'u2' }],
  defUnitsLeft = [{ id: 'u1' }],
  updateError = null,
} = {}) {
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
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: combatError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            // unit count queries for atkUnitsLeft / defUnitsLeft
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      is: vi.fn().mockImplementation(() =>
                        Promise.resolve({ data: atkUnitsLeft })
                      ),
                    }),
                  }),
                }),
              }),
            }
          }
          // assignee units query (fields includes more columns)
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: assigneeUnits }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: null }),
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
            is: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_system_tokens') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  checkAndEliminate.mockResolvedValue([])
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-assign-hits', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, casualties: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when casualties is not an array', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: null }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when combat is not in an assign phase', async () => {
    mockDb({ combat: { ...BASE_COMBAT, phase: 'attacker_roll' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when it is not the player turn to assign', async () => {
    // defender_assign phase but player is attacker
    mockDb({ player: { id: ATTACKER_ID }, combat: BASE_COMBAT })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }] }))
    expect(res.status).toBe(409)
  })

  it('advances to defender_roll when defender assigns hits', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('defender_roll')
  })

  it('resolves combat via retreat and returns complete', async () => {
    mockDb({
      player: { id: ATTACKER_ID },
      combat: {
        ...BASE_COMBAT,
        phase: 'attacker_assign',
        attacker_hits: 0,
        defender_hits: 0,
        retreat_declared_by: ATTACKER_ID,
        retreat_destination: '2,-1',
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('complete')
    expect(body.winner_player_id).toBeDefined()
  })

  it('includes eliminatedPlayerIds in response when a player is eliminated', async () => {
    checkAndEliminate.mockResolvedValue(['player-uuid'])
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminatedPlayerIds).toEqual(['player-uuid'])
  })

  it('includes empty eliminatedPlayerIds when no elimination', async () => {
    checkAndEliminate.mockResolvedValue([])
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminatedPlayerIds).toEqual([])
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
