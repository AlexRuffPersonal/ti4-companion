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
  EVT_ROLL_GROUND_COMBAT_DICE: 'roll_ground_combat_dice',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { resolveUnitStats } from '../../../supabase/functions/_shared/techEffects.ts'
import { handler } from '../../../supabase/functions/game-roll-ground-combat-dice/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const OPPONENT_ID = 'opponent-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-roll-ground-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'ground',
  phase: 'attacker_roll',
  attacker_player_id: PLAYER_ID,
  defender_player_id: OPPONENT_ID,
  system_key: '0,0',
  planet_name: 'Mecatol Rex',
  attacker_hits: 0,
  defender_hits: 0,
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const INFANTRY_DEF = { name: 'infantry', combat: '8', sustain_damage: false }
const INFANTRY_UNIT = { id: 'u1', player_id: PLAYER_ID, unit_type: 'infantry', count: 1, system_key: '0,0' }

function mockDb({
  player = BASE_PLAYER,
  combat = BASE_COMBAT,
  rollerUnits = [INFANTRY_UNIT],
  unitDefs = [INFANTRY_DEF],
  defenderPlayer = { id: OPPONENT_ID, technologies: [], exhausted_technologies: [] },
  defenderUnits = [],
  defenderUnitDefs = [],
  updateCombatError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockImplementation(() => {
                // Both caller (by user_id) and defender (by id) go through eq().eq().maybeSingle()
                // Return player for user_id lookup, defenderPlayer for id lookup
                // We can't easily distinguish, so return player by default
                // Tests that need defenderPlayer will override this
                return Promise.resolve({ data: player, error: null })
              }),
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateCombatError }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: rollerUnits, error: null }),
              }),
            }),
          }),
        }),
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
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
  resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
})

describe('game-roll-ground-combat-dice Phase 30', () => {
  it('calls resolveUnitStats with player technologies', async () => {
    mockDb({ player: { ...BASE_PLAYER, technologies: ['Infantry II'] } })
    await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(resolveUnitStats).toHaveBeenCalledWith(
      'infantry',
      expect.objectContaining({ combat: 8, dice: 1 }),
      ['Infantry II'],
    )
  })

  it('Magen Defense Grid: attacker rolls produce 0 hits when defender uses it', async () => {
    const defenderPlayer = {
      id: OPPONENT_ID,
      technologies: ['Magen Defense Grid'],
      exhausted_technologies: [],
    }
    // Build a full custom mock for this test
    let combatUpdateCapture = null
    let playerUpdateCapture = null
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(async () => {
                  return { data: BASE_PLAYER, error: null }
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            playerUpdateCapture = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            combatUpdateCapture = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [INFANTRY_UNIT], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ name: 'infantry', planetary_shield: true }], error: null }),
          }),
        }
      }
      return {}
    })

    // Second game_players query for defender needs to return defenderPlayer
    // Override the game_players mock to handle both caller and defender lookups
    let callCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        callCount++
        if (callCount === 1) {
          // First call: caller player lookup
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: BASE_PLAYER, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        } else {
          // Second call: defender player lookup
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: defenderPlayer, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              playerUpdateCapture = data
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            combatUpdateCapture = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [INFANTRY_UNIT], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ name: 'infantry', planetary_shield: true }], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, selections: { use_magen: true } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hits).toBe(0)
    expect(body.dice).toEqual([])
    expect(body.magen_applied).toBe(true)
    expect(playerUpdateCapture?.exhausted_technologies).toContain('Magen Defense Grid')
    expect(combatUpdateCapture?.attacker_hits).toBe(0)
  })

  it('Supercharge: +1 to all rolls and exhausts tech', async () => {
    let playerUpdateCapture = null
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // ceil(0.5*10) = 5, threshold=8, miss; +1 → 6, still miss
    // Use threshold of 6 so that roll=5 misses but roll+1=6 hits
    const lowThresholdDef = { name: 'infantry', combat: '6', sustain_damage: false }
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...BASE_PLAYER, technologies: ['Supercharge'], exhausted_technologies: [] },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            playerUpdateCapture = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
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
                  eq: vi.fn().mockResolvedValue({ data: [INFANTRY_UNIT], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [lowThresholdDef], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, selections: { use_supercharge: true } }))
    expect(res.status).toBe(200)
    const resBody = await res.json()
    // roll=5 → with Supercharge: 5+1=6 ≥ 6 → hit
    expect(resBody.hits).toBe(1)
    expect(resBody.dice[0].roll).toBe(6)
    expect(playerUpdateCapture?.exhausted_technologies).toContain('Supercharge')
    vi.spyOn(Math, 'random').mockRestore()
  })

  it('Valkyrie Particle Weave: +1 hit when opponent had hits', async () => {
    const combatWithOpponentHits = {
      ...BASE_COMBAT,
      phase: 'defender_roll',
      attacker_hits: 2, // opponent (attacker) scored 2 hits this round
    }
    mockDb({
      player: { ...BASE_PLAYER, id: OPPONENT_ID, technologies: ['Valkyrie Particle Weave'] },
      combat: combatWithOpponentHits,
    })
    requireAuth.mockResolvedValue('defender-user')

    // Override player lookup so id matches defender
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: OPPONENT_ID, technologies: ['Valkyrie Particle Weave'], exhausted_technologies: [] },
                  error: null,
                }),
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
                maybeSingle: vi.fn().mockResolvedValue({ data: combatWithOpponentHits, error: null }),
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
                  eq: vi.fn().mockResolvedValue({ data: [{ ...INFANTRY_UNIT, player_id: OPPONENT_ID }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [INFANTRY_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    vi.spyOn(Math, 'random').mockReturnValue(0.1) // roll=1, no hits from dice
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const resBody = await res.json()
    // 0 dice hits + 1 from Valkyrie = 1
    expect(resBody.hits).toBe(1)
    vi.spyOn(Math, 'random').mockRestore()
  })

  it('no tech effects when player has no techs', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
  })
})
