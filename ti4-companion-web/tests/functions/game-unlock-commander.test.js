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

vi.mock('../../../supabase/functions/_shared/commanderUnlock.ts', () => ({
  checkCommanderUnlock: vi.fn(),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkCommanderUnlock } from '../../../supabase/functions/_shared/commanderUnlock.ts'
import { handler } from '../../../supabase/functions/game-unlock-commander/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const LEADER_ID = 'leader-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-unlock-commander', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = {
    id: PLAYER_ID,
    leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
    technologies: ['t1', 't2', 't3'],
    trade_goods: 0,
    action_card_count: 0,
    commander_flags: {},
    faction: 'The Nekro Virus',
  },
  leader = { id: LEADER_ID, faction: 'The Nekro Virus', leader_type: 'commander' },
  updateError = null,
} = {}) {
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: leader, error: null }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-unlock-commander', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    checkCommanderUnlock.mockResolvedValue(true)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ leader_id: LEADER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when leader_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when leader not found', async () => {
    mockDb({ leader: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when leader is not a commander', async () => {
    mockDb({ leader: { id: LEADER_ID, faction: 'The Nekro Virus', leader_type: 'agent' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when commander already unlocked', async () => {
    mockDb({
      player: {
        id: PLAYER_ID,
        leaders: { commander: 'unlocked' },
        technologies: [],
        trade_goods: 0,
        action_card_count: 0,
        commander_flags: {},
        faction: 'The Nekro Virus',
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when unlock condition not met', async () => {
    mockDb()
    checkCommanderUnlock.mockResolvedValue(false)
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 and unlocks commander when condition is met', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: PLAYER_ID,
                    leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
                    technologies: ['t1', 't2', 't3'],
                    trade_goods: 0,
                    action_card_count: 0,
                    commander_flags: {},
                    faction: 'The Nekro Virus',
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'leaders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: LEADER_ID, faction: 'The Nekro Virus', leader_type: 'commander' },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })
    checkCommanderUnlock.mockResolvedValue(true)

    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({
      leaders: { agent: 'unlocked', commander: 'unlocked', hero: 'locked' },
    })
    const body = await res.json()
    expect(body).toMatchObject({ unlocked: true })
  })
})
