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
import { handler } from '../../../supabase/functions/game-resolve-commander-reroll/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const COMBAT_ID = 'combat-uuid'

const JOL_NAR_PLAYER = {
  id: PLAYER_ID,
  leaders: { commander: 'unlocked' },
  faction: 'The Universities Of Jol-Nar',
}

const SAMPLE_COMBAT = {
  id: COMBAT_ID,
  attacker_player_id: PLAYER_ID,
  defender_player_id: 'other-player-uuid',
  attacker_dice: [
    { roll: 3, hit_on: 7, hit: false },
    { roll: 8, hit_on: 7, hit: true },
  ],
  defender_dice: [],
  attacker_hits: 1,
  defender_hits: 0,
}

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-commander-reroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ player = JOL_NAR_PLAYER, combat = SAMPLE_COMBAT, updateError = null } = {}) {
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    return {}
  })
}

describe('game-resolve-commander-reroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, reroll_indices: [0] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reroll_indices is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when commander not unlocked', async () => {
    mockDb({ player: { ...JOL_NAR_PLAYER, leaders: { commander: 'locked' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when player is not Jol-Nar', async () => {
    mockDb({ player: { ...JOL_NAR_PLAYER, faction: 'The Nekro Virus' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when reroll index is out of range', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [5] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reroll_indices is empty array', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [] }))
    expect(res.status).toBe(400)
  })

  it('rerolls chosen dice and updates combat row', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: JOL_NAR_PLAYER, error: null }),
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
                maybeSingle: vi.fn().mockResolvedValue({ data: SAMPLE_COMBAT, error: null }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, reroll_indices: [0] }))
    expect(res.status).toBe(200)

    const body = await res.json()
    // First die should be rerolled (marked as rerolled:true)
    expect(body.dice[0].rerolled).toBe(true)
    // Second die should be unchanged
    expect(body.dice[1]).toMatchObject({ roll: 8, hit_on: 7, hit: true })
    // hits is recalculated
    expect(typeof body.hits).toBe('number')

    // Verify update was called
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ attacker_dice: body.dice, attacker_hits: body.hits }),
    )
  })
})
