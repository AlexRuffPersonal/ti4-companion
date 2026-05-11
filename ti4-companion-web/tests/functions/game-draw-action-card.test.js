import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { rpc: vi.fn(), from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_DRAW_ACTION_CARD: 'draw_action_card',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-draw-action-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-draw-action-card/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  db.rpc.mockResolvedValue({ data: { drawn: true }, error: null })
  db.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'player-uuid' }, error: null }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  })
})

describe('game-draw-action-card', () => {
  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost/', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 200 and drawn:true on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drawn).toBe(true)
  })

  it('calls db.rpc with correct arguments', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(db.rpc).toHaveBeenCalledWith('draw_action_card', {
      p_game_id: GAME_ID,
      p_user_id: USER_ID,
    })
  })

  it('returns 404 when player not in game', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'player_not_found' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when deck is empty', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'deck_empty' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 500 on unexpected database error', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'draw_action_card' }))
  })
})
