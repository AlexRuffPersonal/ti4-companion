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
  EVT_END_TURN: 'end_turn',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-end-turn/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-end-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_GAME = { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID }
const ALL_PLAYERS = [{ id: PLAYER_ID, strategy_card: 4, passed: false }]

function mockDb({ callerPlayer, planetUpdateCapture = null, playerUpdateCapture = null } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols.includes('second_action_available')) {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: ALL_PLAYERS, error: null }),
            }),
          }
        }),
        update: vi.fn().mockImplementation((data) => {
          if (playerUpdateCapture) playerUpdateCapture(data)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockImplementation((data) => {
          if (planetUpdateCapture) planetUpdateCapture(data)
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
        }),
      }
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-end-turn Phase 30', () => {
  it('Fleet Logistics: first end-turn grants second action and does not end turn', async () => {
    let capturedUpdate = null
    mockDb({
      callerPlayer: { id: PLAYER_ID, technologies: ['Fleet Logistics'], exhausted_technologies: [], second_action_available: false },
      playerUpdateCapture: (d) => { capturedUpdate = d },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.second_action_available).toBe(true)
    expect(capturedUpdate?.second_action_available).toBe(true)
  })

  it('Fleet Logistics: second end-turn clears flag and ends turn normally', async () => {
    let capturedUpdate = null
    mockDb({
      callerPlayer: { id: PLAYER_ID, technologies: ['Fleet Logistics'], exhausted_technologies: [], second_action_available: true },
      playerUpdateCapture: (d) => { capturedUpdate = d },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
    expect(capturedUpdate?.second_action_available).toBe(false)
  })

  it('Bio-Stims: readies a planet and exhausts Bio-Stims', async () => {
    let capturedPlanetUpdate = null
    let capturedPlayerUpdate = null
    mockDb({
      callerPlayer: { id: PLAYER_ID, technologies: ['Bio-Stims'], exhausted_technologies: [], second_action_available: false },
      planetUpdateCapture: (d) => { capturedPlanetUpdate = d },
      playerUpdateCapture: (d) => { capturedPlayerUpdate = d },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      selections: { bio_stims_target: { type: 'planet', name: 'Mecatol Rex' } },
    }))
    expect(res.status).toBe(200)
    expect(capturedPlanetUpdate?.exhausted).toBe(false)
    expect(capturedPlayerUpdate?.exhausted_technologies).toContain('Bio-Stims')
  })

  it('Bio-Stims: readies a technology and exhausts Bio-Stims', async () => {
    let capturedPlayerUpdate = null
    mockDb({
      callerPlayer: {
        id: PLAYER_ID,
        technologies: ['Bio-Stims', 'Neural Motivator'],
        exhausted_technologies: ['Neural Motivator'],
        second_action_available: false,
      },
      playerUpdateCapture: (d) => { capturedPlayerUpdate = d },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      selections: { bio_stims_target: { type: 'technology', name: 'Neural Motivator' } },
    }))
    expect(res.status).toBe(200)
    expect(capturedPlayerUpdate?.exhausted_technologies).toContain('Bio-Stims')
    expect(capturedPlayerUpdate?.exhausted_technologies).not.toContain('Neural Motivator')
  })
})
