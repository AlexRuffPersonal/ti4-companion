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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-move-ships/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ORIGIN_KEY = '2,0'
const DEST_KEY = '1,0'

function makeRequest(body) {
  return new Request('http://localhost/game-move-ships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_GAME = {
  active_player_id: PLAYER_ID,
  round: 1,
  map_tiles: {
    [ORIGIN_KEY]: { tile_id: 'tile-origin' },
    [DEST_KEY]: { tile_id: 'tile-dest' },
  },
}

const CARRIER_DEF = { name: 'carrier', move: 2, capacity: 4 }

function mockDb({
  player = { id: PLAYER_ID },
  game = DEFAULT_GAME,
  spaceUnits = [{ id: 'unit-1', player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: ORIGIN_KEY }],
  activations = [],
  tiles = [
    { id: 'tile-origin', anomalies: [], wormholes: [] },
    { id: 'tile-dest', anomalies: [], wormholes: [] },
  ],
  unitDefs = [CARRIER_DEF],
} = {}) {
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
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: spaceUnits }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs }),
        }),
      }
    }
    return {}
  })
}

describe('game-move-ships Phase 43c — commander passives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  })

  it('calls applyCommanderPassives with SHIPS_MOVED trigger after move', async () => {
    mockDb()
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      active_system_key: DEST_KEY,
      ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
    }))
    expect(res.status).toBe(200)
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'SHIPS_MOVED',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: DEST_KEY }),
      expect.anything(),
    )
  })

  it('Creuss commander — returns pending_window when unlocked commander emits window', async () => {
    mockDb()
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SHIPS_MOVED',
        faction: 'The Ghosts Of Creuss',
        player_id: PLAYER_ID,
        effect: [{ op: 'place_units', unit_type: 'fighter', count: 1, target: 'active_system' }],
      }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      active_system_key: DEST_KEY,
      ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Ghosts Of Creuss')
  })

  it('Empyrean commander — returns pending_window for return-token window', async () => {
    mockDb()
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SHIPS_MOVED',
        faction: 'The Empyrean',
        player_id: 'empyrean-player-uuid',
        effect: 'empyrean_return_token',
      }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      active_system_key: DEST_KEY,
      ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Empyrean')
  })

  it('no pending_window field when no commander passive fires', async () => {
    mockDb()
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      active_system_key: DEST_KEY,
      ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
    expect(body.moved).toBe(true)
  })
})
