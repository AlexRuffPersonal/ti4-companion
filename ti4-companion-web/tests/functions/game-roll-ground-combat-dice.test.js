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
import { handler } from '../../../supabase/functions/game-roll-ground-combat-dice/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-roll-ground-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_GROUND_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  combat_type: 'ground',
  planet_name: 'Wellon',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'attacker_roll',
  round: 1,
  status: 'active',
}

function mockDb({
  player = { id: ATTACKER_ID },
  playerError = null,
  combat = BASE_GROUND_COMBAT,
  combatError = null,
  units = [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'infantry', count: 2, system_key: '1,-1' }],
  unitDefs = [{ name: 'infantry', combat: '8', sustain_damage: false }],
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
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: units }),
              }),
            }),
          }),
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
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-roll-ground-combat-dice', () => {
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

  it('409 combat_type is space', async () => {
    mockDb({ combat: { ...BASE_GROUND_COMBAT, combat_type: 'space' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/ground/i)
  })

  it('409 phase is space_cannon', async () => {
    mockDb({ combat: { ...BASE_GROUND_COMBAT, phase: 'space_cannon' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
  })

  it('409 attacker rolls on defender_roll phase', async () => {
    mockDb({
      player: { id: ATTACKER_ID },
      combat: { ...BASE_GROUND_COMBAT, phase: 'defender_roll' },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
  })

  it('409 defender rolls on attacker_roll phase', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_GROUND_COMBAT, phase: 'attacker_roll' },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
  })

  it('attacker_roll: queries units on planet and updates combat to defender_assign', async () => {
    mockDb({ player: { id: ATTACKER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('defender_assign')
    expect(body.dice).toBeDefined()
    expect(typeof body.hits).toBe('number')
  })

  it('defender_roll: updates combat to attacker_assign', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_GROUND_COMBAT, phase: 'defender_roll' },
      units: [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('attacker_assign')
  })
})
