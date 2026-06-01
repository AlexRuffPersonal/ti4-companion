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
import { handler } from '../../../supabase/functions/game-draft-pick-slice/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-draft-pick-slice', body)
const PLAYER2_ID = 'player-2'
const PLAYER3_ID = 'player-3'

function makeDraftState(overrides = {}) {
  return {
    mode: 'milty',
    phase: 'slice-pick',
    slices: [
      { id: 'slice-0', tiles: ['b1', 'b2', 'b3', 'r1', 'r2'], score: 6, claimed_by: null },
      { id: 'slice-1', tiles: ['b4', 'b5', 'b6', 'r3', 'r4'], score: 7, claimed_by: null },
      { id: 'slice-2', tiles: ['b7', 'b8', 'b9', 'r5', 'r6'], score: 5, claimed_by: null },
    ],
    pick_order: [PLAYER3_ID, PLAYER2_ID, PLAYER_ID],
    pick_index: 0,
    hands: {},
    placement_order: [],
    placement_index: 0,
    placed_tiles: {},
    ...overrides,
  }
}

function mockDb({ game = null, player = { id: PLAYER_ID }, updateError = null } = {}) {
  const defaultGame = { id: GAME_ID, draft_state: makeDraftState({ pick_order: [PLAYER_ID, PLAYER2_ID, PLAYER3_ID], pick_index: 0 }) }
  const actualGame = game !== undefined ? game : defaultGame

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: actualGame }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
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
    return {}
  })
}

describe('game-draft-pick-slice', () => {
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
    requireAuth.mockRejectedValue(new AuthError('Missing auth'))
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ slice_id: 'slice-0' }))
    expect(res.status).toBe(400)
  })

  it('400 missing slice_id', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('404 game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(404)
  })

  it('409 draft not in slice-pick phase', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({ phase: 'placement', pick_order: [PLAYER_ID], pick_index: 0 }),
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(409)
  })

  it('409 no draft state', async () => {
    mockDb({ game: { id: GAME_ID, draft_state: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(409)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(404)
  })

  it('403 not the active picker', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({ pick_order: [PLAYER2_ID, PLAYER_ID, PLAYER3_ID], pick_index: 0 }),
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(403)
  })

  it('404 slice_id not found', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-99' }))
    expect(res.status).toBe(404)
  })

  it('409 slice already claimed', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          pick_order: [PLAYER_ID, PLAYER2_ID, PLAYER3_ID],
          pick_index: 0,
          slices: [
            { id: 'slice-0', tiles: ['b1', 'b2'], score: 5, claimed_by: PLAYER2_ID },
            { id: 'slice-1', tiles: ['b3', 'b4'], score: 6, claimed_by: null },
          ],
        }),
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already claimed/i)
  })

  it('valid pick: slice.claimed_by set; tiles moved to hands; pick_index++', async () => {
    let capturedState = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: GAME_ID,
                  draft_state: makeDraftState({
                    pick_order: [PLAYER_ID, PLAYER2_ID, PLAYER3_ID],
                    pick_index: 0,
                  }),
                },
              }),
            }),
          }),
          update: vi.fn().mockImplementation((state) => {
            capturedState = state.draft_state
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
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
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-0' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.phase).toBe('slice-pick')

    expect(capturedState).not.toBeNull()
    expect(capturedState.pick_index).toBe(1)
    expect(capturedState.slices[0].claimed_by).toBe(PLAYER_ID)
    expect(capturedState.hands[PLAYER_ID]).toEqual(['b1', 'b2', 'b3', 'r1', 'r2'])
  })

  it('last pick: phase→placement; placement_order populated; hands all populated', async () => {
    let capturedState = null
    const tiles0 = ['b1', 'b2', 'b3', 'r1', 'r2']
    const tiles1 = ['b4', 'b5', 'b6', 'r3', 'r4']
    const tiles2 = ['b7', 'b8', 'b9', 'r5', 'r6']

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: GAME_ID,
                  draft_state: {
                    mode: 'milty',
                    phase: 'slice-pick',
                    slices: [
                      { id: 'slice-0', tiles: tiles0, score: 6, claimed_by: PLAYER2_ID },
                      { id: 'slice-1', tiles: tiles1, score: 7, claimed_by: PLAYER3_ID },
                      { id: 'slice-2', tiles: tiles2, score: 5, claimed_by: null },
                    ],
                    pick_order: [PLAYER3_ID, PLAYER2_ID, PLAYER_ID],
                    pick_index: 2, // last pick
                    hands: {
                      [PLAYER2_ID]: tiles0,
                      [PLAYER3_ID]: tiles1,
                    },
                    placement_order: [],
                    placement_index: 0,
                    placed_tiles: {},
                  },
                },
              }),
            }),
          }),
          update: vi.fn().mockImplementation((state) => {
            capturedState = state.draft_state
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
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
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 'slice-2' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.phase).toBe('placement')

    expect(capturedState.phase).toBe('placement')
    expect(capturedState.hands[PLAYER_ID]).toEqual(tiles2)
    // Placement order: reverse of [p3,p2,p1] = [p1,p2,p3] snake
    expect(capturedState.placement_order.length).toBeGreaterThan(0)
    expect(capturedState.placement_order).toContain(PLAYER_ID)
    expect(capturedState.placement_order).toContain(PLAYER2_ID)
    expect(capturedState.placement_order).toContain(PLAYER3_ID)
  })
})
