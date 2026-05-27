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
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  })
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  AGENT_REACTIVE_TRIGGERS: {},
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
})),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const GAME_ID = 'game-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const OPPONENT_ID = 'opponent-uuid'
const SYSTEM_KEY = '0,0'
const TILE_ID = 'tile-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_CALLER = {
  id: PLAYER_ID,
  command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
  technologies: [],
  exhausted_technologies: [],
  trade_goods: 0,
  promissory_notes: [],
}

const BASE_GAME = {
  id: GAME_ID,
  active_player_id: PLAYER_ID,
  round: 1,
  map_tiles: { [SYSTEM_KEY]: { tile_id: TILE_ID } },
}

const PLAIN_TILE = { id: TILE_ID, wormhole: null, anomalies: [] }
const ASTEROID_TILE = { id: TILE_ID, wormhole: null, anomalies: ['asteroid_field'] }

function buildCommonMocks({
  callerPlayer = BASE_CALLER,
  game = BASE_GAME,
  tiles = [PLAIN_TILE],
  allGamePlayers = [BASE_CALLER],
  spaceUnits = [],
  playerUpdates = null,
} = {}) {
  let gamePlayersCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const call = gamePlayersCallCount
      if (call === 1) {
        // caller player by user_id
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
              }),
            }),
          }),
        }
      } else if (call === 2) {
        // all game players (array)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: allGamePlayers, error: null }),
          }),
        }
      } else {
        // update calls
        return {
          update: vi.fn().mockImplementation((data) => {
            if (playerUpdates) playerUpdates.push({ data })
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: spaceUnits, error: null }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
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

describe('game-activate-system Phase 30', () => {
  it('Chaos Mapping: blocks activation when Saar ships occupy asteroid field', async () => {
    const saarPlayer = { id: OPPONENT_ID, technologies: ['Chaos Mapping'], exhausted_technologies: [] }
    buildCommonMocks({
      tiles: [ASTEROID_TILE],
      allGamePlayers: [BASE_CALLER, saarPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/chaos mapping|saar/i)
  })

  it('Chaos Mapping: allows activation when Saar has no ships in the asteroid field', async () => {
    const saarPlayer = { id: OPPONENT_ID, technologies: ['Chaos Mapping'], exhausted_technologies: [] }
    buildCommonMocks({
      tiles: [ASTEROID_TILE],
      allGamePlayers: [BASE_CALLER, saarPlayer],
      spaceUnits: [], // no ships
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
  })

  it('Neuroglaive: activating player loses 1 fleet token', async () => {
    const naaluPlayer = {
      id: OPPONENT_ID,
      technologies: ['Neuroglaive'],
      exhausted_technologies: [],
      trade_goods: 0,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocks({
      callerPlayer: { ...BASE_CALLER, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
      allGamePlayers: [BASE_CALLER, naaluPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID, unit_type: 'fighter', count: 2, system_key: SYSTEM_KEY }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const fleetUpdate = playerUpdateCaptures.find(
      (u) => u.data?.command_tokens?.fleet !== undefined
    )
    expect(fleetUpdate?.data.command_tokens.fleet).toBe(1)
  })

  it('E-Res Siphons: Jol-Nar gains 4 trade goods', async () => {
    const jolNarPlayer = {
      id: OPPONENT_ID,
      technologies: ['E-Res Siphons'],
      exhausted_technologies: [],
      trade_goods: 3,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocks({
      allGamePlayers: [BASE_CALLER, jolNarPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID, unit_type: 'dreadnought', count: 1, system_key: SYSTEM_KEY }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const tgUpdate = playerUpdateCaptures.find((u) => u.data?.trade_goods !== undefined)
    expect(tgUpdate?.data.trade_goods).toBe(7)
  })

  it('Voidwatch: takes 1 promissory note from activating player', async () => {
    const empyreanPlayer = {
      id: OPPONENT_ID,
      technologies: ['Voidwatch'],
      exhausted_technologies: [],
      trade_goods: 0,
      promissory_notes: [],
    }
    const callerWithNotes = { ...BASE_CALLER, promissory_notes: ['note-a', 'note-b'] }
    const playerUpdateCaptures = []
    buildCommonMocks({
      callerPlayer: callerWithNotes,
      allGamePlayers: [callerWithNotes, empyreanPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID, unit_type: 'carrier', count: 1, system_key: SYSTEM_KEY }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    // Activating player should have 1 fewer note
    const callerUpdate = playerUpdateCaptures.find(
      (u) => Array.isArray(u.data?.promissory_notes) && u.data.promissory_notes.length === 1
    )
    expect(callerUpdate).toBeDefined()
  })

  it('Nullification Field: opens when_ships_enter_system window', async () => {
    const scatterPlayer = {
      id: OPPONENT_ID,
      technologies: ['Nullification Field'],
      exhausted_technologies: [],
      trade_goods: 0,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocks({
      allGamePlayers: [BASE_CALLER, scatterPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID, unit_type: 'destroyer', count: 1, system_key: SYSTEM_KEY }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const windowUpdate = playerUpdateCaptures.find(
      (u) => u.data?.pending_action_window?.type === 'when_ships_enter_system'
    )
    expect(windowUpdate).toBeDefined()
    expect(windowUpdate?.data.pending_action_window.eligible).toContain(OPPONENT_ID)
  })

  it('Nullification Field: does not open window when already exhausted', async () => {
    const scatterPlayer = {
      id: OPPONENT_ID,
      technologies: ['Nullification Field'],
      exhausted_technologies: ['Nullification Field'],
      trade_goods: 0,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocks({
      allGamePlayers: [BASE_CALLER, scatterPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID, unit_type: 'destroyer', count: 1, system_key: SYSTEM_KEY }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const windowUpdate = playerUpdateCaptures.find(
      (u) => u.data?.pending_action_window?.type === 'when_ships_enter_system'
    )
    expect(windowUpdate).toBeUndefined()
  })
})
