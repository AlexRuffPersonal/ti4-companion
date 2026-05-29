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
vi.mock('../../../supabase/functions/_shared/techEffects.ts', () => ({
  resolveUnitStats: vi.fn((unitType, baseStats) => ({ ...baseStats })),
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ROLL_COMBAT_DICE: 'roll_combat_dice',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { resolveUnitStats } from '../../../supabase/functions/_shared/techEffects.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-roll-combat-dice/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const OPPONENT_ID = 'opponent-uuid'
const CAVALRY_UNIT_ID = 'cavalry-unit-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-roll-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'space',
  phase: 'attacker_roll',
  attacker_player_id: PLAYER_ID,
  defender_player_id: OPPONENT_ID,
  system_key: '0,0',
  attacker_hits: 0,
  defender_hits: 0,
  pending_effects: {},
  cavalry_active_player_id: null,
  cavalry_unit_id: null,
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const CRUISER_DEF = { name: 'cruiser', combat: '7', afb: null, sustain_damage: false }
const CRUISER_UNIT = { id: 'u1', player_id: PLAYER_ID, unit_type: 'cruiser', count: 1, system_key: '0,0' }
const CAVALRY_CRUISER_UNIT = { id: CAVALRY_UNIT_ID, player_id: PLAYER_ID, unit_type: 'cruiser', count: 1, system_key: '0,0' }

function mockDb({ player = BASE_PLAYER, combat = BASE_COMBAT, rollerUnits = [CRUISER_UNIT], unitDefs = [CRUISER_DEF] } = {}) {
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
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                // rollerUnits path: .is('on_planet', null) resolves directly
                is: vi.fn().mockResolvedValue({ data: rollerUnits, error: null }),
              }),
              // space combat rollerUnits: eq(game_id).eq(system_key).eq(player_id).is(on_planet)
              // but for Duranium Armor damaged ships query: eq.eq.eq.is.eq.limit
              is: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
  applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
})

describe('game-roll-combat-dice Phase 39b — The Cavalry promissory note', () => {
  it('cavalry_active_player_id set for caller and cavalry_unit_id matches a unit → flagship stats applied (combat=5, dice=2)', async () => {
    const combat = {
      ...BASE_COMBAT,
      cavalry_active_player_id: PLAYER_ID,
      cavalry_unit_id: CAVALRY_UNIT_ID,
    }
    mockDb({
      combat,
      rollerUnits: [CAVALRY_CRUISER_UNIT],
      unitDefs: [CRUISER_DEF], // base combat '7', but should be overridden
    })

    // Control Math.random to get deterministic rolls.
    // rollDice() runs first with original cruiser stats (consuming 1 random), then cavalry
    // logic replaces those results and rerolls 2 dice with flagship stats.
    const mathRandomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)  // initial cruiser roll (discarded by cavalry replacement)
      .mockReturnValueOnce(0.29) // first cavalry die: ceil(2.9)=3, miss (3 < 5)
      .mockReturnValueOnce(0.7)  // second cavalry die: ceil(7)=7, hit (7 >= 5)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Expect 2 dice (flagship has 2 dice per unit count=1), rolled with hit_on=5
    expect(body.dice).toHaveLength(2)
    expect(body.dice[0].hit_on).toBe(5)
    expect(body.dice[1].hit_on).toBe(5)
    expect(body.dice[0].roll).toBe(3)
    expect(body.dice[0].hit).toBe(false)
    expect(body.dice[1].roll).toBe(7)
    expect(body.dice[1].hit).toBe(true)
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('cavalry_active_player_id set for opponent (not caller) → no cavalry effect applied', async () => {
    const combat = {
      ...BASE_COMBAT,
      cavalry_active_player_id: OPPONENT_ID, // opponent has cavalry, not caller
      cavalry_unit_id: CAVALRY_UNIT_ID,
    }
    mockDb({
      combat,
      rollerUnits: [CAVALRY_CRUISER_UNIT],
      unitDefs: [CRUISER_DEF], // base combat '7'
    })

    // With no cavalry effect, cruiser has combat=7 and 1 die
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8) // roll=8, hit (8>=7)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Expect 1 die (cruiser base stats), hit_on=7 (not flagship 5)
    expect(body.dice).toHaveLength(1)
    expect(body.dice[0].hit_on).toBe(7)
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('cavalry_active_player_id null → no cavalry effect applied', async () => {
    const combat = {
      ...BASE_COMBAT,
      cavalry_active_player_id: null,
      cavalry_unit_id: CAVALRY_UNIT_ID,
    }
    mockDb({
      combat,
      rollerUnits: [CAVALRY_CRUISER_UNIT],
      unitDefs: [CRUISER_DEF],
    })

    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3) // roll=3, miss (3<7)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Expect 1 die with hit_on=7 (base cruiser), no cavalry transformation
    expect(body.dice).toHaveLength(1)
    expect(body.dice[0].hit_on).toBe(7)
    expect(body.hits).toBe(0)

    mathRandomSpy.mockRestore()
  })
})
