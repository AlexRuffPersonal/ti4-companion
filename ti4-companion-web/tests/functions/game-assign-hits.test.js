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

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', async (importActual) => {
  const actual = await importActual()
  return {
    ...actual,
    applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
  }
})

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertCombatHitAllowed: vi.fn().mockResolvedValue(undefined),
  checkVpMaintenanceLaws: vi.fn().mockResolvedValue(undefined),
  LawError: class LawError extends Error {
    constructor(message, status = 409) {
      super(message)
      this.name = 'LawError'
      this.status = status
    }
  },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { assertCombatHitAllowed, checkVpMaintenanceLaws, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
import { handler } from '../../../supabase/functions/game-assign-hits/index.ts'

import { USER_ID, GAME_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-assign-hits', body)

const PLAYER_ID = 'player-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

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
  onGameCombatsUpdate = null,
  allPlayers = [],
} = {}) {
  let queryCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id, faction, leaders') {
            return {
              eq: vi.fn().mockResolvedValue({ data: allPlayers }),
            }
          }
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
            const isFirstQuery = queryCount === 0
            queryCount++
            const resultData = isFirstQuery ? atkUnitsLeft : defUnitsLeft
            const chainable = {}
            chainable.eq = vi.fn().mockReturnValue(chainable)
            chainable.is = vi.fn().mockResolvedValue({ data: resultData })
            return chainable
          }
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
    if (table === 'game_laws') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
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
  assertCombatHitAllowed.mockResolvedValue(undefined)
  checkVpMaintenanceLaws.mockResolvedValue(undefined)
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
    const updateCalls = db.from('game_combats').update.mock.calls
    const shipUpdateCall = updateCalls.find(call => call[0]?.ships_destroyed)
    expect(shipUpdateCall).toBeUndefined()
  })
})

describe('game-assign-hits Phase 43a — Titans agent', () => {
  const TITANS_PLAYER_ID = 'titans-player-uuid'

  const ALL_PLAYERS_WITH_TITANS = [
    { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
    { id: ATTACKER_ID, faction: 'The Federation Of Sol', leaders: null },
    { id: TITANS_PLAYER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'unlocked' } },
  ]

  const ALL_PLAYERS_NO_TITANS = [
    { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
    { id: ATTACKER_ID, faction: 'The Federation Of Sol', leaders: null },
  ]

  describe('reactive agent on sustain damage', () => {
    it('includes pending_windows with reactive_agent for Titans when sustain damage occurs (defender_assign)', async () => {
      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
        unitDefs: [{ name: 'fighter', sustain_damage: true }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: ALL_PLAYERS_WITH_TITANS,
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID, combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_windows).toBeDefined()
      expect(body.pending_windows.length).toBeGreaterThan(0)
      const titansWindow = body.pending_windows.find(w => w.faction === 'The Titans Of Ul')
      expect(titansWindow).toBeDefined()
      expect(titansWindow.type).toBe('reactive_agent')
      expect(titansWindow.player_id).toBe(TITANS_PLAYER_ID)
    })

    it('does not include pending_windows when no sustain damage occurs', async () => {
      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
        unitDefs: [{ name: 'cruiser', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: ALL_PLAYERS_WITH_TITANS,
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID, combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_windows).toBeUndefined()
    })

    it('does not include Titans in pending_windows when Titans agent is not unlocked', async () => {
      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
        unitDefs: [{ name: 'fighter', sustain_damage: true }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: [
          { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
          { id: TITANS_PLAYER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'locked' } },
        ],
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID, combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_windows).toBeUndefined()
    })

    it('does not include the acting player in reactive agent windows even if eligible', async () => {
      // DEFENDER_ID is acting, assign the Titans faction to them
      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
        unitDefs: [{ name: 'fighter', sustain_damage: true }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: [
          // DEFENDER_ID IS The Titans Of Ul with unlocked agent — should be excluded
          { id: DEFENDER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'unlocked' } },
        ],
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID, combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_windows).toBeUndefined()
    })

    it('includes GROUND_COMBAT_START reactive agents when body.phase is ground_combat_start', async () => {
      const gcPlayers = [
        { id: ATTACKER_ID, faction: 'The Titans Of Ul', leaders: null },
        { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: { agent: 'unlocked' } },
        { id: TITANS_PLAYER_ID, faction: 'The Federation Of Sol', leaders: { agent: 'unlocked' } },
      ]
      mockDb({
        player: { id: ATTACKER_ID },
        combat: {
          ...BASE_COMBAT,
          phase: 'attacker_assign',
          attacker_hits: 0,
          defender_hits: 0,
          retreat_declared_by: null,
        },
        unitDefs: [{ name: 'cruiser', sustain_damage: false }],
        assigneeUnits: [],
        atkUnitsLeft: [{ id: 'u1' }],
        defUnitsLeft: [{ id: 'u2' }],
        allPlayers: gcPlayers,
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID, combat_id: COMBAT_ID,
        casualties: [],
        phase: 'ground_combat_start',
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_windows).toBeDefined()
      expect(body.pending_windows.length).toBe(2)
      const factions = body.pending_windows.map(w => w.faction)
      expect(factions).toContain('The Barony Of Letnev')
      expect(factions).toContain('The Federation Of Sol')
    })
  })
})

describe('game-assign-hits Phase 43c — Letnev commander: TG on sustain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    assertCombatHitAllowed.mockResolvedValue(undefined)
    checkVpMaintenanceLaws.mockResolvedValue(undefined)
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
    assertCombatHitAllowed.mockResolvedValue(undefined)
    checkVpMaintenanceLaws.mockResolvedValue(undefined)
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

describe('game-assign-hits Phase 40 — Persistent Agenda Law Enforcement', () => {
  const ALL_PLAYERS = [
    { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
    { id: ATTACKER_ID, faction: 'The Federation Of Sol', leaders: null },
  ]

  describe('assertCombatHitAllowed enforcement', () => {
    it('returns 409 when Conventions of War is active and a fighter is assigned as a casualty (destroy)', async () => {
      const lawError = new LawError('Conventions of War: fighters cannot be destroyed', 409)
      assertCombatHitAllowed.mockRejectedValue(lawError)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'fighter', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain('Conventions of War')
    })

    it('succeeds when Conventions of War is active and a cruiser is assigned as a casualty', async () => {
      assertCombatHitAllowed.mockResolvedValue(undefined)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'cruiser', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(200)
      expect(assertCombatHitAllowed).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        'cruiser'
      )
    })

    it('calls assertCombatHitAllowed for each casualty in the list', async () => {
      assertCombatHitAllowed.mockResolvedValue(undefined)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 2 },
        unitDefs: [{ name: 'cruiser', sustain_damage: false }],
        assigneeUnits: [
          { id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 3, damaged: false, system_key: '1,-1' },
        ],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [
          { unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' },
          { unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' },
        ],
      }))

      expect(res.status).toBe(200)
      expect(assertCombatHitAllowed).toHaveBeenCalledTimes(2)
    })

    it('does not call assertCombatHitAllowed when there are no casualties', async () => {
      mockDb({
        player: { id: ATTACKER_ID },
        combat: { ...BASE_COMBAT, phase: 'attacker_assign', attacker_hits: 0, defender_hits: 0, retreat_declared_by: null },
        unitDefs: [],
        assigneeUnits: [],
        atkUnitsLeft: [{ id: 'u1' }],
        defUnitsLeft: [{ id: 'u2' }],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [],
      }))

      expect(res.status).toBe(200)
      expect(assertCombatHitAllowed).not.toHaveBeenCalled()
    })

    it('Conventions of War active: sustain action on a fighter is NOT blocked (assertCombatHitAllowed not called for sustain)', async () => {
      const lawError = new LawError('Conventions of War: fighters cannot be destroyed', 409)
      assertCombatHitAllowed.mockRejectedValue(lawError)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'fighter', sustain_damage: true }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 1, damaged: false, system_key: '1,-1' }],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
      }))

      expect(res.status).toBe(200)
      expect(assertCombatHitAllowed).not.toHaveBeenCalled()
    })
  })

  describe('no laws active — unchanged behavior', () => {
    it('returns 200 for normal defender_assign with no active laws', async () => {
      assertCombatHitAllowed.mockResolvedValue(undefined)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'destroyer', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 2, damaged: false, system_key: '1,-1' }],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'destroyer', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.phase).toBe('defender_roll')
    })
  })

  describe('checkVpMaintenanceLaws in ground combat victory', () => {
    it('calls checkVpMaintenanceLaws with correct args when planet control flips in ground combat', async () => {
      const GROUND_COMBAT = {
        ...BASE_COMBAT,
        combat_type: 'ground',
        planet_name: 'Mecatol Rex',
        phase: 'attacker_assign',
        attacker_hits: 0,
        defender_hits: 1,
        retreat_declared_by: null,
        retreat_destination: null,
        ships_destroyed: null,
      }

      mockDb({
        player: { id: ATTACKER_ID },
        combat: GROUND_COMBAT,
        unitDefs: [{ name: 'infantry', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'infantry', count: 1, damaged: false, system_key: '1,-1' }],
        atkUnitsLeft: [{ id: 'u2' }],
        defUnitsLeft: [],
        allPlayers: ALL_PLAYERS,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'infantry', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('complete')
      expect(checkVpMaintenanceLaws).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        DEFENDER_ID,
        'Mecatol Rex',
      )
    })
  })
})
