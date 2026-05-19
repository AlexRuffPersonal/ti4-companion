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
  EVT_SCORE_OBJECTIVE: 'score_objective',
}))
vi.mock('../../../supabase/functions/_shared/objectiveConditions.ts', () => ({
  buildEvaluationContext: vi.fn().mockResolvedValue({}),
  evaluateCondition: vi.fn().mockReturnValue({ eligible: true, reason: '' }),
  applySpendSideEffect: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { buildEvaluationContext, evaluateCondition, applySpendSideEffect } from '../../../supabase/functions/_shared/objectiveConditions.ts'
import { handler } from '../../../supabase/functions/game-score-objective/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OBJ_ID = 'obj-uuid'
const REF_OBJ_ID = 'ref-obj-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-score-objective', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  game = { host_user_id: USER_ID },
  gameError = null,
  gameObj = { id: OBJ_ID, objective_id: REF_OBJ_ID, state: 'revealed', scored_by: [] },
  gameObjError = null,
  playerData = { id: PLAYER_ID, faction: 'sol' },
  playerDataError = null,
  gameMapData = { map_tiles: {} },
  factionTile = null,
  refObj = { points: 1, condition_check: null },
  refObjError = null,
  player = { vp: 3 },
  playerFetchError = null,
  updateObjError = null,
  vpError = null,
} = {}) {
  let gameSelectCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'host_user_id') {
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
              }),
            }
          }
          if (fields === 'map_tiles') {
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: gameMapData, error: null }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
            }),
          }
        }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: gameObj, error: gameObjError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateObjError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id, faction') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: playerData, error: playerDataError }),
                }),
              }),
            }
          }
          // fields === 'vp'
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerFetchError }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: vpError }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: factionTile, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'public_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: refObj, error: refObjError }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
  evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
  buildEvaluationContext.mockResolvedValue({})
  applySpendSideEffect.mockResolvedValue(undefined)
})

describe('game-score-objective (Phase 36)', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 204 for CORS preflight', async () => {
    const req = new Request('http://localhost/game-score-objective', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/i)
  })

  it('returns 400 when objective_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/objective_id/i)
  })

  it('returns 400 when player_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/player_id/i)
  })

  it('returns 404 when game is not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not host', async () => {
    mockDb({ game: { host_user_id: 'other-user' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 404 when objective is not in game', async () => {
    mockDb({ gameObj: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when objective has not been revealed', async () => {
    mockDb({ gameObj: { id: OBJ_ID, objective_id: REF_OBJ_ID, state: 'unrevealed', scored_by: [] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/revealed/i)
  })

  it('returns 409 when player has already scored this objective', async () => {
    mockDb({ gameObj: { id: OBJ_ID, objective_id: REF_OBJ_ID, state: 'revealed', scored_by: [PLAYER_ID] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already scored/i)
  })

  it('returns 422 when condition is not met', async () => {
    mockDb({ refObj: { points: 1, condition_check: { type: 'count_planets', params: { min: 6 } } } })
    evaluateCondition.mockReturnValue({ eligible: false, reason: 'Need more' })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/Need more/i)
  })

  it('returns 200 and scores when condition is met', async () => {
    mockDb({ refObj: { points: 1, condition_check: { type: 'count_planets', params: { min: 3 } } } })
    evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scored).toBe(true)
  })

  it('returns 200 on happy path with no condition_check', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scored).toBe(true)
    expect(body.vp_awarded).toBe(1)
  })

  it('does not call evaluateCondition when condition_check is null', async () => {
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(evaluateCondition).not.toHaveBeenCalled()
  })

  it('calls evaluateCondition when condition_check is present', async () => {
    mockDb({ refObj: { points: 2, condition_check: { type: 'spend_resources', params: { amount: 8 } } } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(evaluateCondition).toHaveBeenCalledOnce()
    expect(evaluateCondition).toHaveBeenCalledWith(
      { type: 'spend_resources', params: { amount: 8 } },
      expect.anything()
    )
  })

  it('calls applySpendSideEffect after VP update for spend-type conditions', async () => {
    mockDb({ refObj: { points: 2, condition_check: { type: 'spend_resources', params: { amount: 8 } } } })
    evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID, player_id: PLAYER_ID }))
    expect(applySpendSideEffect).toHaveBeenCalledOnce()
    expect(applySpendSideEffect).toHaveBeenCalledWith('spend_resources', { amount: 8 }, expect.anything(), expect.anything())
  })
})
