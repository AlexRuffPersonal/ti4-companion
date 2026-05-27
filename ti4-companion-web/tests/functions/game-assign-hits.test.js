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
  EVT_ASSIGN_HITS: 'assign_hits',
}))

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
  collectReactiveAgents: vi.fn().mockReturnValue([]),
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertCombatHitAllowed: vi.fn().mockResolvedValue(undefined),
  checkVpMaintenanceLaws: vi.fn().mockResolvedValue(undefined),
  LawError: class LawError extends Error { constructor(msg) { super(msg); this.name = 'LawError' } },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-assign-hits/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-assign-hits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  combat_type: 'space',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'defender_assign',
  round: 1,
  status: 'active',
  attacker_hits: 1,
  defender_hits: 0,
  retreat_declared_by: null,
  retreat_destination: null,
}

function mockDb({
  player = { id: DEFENDER_ID },
  playerError = null,
  combat = BASE_COMBAT,
  combatError = null,
  unitDefs = [{ name: 'cruiser', sustain_damage: false }],
  assigneeUnits = [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
  atkUnitsLeft = [{ id: 'u2' }],
  defUnitsLeft = [{ id: 'u1' }],
  updateError = null,
  onGameCombatsUpdate = null, // callback when game_combats.update is called
  allPlayers = [],
} = {}) {
  let queryCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id, faction, leaders') {
            // allPlayers query: .eq('game_id', ...) → resolves array
            return {
              eq: vi.fn().mockResolvedValue({ data: allPlayers }),
            }
          }
          // Player lookup: .eq('game_id').eq('user_id').maybeSingle()
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
              }),
            }),
          }
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: combatError }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((updateData) => {
          if (onGameCombatsUpdate) onGameCombatsUpdate(updateData)
          return {
            eq: vi.fn().mockResolvedValue({ error: updateError }),
          }
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
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            // unit count queries for atkUnitsLeft / defUnitsLeft
            const isFirstQuery = queryCount === 0
            queryCount++
            const resultData = isFirstQuery ? atkUnitsLeft : defUnitsLeft
            const chainable = {}
            chainable.eq = vi.fn().mockReturnValue(chainable)
            chainable.is = vi.fn().mockResolvedValue({ data: resultData })
            return chainable
          }
          // assignee units query (fields includes more columns)
          const chainable = {}
          chainable.eq = vi.fn().mockReturnValue(chainable)
          chainable.is = vi.fn().mockResolvedValue({ data: assigneeUnits })
          return chainable
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: null }),
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
            is: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_system_tokens') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  checkAndEliminate.mockResolvedValue([])
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-assign-hits', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, casualties: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when casualties is not an array', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: null }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when combat is not in an assign phase', async () => {
    mockDb({ combat: { ...BASE_COMBAT, phase: 'attacker_roll' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when it is not the player turn to assign', async () => {
    // defender_assign phase but player is attacker
    mockDb({ player: { id: ATTACKER_ID }, combat: BASE_COMBAT })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }] }))
    expect(res.status).toBe(409)
  })

  it('advances to defender_roll when defender assigns hits', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('defender_roll')
  })

  it('resolves combat via retreat and returns complete', async () => {
    mockDb({
      player: { id: ATTACKER_ID },
      combat: {
        ...BASE_COMBAT,
        phase: 'attacker_assign',
        attacker_hits: 0,
        defender_hits: 0,
        retreat_declared_by: ATTACKER_ID,
        retreat_destination: '2,-1',
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('complete')
    expect(body.winner_player_id).toBeDefined()
  })

  it('includes eliminatedPlayerIds in response when a player is eliminated', async () => {
    checkAndEliminate.mockResolvedValue(['player-uuid'])
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminatedPlayerIds).toEqual(['player-uuid'])
  })

  it('includes empty eliminatedPlayerIds when no elimination', async () => {
    checkAndEliminate.mockResolvedValue([])
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminatedPlayerIds).toEqual([])
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('increments attacker ships_destroyed when attacker unit is destroyed', async () => {
    const unitDef = { name: 'fighter', sustain_damage: false }
    const attackerUnit = { id: 'u_atk', player_id: ATTACKER_ID, unit_type: 'fighter', count: 3, damaged: false, system_key: '1,-1' }
    let shipUpdateCalls = []
    mockDb({
      player: { id: ATTACKER_ID },
      combat: {
        ...BASE_COMBAT,
        phase: 'attacker_assign',
        attacker_hits: 0,
        defender_hits: 2,
        ships_destroyed: { attacker: {}, defender: {} },
      },
      unitDefs: [unitDef],
      assigneeUnits: [attackerUnit],
      atkUnitsLeft: [{ id: 'u_atk' }],
      defUnitsLeft: [{ id: 'u2' }],
      onGameCombatsUpdate: (updateData) => {
        if (updateData.ships_destroyed) {
          shipUpdateCalls.push(updateData)
        }
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'fighter', player_unit_id: 'u_atk', action: 'destroy' }, { unit_type: 'fighter', player_unit_id: 'u_atk', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    // Verify game_combats update was called with ships_destroyed
    expect(shipUpdateCalls.length).toBeGreaterThan(0)
    expect(shipUpdateCalls[0].ships_destroyed).toEqual({
      attacker: { fighter: 2 },
      defender: {},
    })
  })

  it('increments defender ships_destroyed when defender unit is destroyed', async () => {
    const unitDef = { name: 'cruiser', sustain_damage: false }
    let shipUpdateCalls = []
    mockDb({
      player: { id: DEFENDER_ID },
      combat: {
        ...BASE_COMBAT,
        phase: 'defender_assign',
        attacker_hits: 1,
        defender_hits: 0,
        ships_destroyed: { attacker: {}, defender: {} },
      },
      unitDefs: [unitDef],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
      atkUnitsLeft: [{ id: 'u_atk' }],
      defUnitsLeft: [{ id: 'u1' }],
      onGameCombatsUpdate: (updateData) => {
        if (updateData.ships_destroyed) {
          shipUpdateCalls.push(updateData)
        }
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    // Verify game_combats update was called with ships_destroyed
    expect(shipUpdateCalls.length).toBeGreaterThan(0)
    expect(shipUpdateCalls[0].ships_destroyed).toEqual({
      attacker: {},
      defender: { cruiser: 1 },
    })
  })

  it('does not update ships_destroyed when no units destroyed (all sustain)', async () => {
    const unitDef = { name: 'fighter', sustain_damage: true }
    mockDb({
      player: { id: DEFENDER_ID },
      combat: {
        ...BASE_COMBAT,
        phase: 'defender_assign',
        attacker_hits: 1,
        defender_hits: 0,
        ships_destroyed: { attacker: {}, defender: {} },
      },
      unitDefs: [unitDef],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
    }))
    expect(res.status).toBe(200)
    // Verify game_combats update was NOT called with ships_destroyed
    const updateCalls = db.from('game_combats').update.mock.calls
    const shipUpdateCall = updateCalls.find(call => call[0]?.ships_destroyed)
    expect(shipUpdateCall).toBeUndefined()
  })
})

describe('game-assign-hits Phase 43c — Letnev commander: TG on sustain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('sustain damage occurs — SUSTAIN_DAMAGE passive fires and pending_window returned', async () => {
    const letnevWindow = {
      game_id: GAME_ID,
      trigger: 'SUSTAIN_DAMAGE',
      faction: 'The Barony Of Letnev',
      player_id: DEFENDER_ID,
      effect: [{ op: 'gain_trade_goods', amount: 1 }],
    }
    applyCommanderPassives.mockImplementation(async (trigger) => {
      if (trigger === 'SUSTAIN_DAMAGE') {
        return { inlineEffects: [], pendingWindows: [letnevWindow] }
      }
      return { inlineEffects: [], pendingWindows: [] }
    })

    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
      unitDefs: [{ name: 'cruiser', sustain_damage: true }],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 1, damaged: false, system_key: '1,-1' }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'sustain' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Barony Of Letnev')
    expect(body.pending_window.trigger).toBe('SUSTAIN_DAMAGE')
    expect(applyCommanderPassives).toHaveBeenCalledWith('SUSTAIN_DAMAGE', expect.objectContaining({ gameId: GAME_ID }), expect.anything())
  })

  it('no sustain damage — SUSTAIN_DAMAGE passive does not fire', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
      unitDefs: [{ name: 'cruiser', sustain_damage: false }],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
    const sustainCall = applyCommanderPassives.mock.calls.find(([t]) => t === 'SUSTAIN_DAMAGE')
    expect(sustainCall).toBeUndefined()
  })
})

describe('game-assign-hits Phase 43c — Naaz-Rokha commander: explore on planet gain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('attacker wins ground combat — PLANET_CONTROL_GAINED passive fires and pending_window returned', async () => {
    const naazWindow = {
      game_id: GAME_ID,
      trigger: 'PLANET_CONTROL_GAINED',
      faction: 'The Naaz-Rokha Alliance',
      player_id: ATTACKER_ID,
      effect: [{ op: 'explore_planet_free' }],
    }
    applyCommanderPassives.mockImplementation(async (trigger) => {
      if (trigger === 'PLANET_CONTROL_GAINED') {
        return { inlineEffects: [], pendingWindows: [naazWindow] }
      }
      return { inlineEffects: [], pendingWindows: [] }
    })

    // attacker_assign: hitsToAssign = combat.defender_hits = 0; send empty casualties
    mockDb({
      player: { id: ATTACKER_ID },
      combat: {
        ...BASE_COMBAT,
        combat_type: 'ground',
        planet_name: 'mecatol_rex',
        phase: 'attacker_assign',
        attacker_hits: 0,
        defender_hits: 0,
        attacker_player_id: ATTACKER_ID,
        defender_player_id: DEFENDER_ID,
      },
      unitDefs: [],
      assigneeUnits: [],
      atkUnitsLeft: [{ id: 'u-atk-left' }],
      defUnitsLeft: [],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Naaz-Rokha Alliance')
    expect(body.pending_window.trigger).toBe('PLANET_CONTROL_GAINED')
    expect(applyCommanderPassives).toHaveBeenCalledWith('PLANET_CONTROL_GAINED', expect.objectContaining({ gameId: GAME_ID, planetName: 'mecatol_rex' }), expect.anything())
  })
})
