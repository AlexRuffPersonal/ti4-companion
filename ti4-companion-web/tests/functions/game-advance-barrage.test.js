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
import { handler } from '../../../supabase/functions/game-advance-barrage/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const ATTACKER_ID = 'player-1'
const DEFENDER_ID = 'player-2'
const COMBAT_ID = 'combat-1'

function makeRequest(body) {
  return new Request('http://localhost/game-advance-barrage', {
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
  barrage_attacker_dice: ['already-fired'],
}

function mockDb({
  player = { id: PLAYER_ID },
  combat = BASE_COMBAT,
  attackerUnits = [],
  afbDefs = [],
  updateError = null,
} = {}) {
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: attackerUnits }),
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
            not: vi.fn().mockResolvedValue({ data: afbDefs }),
          }),
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-advance-barrage', () => {
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

  it('404 player not in game', async () => {
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

  it('409 only attacker can advance', async () => {
    mockDb({ player: { id: DEFENDER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/attacker/i)
  })

  it('409 must fire barrage first when barrage_attacker_dice is null and AFB units exist', async () => {
    mockDb({
      combat: { ...BASE_COMBAT, barrage_attacker_dice: null },
      attackerUnits: [{ unit_type: 'destroyer' }],
      afbDefs: [{ name: 'destroyer' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/anti-fighter barrage/i)
  })

  it('200 advances when barrage_attacker_dice is null but no AFB units', async () => {
    mockDb({
      combat: { ...BASE_COMBAT, barrage_attacker_dice: null },
      attackerUnits: [],
      afbDefs: [],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('attacker_roll')
  })

  it('200 advances when barrage_attacker_dice is already set (afbDefs query not needed)', async () => {
    // barrage_attacker_dice has already been set, so units/defs queries should NOT be called
    const unitsSpy = vi.fn()
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        unitsSpy()
        return { select: vi.fn() }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('attacker_roll')
    expect(unitsSpy).not.toHaveBeenCalled()
  })
})
