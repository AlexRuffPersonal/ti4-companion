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
import { handler } from '../../../supabase/functions/game-draft-place-tile/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-draft-place-tile', body)
const PLAYER2_ID = 'player-2'

function makeDraftState(overrides = {}) {
  return {
    mode: 'official',
    phase: 'placement',
    hands: {
      [PLAYER_ID]: ['b1', 'b2', 'r1'],
      [PLAYER2_ID]: ['b3', 'b4', 'r2'],
    },
    placement_order: [PLAYER_ID, PLAYER2_ID, PLAYER_ID, PLAYER2_ID, PLAYER_ID, PLAYER2_ID],
    placement_index: 0,
    placed_tiles: {},
    ...overrides,
  }
}

const TILE_ROW = {
  id: 'tile-uuid-1',
  tile_number: 'b1',
  wormhole: null,
  anomaly: null,
}

function mockDb({ game = undefined, player = { id: PLAYER_ID }, tile = TILE_ROW, updateError = null } = {}) {
  const defaultGame = { id: GAME_ID, draft_state: makeDraftState() }
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
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tile }),
          }),
          in: vi.fn().mockResolvedValue({
            data: [
              { id: 'mecatol-id', tile_number: '18' },
              { id: 'tile-uuid-1', tile_number: 'b1' },
            ],
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-draft-place-tile', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(400)
  })

  it('400 missing tile_number', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, position: '1,0' }))
    expect(res.status).toBe(400)
  })

  it('400 missing position', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1' }))
    expect(res.status).toBe(400)
  })

  it('404 game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(404)
  })

  it('409 draft not in placement phase', async () => {
    mockDb({ game: { id: GAME_ID, draft_state: makeDraftState({ phase: 'slice-pick' }) } })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(409)
  })

  it('409 no draft_state', async () => {
    mockDb({ game: { id: GAME_ID, draft_state: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(409)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(404)
  })

  it('403 not the active placer', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          placement_order: [PLAYER2_ID, PLAYER_ID],
          placement_index: 0,
        }),
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(403)
  })

  it('400 tile not in hand', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'x99', position: '1,0' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not in your hand/i)
  })

  it('400 position already occupied', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          placed_tiles: { '1,0': { tile_number: 'b2', rotation: 0, wormhole: null, anomaly: null } },
        }),
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already occupied/i)
  })

  it('400 position is 0,0', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '0,0' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Mecatol/i)
  })

  it('400 ring skipped (targetRing > maxPlacedRing + 1)', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          placed_tiles: {
            '1,0': { tile_number: 'b2', rotation: 0, wormhole: null, anomaly: null },
          },
        }),
      },
    })
    // '3,0' is ring 3, max placed ring is 1, so 3 > 1+1 → should fail
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '3,0' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/skip rings/i)
  })

  it('400 anomaly-anomaly adjacency with hand.length > 1', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          placed_tiles: {
            '1,0': { tile_number: 'r1', rotation: 0, wormhole: null, anomaly: 'supernova' },
          },
        }),
      },
      tile: { id: 'tile-b1', tile_number: 'b1', wormhole: null, anomaly: 'gravity rift' },
    })
    // Placing at '0,1' which is adjacent to '1,0'
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '0,1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/adjacent anomal/i)
  })

  it('400 same-wormhole adjacency with hand.length > 1', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          placed_tiles: {
            '1,0': { tile_number: 'b2', rotation: 0, wormhole: 'alpha', anomaly: null },
          },
        }),
      },
      tile: { id: 'tile-b1', tile_number: 'b1', wormhole: 'alpha', anomaly: null },
    })
    // Placing at '0,1' adjacent to '1,0'
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '0,1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/same-type wormhole/i)
  })

  it('allows anomaly adjacency when hand.length === 1 (with warning)', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        draft_state: makeDraftState({
          hands: { [PLAYER_ID]: ['b1'], [PLAYER2_ID]: ['b3'] }, // only 1 tile in hand
          placement_order: [PLAYER_ID, PLAYER2_ID],
          placement_index: 0,
          placed_tiles: {
            '1,0': { tile_number: 'r1', rotation: 0, wormhole: null, anomaly: 'supernova' },
          },
        }),
      },
      tile: { id: 'tile-b1', tile_number: 'b1', wormhole: null, anomaly: 'gravity rift' },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '0,1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warnings.length).toBeGreaterThan(0)
    expect(body.warnings[0]).toMatch(/allowed/i)
  })

  it('valid placement: tile removed from hand; placed_tiles updated; placement_index++; next_player correct', async () => {
    let capturedState = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, draft_state: makeDraftState() },
              }),
            }),
          }),
          update: vi.fn().mockImplementation((state) => {
            capturedState = state
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
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'tile-uuid-1', tile_number: 'b1', wormhole: null, anomaly: null },
              }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '1,0', rotation: 2 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.complete).toBe(false)
    expect(data.next_player).toBe(PLAYER2_ID)

    const ds = capturedState.draft_state
    expect(ds.placement_index).toBe(1)
    expect(ds.hands[PLAYER_ID]).not.toContain('b1')
    expect(ds.placed_tiles['1,0']).toMatchObject({ tile_number: 'b1', rotation: 2 })
  })

  it('final tile: draft_state=null; map_tiles written with mecatol + all placed tiles; complete=true', async () => {
    let capturedUpdate = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: GAME_ID,
                  draft_state: {
                    mode: 'official',
                    phase: 'placement',
                    hands: { [PLAYER_ID]: ['b1'] }, // last tile
                    placement_order: [PLAYER_ID],
                    placement_index: 0,
                    placed_tiles: {
                      '1,0': { tile_number: 'b2', rotation: 0, wormhole: null, anomaly: null },
                    },
                  },
                },
              }),
            }),
          }),
          update: vi.fn().mockImplementation((state) => {
            capturedUpdate = state
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
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'tile-b1-uuid', tile_number: 'b1', wormhole: null, anomaly: null },
              }),
            }),
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'mecatol-uuid', tile_number: '18' },
                { id: 'tile-b1-uuid', tile_number: 'b1' },
                { id: 'tile-b2-uuid', tile_number: 'b2' },
              ],
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: 'b1', position: '0,1', rotation: 0 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.complete).toBe(true)

    expect(capturedUpdate.draft_state).toBeNull()
    expect(capturedUpdate.map_tiles).toBeDefined()
    expect(capturedUpdate.map_tiles['0,0']).toMatchObject({ tile_number: '18', tile_id: 'mecatol-uuid' })
    expect(capturedUpdate.map_tiles['0,1']).toMatchObject({ tile_number: 'b1', tile_id: 'tile-b1-uuid' })
    expect(capturedUpdate.map_tiles['1,0']).toMatchObject({ tile_number: 'b2', tile_id: 'tile-b2-uuid' })
  })
})
