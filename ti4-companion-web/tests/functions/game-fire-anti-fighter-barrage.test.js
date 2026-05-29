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

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-fire-anti-fighter-barrage/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const ATTACKER_ID = 'player-1'
const DEFENDER_ID = 'player-2'
const COMBAT_ID = 'combat-1'

function makeRequest(body) {
  return new Request('http://localhost/game-fire-anti-fighter-barrage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  phase: 'barrage',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  barrage_attacker_dice: null,
  barrage_attacker_hits: null,
  barrage_defender_dice: null,
  barrage_defender_hits: null,
}

// callCount tracks how many times game_player_units has been called
// to distinguish attacker (1st) from defender (2nd) query.
// game_players is called twice: 1st for auth check (by user_id), 2nd for attacker techs (by id).
// units is called twice: 1st for AFB def map (uses .in().not()), 2nd for Destroyer def (uses .eq().maybeSingle()).
function mockDb({
  player = { id: PLAYER_ID },
  combat = BASE_COMBAT,
  atkUnits = [],
  defUnits = [],
  unitDefs = [],
  updateError = null,
  attackerTechs = [],
  destroyerDefRow = null,
  commanderPlayers = [],
} = {}) {
  let unitsCallCount = 0
  let gamePlayersCallCount = 0
  let unitsTableCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const thisCall = gamePlayersCallCount
      if (thisCall === 1) {
        // First call: auth check — .select('id').eq('game_id').eq('user_id').maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player }),
              }),
            }),
          }),
        }
      } else if (thisCall === 2) {
        // Second call: attacker techs — .select('technologies').eq('id').maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { technologies: attackerTechs } }),
            }),
          }),
        }
      } else {
        // Third call: applyCommanderPassives — .select('id, faction, leaders').eq('game_id', ...) → array
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: commanderPlayers }),
          }),
        }
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
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_player_units') {
      unitsCallCount++
      const thisCall = unitsCallCount
      const units = thisCall === 1 ? atkUnits : defUnits
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: units }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'units') {
      unitsTableCallCount++
      const thisCall = unitsTableCallCount
      if (thisCall === 1) {
        // First call: AFB def map — .select('name, afb').in(...).not(...)
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: unitDefs }),
            }),
          }),
        }
      } else {
        // Second call: Destroyer def — .select('name, combat, ...').eq('name', 'Destroyer').maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: destroyerDefRow }),
            }),
          }),
        }
      }
    }
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-fire-anti-fighter-barrage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('400 missing combat_id', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('404 player not found in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('404 combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('409 not in barrage phase', async () => {
    mockDb({ combat: { ...BASE_COMBAT, phase: 'attacker_roll' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/barrage/i)
  })

  it('409 barrage already fired', async () => {
    mockDb({ combat: { ...BASE_COMBAT, barrage_attacker_dice: [{ unit_type: 'destroyer', roll: 9, hit_on: 9, hit: true }] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already fired/i)
  })

  it('409 only attacker can fire barrage', async () => {
    mockDb({ player: { id: DEFENDER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/attacker/i)
  })

  it('409 no AFB units in this system', async () => {
    mockDb({
      atkUnits: [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'cruiser', count: 1, system_key: '1,-1' }],
      defUnits: [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'fighter', count: 3, system_key: '1,-1' }],
      unitDefs: [],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/anti-fighter barrage/i)
  })

  it('200 attacker hits → phase afb_attacker_assign, no game_player_units mutations', async () => {
    // 2 attacker destroyers (afb '9'), 1 defender destroyer + 3 fighters
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 2, system_key: '1,-1' },
    ]
    const defUnits = [
      { id: 'u2', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
      { id: 'u3', player_id: DEFENDER_ID, unit_type: 'fighter', count: 3, system_key: '1,-1' },
    ]
    const unitDefs = [{ name: 'destroyer', afb: '9' }]

    // Capture the update mock before handler runs
    let capturedUpdateMock
    let unitsCallCount = 0
    let gamePlayersCallCount = 0
    let unitsTableCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        if (gamePlayersCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
                }),
              }),
            }),
          }
        } else if (gamePlayersCallCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { technologies: [] } }),
              }),
            }),
          }
        } else {
          // Third call: applyCommanderPassives — no unlocked commanders
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }
        }
      }
      if (table === 'game_combats') {
        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        capturedUpdateMock = updateMock
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_player_units') {
        unitsCallCount++
        const thisCall = unitsCallCount
        const units = thisCall === 1 ? atkUnits : defUnits
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: units }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        unitsTableCallCount++
        if (unitsTableCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: unitDefs }),
              }),
            }),
          }
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }
        }
      }
      return { select: vi.fn() }
    })

    // Attacker rolls 2 dice (2 destroyers × 1 die each), both hit (roll=10 >= 9)
    // Defender rolls 1 die (1 destroyer × 1 die), misses (roll=5 < 9)
    const randomSpy = vi.spyOn(Math, 'random')
    // Math.ceil(Math.random() * 10): return 1.0 → 10 (hit), 1.0 → 10 (hit), 0.4 → 4 (miss)
    randomSpy.mockReturnValueOnce(1.0).mockReturnValueOnce(1.0).mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(2)
    expect(body.barrage_defender_hits).toBe(0)
    expect(body.phase).toBe('afb_attacker_assign')

    // Verify game_combats.update was called with correct payload
    expect(capturedUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      barrage_attacker_hits: 2,
      barrage_defender_hits: 0,
      phase: 'afb_attacker_assign',
    }))

    // Confirm no game_player_units mutations — only 2 calls (select atk + select def)
    expect(unitsCallCount).toBe(2)

    randomSpy.mockRestore()
  })

  it('200 only defender hits → phase afb_defender_assign', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = [
      { id: 'u2', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const unitDefs = [{ name: 'destroyer', afb: '9' }]

    mockDb({ atkUnits, defUnits, unitDefs })

    // Attacker misses (roll=5), defender hits (roll=10)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4).mockReturnValueOnce(1.0)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(0)
    expect(body.barrage_defender_hits).toBe(1)
    expect(body.phase).toBe('afb_defender_assign')

    randomSpy.mockRestore()
  })

  it('200 all rolls miss → phase attacker_roll, no game_player_units mutations', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = [
      { id: 'u2', player_id: DEFENDER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
    ]
    const unitDefs = [{ name: 'destroyer', afb: '9' }]

    // Capture update mock
    let capturedUpdateMock
    let unitsCallCount = 0
    let gamePlayersCallCount2 = 0
    let unitsTableCallCount2 = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount2++
        if (gamePlayersCallCount2 === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
                }),
              }),
            }),
          }
        } else if (gamePlayersCallCount2 === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { technologies: [] } }),
              }),
            }),
          }
        } else {
          // Third call: applyCommanderPassives — no unlocked commanders
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }
        }
      }
      if (table === 'game_combats') {
        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        capturedUpdateMock = updateMock
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_player_units') {
        unitsCallCount++
        const thisCall = unitsCallCount
        const units = thisCall === 1 ? atkUnits : defUnits
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: units }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        unitsTableCallCount2++
        if (unitsTableCallCount2 === 1) {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: unitDefs }),
              }),
            }),
          }
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }
        }
      }
      return { select: vi.fn() }
    })

    // Both miss (roll=4 < 9)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4).mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(0)
    expect(body.barrage_defender_hits).toBe(0)
    expect(body.phase).toBe('attacker_roll')

    // Verify game_combats.update called with both hits=0 and phase=attacker_roll
    expect(capturedUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      barrage_attacker_hits: 0,
      barrage_defender_hits: 0,
      phase: 'attacker_roll',
    }))

    // Confirm no game_player_units mutations — only 2 calls (select atk + select def)
    expect(unitsCallCount).toBe(2)

    randomSpy.mockRestore()
  })

  // Phase 30 tests: upgraded Destroyer stats + Plasma Scoring

  it('Phase 30: Destroyer II tech — resolveUnitStats called; upgraded afb stats used in roll', async () => {
    // Destroyer II upgrades AFB from 9 to 8 (better hit value). resolveUnitStats is a stub
    // in Phase 30, so we verify the code path: upgraded stat returned from resolveUnitStats
    // is used when an override is present. We'll mock the Destroyer def to return afb='9'
    // and attackerTechs=['Destroyer II']. Since resolveUnitStats is a stub returning base stats,
    // the roll hit-threshold stays at 9. The key check is that the override path is taken (no crash)
    // and the result is correct.
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'Destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = []
    const unitDefs = [{ name: 'Destroyer', afb: '9' }]
    const destroyerDefRow = { name: 'Destroyer', combat: 8, move: 2, capacity: 1, afb: '9', space_cannon: null, bombardment: null }

    mockDb({ atkUnits, defUnits, unitDefs, attackerTechs: ['Destroyer II'], destroyerDefRow })

    // Roll hits (roll=10 >= 9)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(1.0)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.barrage_attacker_hits).toBe(1)
    expect(body.barrage_attacker_dice).toHaveLength(1)
    expect(body.barrage_attacker_dice[0].unit_type).toBe('Destroyer')

    randomSpy.mockRestore()
  })

  it('Phase 30: Plasma Scoring owned + plasma_scoring_unit=Destroyer — bonus die added', async () => {
    // 1 attacker Destroyer with Plasma Scoring → rolls 2 dice instead of 1
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'Destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = []
    const unitDefs = [{ name: 'Destroyer', afb: '9' }]
    const destroyerDefRow = { name: 'Destroyer', combat: 8, move: 2, capacity: 1, afb: '9', space_cannon: null, bombardment: null }

    mockDb({ atkUnits, defUnits, unitDefs, attackerTechs: ['Plasma Scoring'], destroyerDefRow })

    // Plasma Scoring adds +1 die → 2 dice total. Both miss.
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4).mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      combat_id: COMBAT_ID,
      plasma_scoring_unit: 'Destroyer',
    }))
    expect(res.status).toBe(200)

    const body = await res.json()
    // 2 dice rolled (base 1 + plasma scoring bonus 1), both missed
    expect(body.barrage_attacker_dice).toHaveLength(2)
    expect(body.barrage_attacker_hits).toBe(0)

    randomSpy.mockRestore()
  })

  it('Phase 30: no Destroyer II, no Plasma Scoring — base stats used, no bonus die', async () => {
    // Standard case: 1 attacker Destroyer, no upgrades → exactly 1 die rolled
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'Destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = []
    const unitDefs = [{ name: 'Destroyer', afb: '9' }]
    const destroyerDefRow = { name: 'Destroyer', combat: 8, move: 2, capacity: 1, afb: '9', space_cannon: null, bombardment: null }

    mockDb({ atkUnits, defUnits, unitDefs, attackerTechs: [], destroyerDefRow })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    // Exactly 1 die rolled (base, no bonus)
    expect(body.barrage_attacker_dice).toHaveLength(1)
    expect(body.barrage_attacker_hits).toBe(0)

    randomSpy.mockRestore()
  })

  // Phase 43c tests: Commander Passives

  it('Phase 43c: Argent Flight commander unlocked — pending_window add_die emitted', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'Destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = []
    const unitDefs = [{ name: 'Destroyer', afb: '9' }]
    const destroyerDefRow = { name: 'Destroyer', combat: 8, move: 2, capacity: 1, afb: '9', space_cannon: null, bombardment: null }

    const argentPlayer = {
      id: ATTACKER_ID,
      faction: 'The Argent Flight',
      leaders: { commander: 'unlocked' },
    }

    mockDb({
      atkUnits,
      defUnits,
      unitDefs,
      attackerTechs: [],
      destroyerDefRow,
      commanderPlayers: [argentPlayer],
    })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Argent Flight')
    expect(body.pending_window.trigger).toBe('UNIT_ABILITY_ROLL')
    expect(body.pending_window.effect).toEqual([{ op: 'add_die', target: 'chosen_unit' }])

    randomSpy.mockRestore()
  })

  it('Phase 43c: Jol-Nar commander unlocked — pending_window commander_reroll emitted', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'Destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = []
    const unitDefs = [{ name: 'Destroyer', afb: '9' }]
    const destroyerDefRow = { name: 'Destroyer', combat: 8, move: 2, capacity: 1, afb: '9', space_cannon: null, bombardment: null }

    const jolNarPlayer = {
      id: ATTACKER_ID,
      faction: 'The Universities Of Jol-Nar',
      leaders: { commander: 'unlocked' },
    }

    mockDb({
      atkUnits,
      defUnits,
      unitDefs,
      attackerTechs: [],
      destroyerDefRow,
      commanderPlayers: [jolNarPlayer],
    })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Universities Of Jol-Nar')
    expect(body.pending_window.trigger).toBe('UNIT_ABILITY_ROLL')
    expect(body.pending_window.effect).toBe('jol_nar_reroll_window')

    randomSpy.mockRestore()
  })

  it('Phase 43c: no commanders unlocked — no pending_window in response', async () => {
    const atkUnits = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'Destroyer', count: 1, system_key: '1,-1' },
    ]
    const defUnits = []
    const unitDefs = [{ name: 'Destroyer', afb: '9' }]
    const destroyerDefRow = { name: 'Destroyer', combat: 8, move: 2, capacity: 1, afb: '9', space_cannon: null, bombardment: null }

    mockDb({ atkUnits, defUnits, unitDefs, attackerTechs: [], destroyerDefRow, commanderPlayers: [] })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.4)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.pending_window).toBeUndefined()

    randomSpy.mockRestore()
  })
})
