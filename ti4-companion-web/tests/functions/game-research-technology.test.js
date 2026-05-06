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
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OTHER_PLAYER_ID = 'other-player-uuid'
const TECH_NAME = 'Neural Motivator'

function makeRequest(body) {
  return new Request('http://localhost/game-research-technology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updatePlayerMock, updateGameMock

function mockDb({
  game = { status: 'active', expansions: { base: true } },
  tech = { name: TECH_NAME, technology_type: 'green', prerequisites: {}, expansion: 'base' },
  player = { id: PLAYER_ID, technologies: [] },
  allTechs = [{ name: TECH_NAME, technology_type: 'green' }],
  eligibleCardRows = [],
} = {}) {
  updatePlayerMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
      update: updateGameMock,
    }
    if (table === 'technologies') return {
      select: vi.fn().mockImplementation((fields) => {
        // Single tech lookup (name, technology_type, prerequisites, expansion)
        if (fields.includes('prerequisites')) {
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }),
            }),
          }
        }
        // All techs lookup (for prerequisite validation)
        return Promise.resolve({ data: allTechs, error: null })
      }),
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
          }),
        }),
      }),
      update: updatePlayerMock,
    }
    if (table === 'game_action_card_deck') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: eligibleCardRows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-research-technology', () => {
  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ tech_name: TECH_NAME }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when tech_name is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when tech not found', async () => {
    mockDb({ tech: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when tech already researched', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: [TECH_NAME] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already researched/i)
  })

  it('appends tech to player technologies on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(200)
    expect(updatePlayerMock).toHaveBeenCalledWith({ technologies: [TECH_NAME] })
  })

  it('GIVEN another player holds After-tech-researched card — sets pending_action_window', async () => {
    mockDb({ eligibleCardRows: [{ held_by_player_id: OTHER_PLAYER_ID }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(200)
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeDefined()
    expect(windowCall[0].pending_action_window).toMatchObject({
      type: 'after_technology_researched',
      eligible_player_ids: [OTHER_PLAYER_ID],
      context: { technology_name: TECH_NAME },
    })
  })

  it('GIVEN only the researching player holds such a card — no window opened', async () => {
    // Eligible rows exclude the researcher (neq filter), so empty result
    mockDb({ eligibleCardRows: [] })
    await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeUndefined()
  })

  it('GIVEN no player holds such a card — no window opened', async () => {
    mockDb({ eligibleCardRows: [] })
    await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeUndefined()
  })
})
