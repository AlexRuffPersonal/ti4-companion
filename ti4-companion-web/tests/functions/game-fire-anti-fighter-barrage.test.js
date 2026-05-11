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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-fire-anti-fighter-barrage/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const ATTACKER_ID = 'player-1'
const DEFENDER_ID = 'player-2'
const COMBAT_ID = 'combat-1'

function makeRequest(body) {
  return new Request('http://localhost/game-fire-anti-fighter-barrage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  phase: 'barrage',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  barrage_attacker_dice: null,
  barrage_attacker_hits: null,
  barrage_defender_dice: null,
  barrage_defender_hits: null,
}

// callCount tracks how many times game_player_units has been called
// to distinguish attacker (1st) from defender (2nd) query
function mockDb({
  player = { id: PLAYER_ID },
  combat = BASE_COMBAT,
  atkUnits = [],
  defUnits = [],
  unitDefs = [],
  updateError = null,
} = {}) {
  let unitsCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player }),
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
              maybeSingle: vi.fn().mockResolvedValue({ data: combat }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_player_units') {
      unitsCallCount++
      const thisCall = unitsCallCount
      const units = thisCall === 1 ? atkUnits : defUnits
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: units }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: unitDefs }),
          }),
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-fire-anti-fighter-barrage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('400 missing combat_id', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('404 player not found in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('404 combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('409 not in barrage phase', async () => {
    mockDb({ combat: { ...BASE_COMBAT, phase: 'attacker_roll' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/barrage/i)
  })

  it('409 barrage already fired', async () => {
    mockDb({ combat: { ...BASE_COMBAT, barrage_attacker_dice: [{ unit_type: 'destroyer', roll: 9, hit_on: 9, hit: true }] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already fired/i)
  })

  it('409 only attacker can fire barrage', async () => {
    mockDb({ player: { id: DEFENDER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/attacker/i)
  })

  it('409 no AFB units in this system', async () => {
    mockDb({
      atkUnits: [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'cruiser', count: 1, system_key: '1,-1' }],
      defUnits: [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'fighter', count: 3, system_key: '1,-1' }],
      unitDefs: [],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/anti-fighter barrage/i)
  })

  it('200 attacker hits → phase afb_attacker_assign, no game_player_units mutations', async () => {
    // 2 attacker destroyers (afb '9'), 1 defender destroyer + 3 fighters
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 2, system_key: '1,-1' },
    ]
    const defUnits = [
      { id: 'u2', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
      { id: 'u3', player_id: DEFENDER_ID, unit_type: 'fighter', count: 3, system_key: '1,-1' },
    ]
    const unitDefs = [{ name: 'destroyer', afb: '9' }]

    // Capture the update mock before handler runs
    let capturedUpdateMock
    let unitsCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_combats') {
        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        capturedUpdateMock = updateMock
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_player_units') {
        unitsCallCount++
        const thisCall = unitsCallCount
        const units = thisCall === 1 ? atkUnits : defUnits
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: units }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: unitDefs }),
            }),
          }),
        }
      }
      return { select: vi.fn() }
    })

    // Attacker rolls 2 dice (2 destroyers × 1 die each), both hit (roll=10 >= 9)
    // Defender rolls 1 die (1 destroyer × 1 die), misses (roll=5 < 9)
    const randomSpy = vi.spyOn(Math, 'random')
    // Math.ceil(Math.random() * 10): return 1.0 → 10 (hit), 1.0 → 10 (hit), 0.4 → 4 (miss)
    randomSpy.mockReturnValueOnce(1.0).mockReturnValueOnce(1.0).mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(2)
    expect(body.barrage_defender_hits).toBe(0)
    expect(body.phase).toBe('afb_attacker_assign')

    // Verify game_combats.update was called with correct payload
    expect(capturedUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      barrage_attacker_hits: 2,
      barrage_defender_hits: 0,
      phase: 'afb_attacker_assign',
    }))

    // Confirm no game_player_units mutations — only 2 calls (select atk + select def)
    expect(unitsCallCount).toBe(2)

    randomSpy.mockRestore()
  })

  it('200 only defender hits → phase afb_defender_assign', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = [
      { id: 'u2', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const unitDefs = [{ name: 'destroyer', afb: '9' }]

    mockDb({ atkUnits, defUnits, unitDefs })

    // Attacker misses (roll=5), defender hits (roll=10)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4).mockReturnValueOnce(1.0)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(0)
    expect(body.barrage_defender_hits).toBe(1)
    expect(body.phase).toBe('afb_defender_assign')

    randomSpy.mockRestore()
  })

  it('200 all rolls miss → phase attacker_roll, no game_player_units mutations', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = [
      { id: 'u2', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const unitDefs = [{ name: 'destroyer', afb: '9' }]

    // Capture update mock
    let capturedUpdateMock
    let unitsCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_combats') {
        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        capturedUpdateMock = updateMock
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_player_units') {
        unitsCallCount++
        const thisCall = unitsCallCount
        const units = thisCall === 1 ? atkUnits : defUnits
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: units }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: unitDefs }),
            }),
          }),
        }
      }
      return { select: vi.fn() }
    })

    // Both miss (roll=4 < 9)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4).mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(0)
    expect(body.barrage_defender_hits).toBe(0)
    expect(body.phase).toBe('attacker_roll')

    // Verify game_combats.update called with both hits=0 and phase=attacker_roll
    expect(capturedUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      barrage_attacker_hits: 0,
      barrage_defender_hits: 0,
      phase: 'attacker_roll',
    }))

    // Confirm no game_player_units mutations — only 2 calls (select atk + select def)
    expect(unitsCallCount).toBe(2)

    randomSpy.mockRestore()
  })
})
