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
import { handler } from '../../../supabase/functions/game-unlock-hero/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const LEADER_ID = 'leader-1'

function makeRequest(body) {
  return new Request('http://localhost/game-unlock-hero', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  leaders: { agent: 'exhausted', commander: 'unlocked', hero: 'locked' },
}

const BASE_LEADER = { id: LEADER_ID, leader_type: 'hero' }

function mockDb({
  player = BASE_PLAYER,
  leader = BASE_LEADER,
  pubObjectives = [{ id: 'obj-1' }, { id: 'obj-2' }, { id: 'obj-3' }],
  secObjectives = [],
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: leader }),
          }),
        }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockResolvedValue({ data: pubObjectives }),
          }),
        }),
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: secObjectives }),
            }),
          }),
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-unlock-hero', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ leader_id: LEADER_ID }))
    expect(res.status).toBe(400)
  })

  it('400 missing leader_id', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(404)
  })

  it('404 leader not found', async () => {
    mockDb({ leader: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/leader not found/i)
  })

  it('400 leader is not a hero', async () => {
    mockDb({ leader: { id: LEADER_ID, leader_type: 'agent' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not a hero/i)
  })

  it('409 hero already unlocked', async () => {
    mockDb({ player: { ...BASE_PLAYER, leaders: { ...BASE_PLAYER.leaders, hero: 'unlocked' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already unlocked/i)
  })

  it('409 hero already purged', async () => {
    mockDb({ player: { ...BASE_PLAYER, leaders: { ...BASE_PLAYER.leaders, hero: 'purged' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already purged/i)
  })

  it('409 fewer than 3 scored objectives', async () => {
    mockDb({ pubObjectives: [{ id: 'obj-1' }, { id: 'obj-2' }], secObjectives: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/3 scored objectives/i)
  })

  it('200 unlocks hero when player has 3 public objectives', async () => {
    mockDb({ pubObjectives: [{ id: 'obj-1' }, { id: 'obj-2' }, { id: 'obj-3' }], secObjectives: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unlocked).toBe(true)
  })

  it('200 counts secret objectives toward threshold', async () => {
    mockDb({ pubObjectives: [{ id: 'obj-1' }, { id: 'obj-2' }], secObjectives: [{ id: 'sec-1' }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unlocked).toBe(true)
  })
})
