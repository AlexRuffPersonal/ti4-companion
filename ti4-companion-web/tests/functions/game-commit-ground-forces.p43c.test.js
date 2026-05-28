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
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-commit-ground-forces/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const DEFENDER_ID = 'defender-uuid'
const TILE_ID = 42
const SYSTEM_KEY = '1,-1'
const PLANET_NAME = 'Wellon'

function makeRequest(body) {
  return new Request('http://localhost/game-commit-ground-forces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_MAP_TILES = { [SYSTEM_KEY]: { tile_id: TILE_ID } }

function mockDb({
  player = { id: PLAYER_ID },
  game = { round: 1, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: true },
  activation = { id: 'act-1', bombardment_done: false },
  tile = { planets: [{ name: PLANET_NAME }] },
  atkSpaceUnits = [],
  bombDefs = [],
  defenders = [],
  existingInfantry = null,
  scdDefs = [],
  insertedCombat = { id: 'combat-1' },
  legendaryExisting = null,
} = {}) {
  let gpuCallCount = 0
  let unitsCallCount = 0

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
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: activation }),
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
            maybeSingle: vi.fn().mockResolvedValue({ data: tile }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      gpuCallCount++
      const count = gpuCallCount
      if (count === 1) {
        // atkSpaceUnits
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: atkSpaceUnits }),
                }),
              }),
            }),
          }),
        }
      }
      if (count === 2) {
        // defenders
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: defenders }),
                }),
              }),
            }),
          }),
        }
      }
      // existingInfantry + inserts (5 .eq() calls: game_id, system_key, player_id, unit_type, on_planet)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingInfantry }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'units') {
      unitsCallCount++
      if (unitsCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: bombDefs }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: scdDefs }),
          }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: insertedCombat }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_player_legendary_cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: legendaryExisting }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return {}
  })
}

describe('game-commit-ground-forces Phase 43c — commander passives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls applyCommanderPassives with GROUND_COMBAT_START trigger', async () => {
    mockDb({ defenders: [{ id: 'def-unit', player_id: DEFENDER_ID, unit_type: 'infantry', count: 1 }] })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: PLANET_NAME, troop_count: 1,
    }))
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'GROUND_COMBAT_START',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: SYSTEM_KEY }),
      expect.anything(),
    )
  })

  it('Sol commander — pending_window returned for infantry placement window', async () => {
    mockDb({ defenders: [{ id: 'def-unit', player_id: DEFENDER_ID, unit_type: 'infantry', count: 1 }] })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'GROUND_COMBAT_START',
        faction: 'The Federation Of Sol',
        player_id: 'sol-player-id',
        effect: [{ op: 'place_units', unit_type: 'infantry', count: 1, target: 'active_planet' }],
      }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: PLANET_NAME, troop_count: 1,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Federation Of Sol')
  })

  it("Sardakk commander — sardakkExtendedCommit flag allows planet from adjacent system", async () => {
    const ADJ_SYSTEM = '2,-1'
    const ADJ_PLANET = 'Tren'
    const ADJ_TILE_ID = 99

    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: "Sardakk N'orr", effect: 'sardakk_extended_commitment' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (ctx) => {
      ctx.sardakkExtendedCommit = true
    }))

    let activationsCallCount = 0
    let tilesCallCount = 0
    let gpuCallCount = 0

    db.from.mockImplementation((table) => {
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
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  round: 1,
                  custodians_claimed: true,
                  map_tiles: {
                    [SYSTEM_KEY]: { tile_id: TILE_ID },
                    [ADJ_SYSTEM]: { tile_id: ADJ_TILE_ID },
                  },
                },
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_system_activations') {
        activationsCallCount++
        const count = activationsCallCount
        if (count === 1) {
          // Main activation check for active system — return valid activation
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'act-1', bombardment_done: false } }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        // Adjacent system activation check — return null (player has no token there)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        tilesCallCount++
        const count = tilesCallCount
        if (count === 1) {
          // Active system tile — planet NOT here
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { planets: [] } }),
              }),
            }),
          }
        }
        // Adjacent system tile — planet IS here
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { planets: [{ name: ADJ_PLANET }] } }),
            }),
          }),
        }
      }
      if (table === 'game_player_units') {
        gpuCallCount++
        const count = gpuCallCount
        if (count === 1) {
          // atkSpaceUnits — no bombardment ships
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
              }),
            }),
          }
        }
        if (count === 2) {
          // defenders — none (no combat → claim planet)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
              }),
            }),
          }
        }
        // existingInfantry
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }
      if (table === 'game_player_legendary_cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: ADJ_PLANET, troop_count: 1,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })
})
