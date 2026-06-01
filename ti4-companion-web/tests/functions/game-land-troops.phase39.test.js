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

vi.mock('../../../supabase/functions/_shared/eliminationHandler.ts', () => ({
  checkAndEliminate: vi.fn().mockResolvedValue([])
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_LAND_TROOPS: 'land_troops',
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertMovementAllowed: vi.fn().mockResolvedValue(undefined),
  checkVpMaintenanceLaws: vi.fn().mockResolvedValue(undefined),
  LawError: class LawError extends Error {
    constructor(message, status = 409) {
      super(message)
      this.name = 'LawError'
      this.status = status
    }
  },
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { handler } from '../../../supabase/functions/game-land-troops/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const TILE_ID = 'tile-uuid'
const DMZ_ATTACHMENT_ID = 'dmz-attachment-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-land-troops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_MAP_TILES = {
  '1,-1': { tile_id: TILE_ID, tile_number: '32' },
}

/**
 * mockDb for Phase 39 DMZ tests.
 *
 * game_player_planets is queried twice when unit_type === 'mech':
 *   1st: ownership check — .select('player_id').eq(game_id).eq(planet_name).maybeSingle()
 *   2nd: attachments check — .select('attachments').eq(game_id).eq(player_id).eq(planet_name).maybeSingle()
 *
 * attachments table: .select('name').in('id', ids) → resolves directly
 */
function mockDb({
  player = { id: PLAYER_ID },
  game = { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
  activation = { id: 'act-1' },
  tile = { planets: [{ name: 'Wellon' }] },
  existingOwner = null,
  planetAttachments = [],
  attachmentNames = [],
} = {}) {
  let planetCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
                }),
              }),
            }
          }
          // vp query for custodians
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { vp: 3 }, error: null }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: activation, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tile, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      planetCallCount++
      const thisCall = planetCallCount
      if (thisCall === 1) {
        // 1st call: ownership check — .select('player_id').eq(game_id).eq(planet_name).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingOwner, error: null }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      } else {
        // 2nd call: attachments check — .select('attachments').eq(game_id).eq(player_id).eq(planet_name).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { attachments: planetAttachments },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
    }
    if (table === 'attachments') {
      // .select('name').in('id', ids) → resolves directly
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: attachmentNames.map(name => ({ name })),
            error: null,
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  checkAndEliminate.mockResolvedValue([])
  requireAuth.mockResolvedValue(USER_ID)
  mockDb()
})

describe('Phase 39 — DMZ Mech Guard in game-land-troops', () => {
  it('409 Cannot place a mech on a Demilitarized Zone planet', async () => {
    mockDb({
      planetAttachments: [DMZ_ATTACHMENT_ID],
      attachmentNames: ['Demilitarized Zone'],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
      unit_type: 'mech',
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Demilitarized Zone')
  })

  it('allows infantry landing even when DMZ attachment is present', async () => {
    mockDb({
      planetAttachments: [DMZ_ATTACHMENT_ID],
      attachmentNames: ['Demilitarized Zone'],
    })

    // No unit_type field (defaults to infantry)
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })

  it('allows mech landing when planet has no attachments', async () => {
    mockDb({
      planetAttachments: [],
      attachmentNames: [],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
      unit_type: 'mech',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })

  it('allows mech landing when planet has attachments but none are DMZ', async () => {
    mockDb({
      planetAttachments: ['some-other-attachment-uuid'],
      attachmentNames: ['Terraform'],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
      unit_type: 'mech',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })
})
