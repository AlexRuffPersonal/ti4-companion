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
  collectReactiveAgents: vi.fn().mockReturnValue([]),
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertCombatHitAllowed: vi.fn(),
  checkVpMaintenanceLaws: vi.fn(),
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
  retreat_declared_by: null,
  retreat_destination: null,
}

const ALL_PLAYERS = [
  { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
  { id: ATTACKER_ID, faction: 'The Federation Of Sol', leaders: null },
]

function mockDb({
  player = { id: DEFENDER_ID },
  combat = BASE_COMBAT,
  unitDefs = [{ name: 'fighter', sustain_damage: false }],
  assigneeUnits = [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
  atkUnitsLeft = [{ id: 'u2' }],
  defUnitsLeft = [{ id: 'u1' }],
  allPlayers = ALL_PLAYERS,
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
          eq: vi.fn().mockResolvedValue({ error: null }),
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
  requireAuth.mockResolvedValue(USER_ID)
  assertCombatHitAllowed.mockResolvedValue(undefined)
  checkVpMaintenanceLaws.mockResolvedValue(undefined)
})

describe('Phase 40 — Persistent Agenda Law Enforcement in assign-hits', () => {
  describe('assertCombatHitAllowed enforcement', () => {
    it('returns 409 when Conventions of War is active and a fighter is assigned as a casualty (destroy)', async () => {
      const lawError = new LawError('Conventions of War: fighters cannot be destroyed', 409)
      assertCombatHitAllowed.mockRejectedValue(lawError)

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
      expect(body.error).toContain('Conventions of War')
    })

    it('succeeds when Conventions of War is active and a cruiser is assigned as a casualty', async () => {
      // assertCombatHitAllowed resolves (cruiser is not a fighter)
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
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        combat_id: COMBAT_ID,
        casualties: [],
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
})
