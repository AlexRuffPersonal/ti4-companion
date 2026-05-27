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

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertCombatHitAllowed: vi.fn(),
  checkVpMaintenanceLaws: vi.fn(),
  LawError: class LawError extends Error {
    constructor(msg, status = 409) { super(msg); this.name = 'LawError'; this.status = status }
  }
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { assertCombatHitAllowed, checkVpMaintenanceLaws, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
import { handler } from '../../../supabase/functions/game-assign-hits/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
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
  ships_destroyed: null,
  retreat_declared_by: null,
  retreat_destination: null,
}

function mockDb({
  player = { id: DEFENDER_ID },
  combat = BASE_COMBAT,
  unitDefs = [{ name: 'cruiser', sustain_damage: false }],
  assigneeUnits = [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 1, damaged: false, system_key: '1,-1' }],
  atkUnitsLeft = [{ id: 'u2' }],
  defUnitsLeft = [{ id: 'u1' }],
  allPlayers = [],
  systemPlanets = [],
} = {}) {
  let unitQueryCount = 0
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
                maybeSingle: vi.fn().mockResolvedValue({ data: player }),
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
              maybeSingle: vi.fn().mockResolvedValue({ data: combat }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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
            const isFirstQuery = unitQueryCount === 0
            unitQueryCount++
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
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      const chainable = {}
      chainable.select = vi.fn().mockReturnValue(chainable)
      chainable.eq = vi.fn().mockReturnValue(chainable)
      chainable.then = vi.fn()
      // Make it thenable/resolve like a query
      chainable.eq = vi.fn().mockImplementation(() => chainable)
      // Return the resolved value when awaited
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: systemPlanets }),
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
  requireAuth.mockResolvedValue(USER_ID)
  assertCombatHitAllowed.mockResolvedValue(undefined)
  checkVpMaintenanceLaws.mockResolvedValue(undefined)
})

describe('Phase 40 — Persistent Agenda Law Enforcement: game-assign-hits', () => {
  describe('assertCombatHitAllowed — Conventions of War', () => {
    it('returns 409 when Conventions of War is active and casualty is a fighter', async () => {
      const LawErrorInstance = new LawError('Conventions of War: fighters cannot be destroyed', 409)
      assertCombatHitAllowed.mockRejectedValueOnce(LawErrorInstance)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'fighter', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Conventions of War/)
    })

    it('succeeds when Conventions of War is active but casualty is a cruiser', async () => {
      assertCombatHitAllowed.mockResolvedValue(undefined)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'cruiser', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(200)
      expect(assertCombatHitAllowed).toHaveBeenCalledWith(expect.anything(), GAME_ID, 'cruiser')
    })
  })

  describe('checkVpMaintenanceLaws — planet control flip', () => {
    it('calls checkVpMaintenanceLaws for each planet in system when attacker wins (defender eliminated)', async () => {
      // Attacker assigns hits to their own units in attacker_assign phase,
      // but defender has 0 ships left → combat ends, attacker wins
      const PLANET_NAME = 'Mecatol Rex'
      const systemPlanets = [
        { player_id: DEFENDER_ID, planet_name: PLANET_NAME },
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
        // Attacker still has ships, defender has 0 ships left
        atkUnitsLeft: [{ id: 'u2' }],
        defUnitsLeft: [],
        allPlayers: [],
        systemPlanets,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('complete')
      expect(body.winner_player_id).toBe(ATTACKER_ID)

      expect(checkVpMaintenanceLaws).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        DEFENDER_ID,
        PLANET_NAME
      )
    })

    it('does not call checkVpMaintenanceLaws when combat continues (both sides have ships)', async () => {
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
        allPlayers: [],
        systemPlanets: [],
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [],
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).not.toHaveBeenCalled()
    })
  })

  describe('no laws active — unchanged behavior', () => {
    it('processes casualties normally when no laws are active', async () => {
      assertCombatHitAllowed.mockResolvedValue(undefined)
      checkVpMaintenanceLaws.mockResolvedValue(undefined)

      mockDb({
        player: { id: DEFENDER_ID },
        combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 },
        unitDefs: [{ name: 'destroyer', sustain_damage: false }],
        assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 2, damaged: false, system_key: '1,-1' }],
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [{ unit_type: 'destroyer', player_unit_id: 'u1', action: 'destroy' }],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.phase).toBe('defender_roll')
      expect(assertCombatHitAllowed).toHaveBeenCalledWith(expect.anything(), GAME_ID, 'destroyer')
    })
  })
})
