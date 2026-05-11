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
import { handler } from '../../../supabase/functions/game-fire-space-cannon-defense/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const COMBAT_ID = 'combat-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = PLAYER_ID

function makeRequest(body) {
  return new Request('http://localhost/game-fire-space-cannon-defense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function makeBaseCombat(overrides = {}) {
  return {
    id: COMBAT_ID,
    game_id: GAME_ID,
    system_key: '1,-1',
    planet_name: 'Wellon',
    combat_type: 'ground',
    phase: 'scd_fire',
    attacker_player_id: ATTACKER_ID,
    defender_player_id: DEFENDER_ID,
    ...overrides,
  }
}

function mockDb({
  player = { id: DEFENDER_ID },
  combat = makeBaseCombat(),
  defUnits = [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'pds', count: 1, system_key: '1,-1' }],
  scdDefs = [{ name: 'pds', space_cannon: '6' }],
  updateSpy = null,
} = {}) {
  const internalUpdateSpy = updateSpy ?? vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
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
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
            }),
          }),
        }),
        update: internalUpdateSpy,
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: defUnits, error: null }),
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
            not: vi.fn().mockResolvedValue({ data: scdDefs, error: null }),
          }),
        }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  })

  return { updateSpy: internalUpdateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-fire-space-cannon-defense', () => {
  it('TCORS: OPTIONS returns 204', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('T401: requireAuth rejects → 401', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(401)
  })

  it('T400: missing game_id → 400', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('T400: missing combat_id → 400', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('T404_PLAYER: player null → 404', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('T404_COMBAT: combat null → 404', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('T409: combat_type is not ground → 409', async () => {
    mockDb({ combat: makeBaseCombat({ combat_type: 'space' }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not a ground combat/i)
  })

  it('T409: combat not in scd_fire phase → 409', async () => {
    mockDb({ combat: makeBaseCombat({ phase: 'attacker_roll' }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/space cannon defense/i)
  })

  it('T409: only defender can fire — attacker player → 409', async () => {
    // player.id = ATTACKER_ID, but defender_player_id = DEFENDER_ID
    mockDb({
      player: { id: ATTACKER_ID },
      combat: makeBaseCombat({ attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID }),
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/only the defender/i)
  })

  it('T409: no space cannon units on planet → 409', async () => {
    mockDb({ scdDefs: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no space cannon units/i)
  })

  it('GIVEN defender has 1 PDS (space_cannon=6), rolls [9] → 1 hit: phase=scd_assign', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8) // ceil(0.8 * 10) = 8, but we need 9
    // Actually ceil(0.9 * 10) = 9
    vi.spyOn(Math, 'random').mockReturnValue(0.89) // ceil(0.89 * 10) = 9 (hits on 6+)

    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    mockDb({
      defUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'pds', count: 1, system_key: '1,-1' }],
      scdDefs: [{ name: 'pds', space_cannon: '6' }],
      updateSpy,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg.scd_hits).toBe(1)
    expect(updateArg.phase).toBe('scd_assign')
    expect(updateArg.scd_dice).toHaveLength(1)
    expect(updateArg.scd_dice[0].hit).toBe(true)
    expect(updateArg.scd_dice[0].unit_type).toBe('pds')

    const body = await res.json()
    expect(body.scd_hits).toBe(1)
    expect(body.scd_dice).toHaveLength(1)
  })

  it('GIVEN defender has 2 PDS, rolls [3,4] → 0 hits: phase=attacker_roll', async () => {
    // ceil(0.3 * 10) = 3, ceil(0.4 * 10) = 4 — both miss (need 6+)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.29) // ceil → 3
      .mockReturnValueOnce(0.39) // ceil → 4

    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    mockDb({
      defUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'pds', count: 2, system_key: '1,-1' }],
      scdDefs: [{ name: 'pds', space_cannon: '6' }],
      updateSpy,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg.scd_hits).toBe(0)
    expect(updateArg.phase).toBe('attacker_roll')
    expect(updateArg.scd_dice).toHaveLength(2)
    expect(updateArg.scd_dice.every(d => !d.hit)).toBe(true)

    const body = await res.json()
    expect(body.scd_hits).toBe(0)
  })

  it('GIVEN defender has mech with space_cannon AND PDS: both units contribute dice', async () => {
    // mech: space_cannon='5', PDS: space_cannon='6'
    // ceil(0.89*10)=9 → hit on mech (5+), ceil(0.89*10)=9 → hit on PDS (6+)
    vi.spyOn(Math, 'random').mockReturnValue(0.89)

    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    mockDb({
      defUnits: [
        { id: 'u1', player_id: DEFENDER_ID, unit_type: 'mech', count: 1, system_key: '1,-1' },
        { id: 'u2', player_id: DEFENDER_ID, unit_type: 'pds', count: 1, system_key: '1,-1' },
      ],
      scdDefs: [
        { name: 'mech', space_cannon: '5' },
        { name: 'pds', space_cannon: '6' },
      ],
      updateSpy,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const updateArg = updateSpy.mock.calls[0][0]
    // 2 dice total — one from mech, one from pds
    expect(updateArg.scd_dice).toHaveLength(2)
    const mechDie = updateArg.scd_dice.find(d => d.unit_type === 'mech')
    const pdsDie = updateArg.scd_dice.find(d => d.unit_type === 'pds')
    expect(mechDie).toBeDefined()
    expect(pdsDie).toBeDefined()
    expect(mechDie.hit).toBe(true)
    expect(pdsDie.hit).toBe(true)
    expect(updateArg.scd_hits).toBe(2)
    expect(updateArg.phase).toBe('scd_assign')
  })
})
