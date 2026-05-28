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
  getHeldNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-commit-ground-forces/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const SAAR_ID = 'saar-uuid'
const NOTE_ID = 'note-instance-uuid'
const SYSTEM_KEY = '1,-1'
const RETREAT_SYSTEM_KEY = '2,0'
const PLANET_NAME = 'Wellon'
const RETREAT_PLANET = 'Jord'
const TILE_ID = 42
const RETREAT_TILE_ID = 99

const DEFAULT_MAP_TILES = {
  [SYSTEM_KEY]: { tile_id: TILE_ID },
  [RETREAT_SYSTEM_KEY]: { tile_id: RETREAT_TILE_ID },
}

function makeRequest(body) {
  return new Request('http://localhost/game-commit-ground-forces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_BODY = {
  game_id: GAME_ID,
  system_key: SYSTEM_KEY,
  planet_name: PLANET_NAME,
  troop_count: 2,
  saar_retreat_planet: RETREAT_PLANET,
}

function makeUpdateChain() {
  const chain = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.then = (resolve) => resolve({ error: null })
  return chain
}

function mockDb({
  player = { id: PLAYER_ID },
  game = { round: 1, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: true },
  activation = { id: 'act-1', bombardment_done: false },
  tile = { planets: [{ name: PLANET_NAME }] },
  defenders = [],
  retreatPlanetRow = { tile_id: RETREAT_TILE_ID },
} = {}) {
  let gpuCallCount = 0

  const unitInsertMock = vi.fn().mockResolvedValue({ error: null })
  const unitUpdateChain = makeUpdateChain()
  const unitUpdateMock = vi.fn().mockReturnValue(unitUpdateChain)

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
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
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
    if (table === 'game_player_units') {
      gpuCallCount++
      if (gpuCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (gpuCallCount === 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: defenders, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (gpuCallCount === 3) {
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
          insert: unitInsertMock,
          update: unitUpdateMock,
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        insert: unitInsertMock,
        update: unitUpdateMock,
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: retreatPlanetRow, error: null }),
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_player_legendary_cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return { select: vi.fn(), insert: vi.fn(), update: vi.fn(), upsert: vi.fn() }
  })

  return { unitUpdateMock, unitInsertMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  getHeldNotes.mockResolvedValue([])
  returnNote.mockResolvedValue(undefined)
})

describe("game-commit-ground-forces Phase 39b — Ragh's Call", () => {
  it("Ragh's Call held by invader, Saar has ground forces on planet → Saar forces ejected; note returned", async () => {
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === "Ragh's Call") {
        return [{ instanceId: NOTE_ID, holderPlayerId: PLAYER_ID, ownerPlayerId: SAAR_ID }]
      }
      return []
    })

    const { unitUpdateMock } = mockDb({
      defenders: [{ id: 'saar-inf', player_id: SAAR_ID, unit_type: 'infantry', count: 2 }],
    })

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)

    expect(unitUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ system_key: RETREAT_SYSTEM_KEY, on_planet: RETREAT_PLANET }),
    )
    expect(returnNote).toHaveBeenCalledWith(NOTE_ID, SAAR_ID, expect.anything())
  })

  it("Ragh's Call not held → no ejection, no returnNote", async () => {
    getHeldNotes.mockResolvedValue([])

    const { unitUpdateMock } = mockDb({
      defenders: [],
    })

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalled()
  })
})
