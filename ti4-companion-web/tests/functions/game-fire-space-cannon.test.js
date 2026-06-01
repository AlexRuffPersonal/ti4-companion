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
  EVT_FIRE_SPACE_CANNON: 'fire_space_cannon',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-fire-space-cannon/index.ts'

import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-fire-space-cannon', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const COMBAT_ID = 'combat-uuid'
const ATTACKER_ID = PLAYER_ID
const DEFENDER_ID = 'defender-uuid'

function makeCombat(overrides = {}) {
  return {
    id: COMBAT_ID,
    game_id: GAME_ID,
    system_key: '1,-1',
    phase: 'space_cannon',
    attacker_player_id: ATTACKER_ID,
    defender_player_id: DEFENDER_ID,
    space_cannon_pending: [
      { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 1, resolved: false },
    ],
    ...overrides,
  }
}

function mockDb({ player = { id: PLAYER_ID }, combat = makeCombat(), updateError = null } = {}) {
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { space_cannon: '6' }, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
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
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  })
}

describe('game-fire-space-cannon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(401)
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, pass: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when pass is not a boolean', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not found in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when combat is not in space_cannon phase', async () => {
    mockDb({ combat: makeCombat({ phase: 'attacker_roll' }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when no unresolved space cannon opportunity for player', async () => {
    mockDb({
      combat: makeCombat({
        space_cannon_pending: [
          { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 1, resolved: true },
        ],
      }),
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(409)
  })

  it('GIVEN allResolved=true EXPECT phase updated to barrage unconditionally', async () => {
    // All pending entries are for this player only — resolving them makes allResolved=true
    mockDb({
      combat: makeCombat({
        space_cannon_pending: [
          { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 1, resolved: false },
        ],
      }),
    })
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCombat({
                    space_cannon_pending: [
                      { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 1, resolved: false },
                    ],
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: updateSpy,
        }
      }
      return originalImpl(table)
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(200)
    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg.phase).toBe('barrage')
  })

  it('GIVEN allResolved=false EXPECT phase stays space_cannon', async () => {
    // Two entries: player has one unresolved, but another player also has unresolved
    mockDb({
      combat: makeCombat({
        space_cannon_pending: [
          { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 1, resolved: false },
          { player_id: DEFENDER_ID, system_key: '2,-1', unit_type: 'pds', dice_count: 1, resolved: false },
        ],
      }),
    })
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCombat({
                    space_cannon_pending: [
                      { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 1, resolved: false },
                      { player_id: DEFENDER_ID, system_key: '2,-1', unit_type: 'pds', dice_count: 1, resolved: false },
                    ],
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: updateSpy,
        }
      }
      return originalImpl(table)
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(200)
    const updateArg = updateSpy.mock.calls[0][0]
    expect(updateArg.phase).toBe('space_cannon')
  })

  it('calls logEvent with correct event_type when firing (not passing)', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'fire_space_cannon' }))
  })
})

describe('game-fire-space-cannon Phase 43c — Argent Flight commander: extra die on space cannon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  })

  it('Argent Flight commander unlocked — pending_window for add_die included in response', async () => {
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'UNIT_ABILITY_ROLL',
        faction: 'The Argent Flight',
        player_id: PLAYER_ID,
        effect: [{ op: 'add_die', target: 'chosen_unit' }],
      }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Argent Flight')
    expect(body.pending_window.trigger).toBe('UNIT_ABILITY_ROLL')
    expect(body.pending_window.effect).toEqual([{ op: 'add_die', target: 'chosen_unit' }])
  })

  it('no commanders unlocked — no pending_window in response', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })
})

describe('phase 30 — Plasma Scoring / Graviton / Antimass / L4 Disruptors', () => {
  const TARGET_ID = 'target-uuid'

  const BASE_COMBAT_P30 = {
    id: COMBAT_ID,
    game_id: GAME_ID,
    phase: 'space_cannon',
    attacker_player_id: PLAYER_ID,
    defender_player_id: TARGET_ID,
    system_key: '0,0',
    space_cannon_pending: [
      { player_id: PLAYER_ID, system_key: '0,0', unit_type: 'pds', dice_count: 1, resolved: false },
    ],
  }

  function buildPlayersMock(callerPlayer, targetPlayer, captureUpdate = null) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col) => {
            if (col === 'user_id') {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }) }
            }
            return { maybeSingle: vi.fn().mockResolvedValue({ data: targetPlayer, error: null }) }
          }),
        }),
      }),
      update: vi.fn().mockImplementation((data) => {
        if (captureUpdate) captureUpdate(data)
        return { eq: vi.fn().mockResolvedValue({ error: null }) }
      }),
    }
  }

  function buildUnitsMock(spaceCannonStat = '6') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { space_cannon: spaceCannonStat }, error: null }),
        }),
      }),
    }
  }

  function buildCombatsMock(combat = BASE_COMBAT_P30, captureUpdate = null) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockImplementation((data) => {
        if (captureUpdate) captureUpdate(data)
        return { eq: vi.fn().mockResolvedValue({ error: null }) }
      }),
    }
  }

  function buildUnitRowsMock() {
    const emptyResult = { data: [], error: null }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue(emptyResult),
            }),
            is: vi.fn().mockResolvedValue(emptyResult),
          }),
          is: vi.fn().mockResolvedValue(emptyResult),
        }),
      }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  }

  function mockDbP30({
    callerPlayer = { id: PLAYER_ID, technologies: [], exhausted_technologies: [] },
    targetPlayer = { id: TARGET_ID, technologies: [] },
    spaceCannonStat = '6',
    playerUpdateCapture = null,
    combatUpdateCapture = null,
  } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return buildPlayersMock(callerPlayer, targetPlayer, playerUpdateCapture)
      if (table === 'game_combats') return buildCombatsMock(BASE_COMBAT_P30, combatUpdateCapture)
      if (table === 'game_player_units') return buildUnitRowsMock()
      if (table === 'units') return buildUnitsMock(spaceCannonStat)
      return {}
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDbP30()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('Plasma Scoring adds extra die — two dice rolled', async () => {
    mockDbP30({ callerPlayer: { id: PLAYER_ID, technologies: ['Plasma Scoring'], exhausted_technologies: [] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.0) // roll=1, miss
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false,
      selections: { use_plasma_scoring: true },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dice).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('Graviton Laser exhausted and graviton_active: true returned', async () => {
    let capturedPlayerUpdate = null
    let capturedCombatUpdate = null
    mockDbP30({
      callerPlayer: { id: PLAYER_ID, technologies: ['Graviton Laser System'], exhausted_technologies: [] },
      playerUpdateCapture: (d) => { capturedPlayerUpdate = d },
      combatUpdateCapture: (d) => { capturedCombatUpdate = d },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false,
      selections: { use_graviton: true },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.graviton_active).toBe(true)
    expect(capturedPlayerUpdate?.exhausted_technologies).toContain('Graviton Laser System')
  })

  it('Antimass Deflectors: -1 to each die result — hit becomes miss', async () => {
    // PDS at '6'. Random=0.5 → floor(0.5*10)+1=6. Normally hits (6>=6).
    // With Antimass: 6-1=5, 5<6 → miss.
    mockDbP30({ targetPlayer: { id: TARGET_ID, technologies: ['Antimass Deflectors'] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hits).toBe(0)
    expect(body.dice[0].roll).toBe(5)
    vi.restoreAllMocks()
  })

  it('Antimass Deflectors: roll minimum clamped to 1', async () => {
    mockDbP30({ targetPlayer: { id: TARGET_ID, technologies: ['Antimass Deflectors'] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.0) // floor(0*10)+1=1; 1-1=0 → clamped to 1
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dice[0].roll).toBe(1)
    vi.restoreAllMocks()
  })

  it('L4 Disruptors: returns 409 during invasion', async () => {
    mockDbP30({ targetPlayer: { id: TARGET_ID, technologies: ['L4 Disruptors'] } })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false, is_invasion: true,
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/letnev/i)
  })

  it('L4 Disruptors: does not block when not invasion', async () => {
    mockDbP30({ targetPlayer: { id: TARGET_ID, technologies: ['L4 Disruptors'] } })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false, is_invasion: false,
    }))
    expect(res.status).toBe(200)
  })
})

describe('phase 39b — Strike Wing Ambuscade', () => {
  const TARGET_ID = 'target-uuid'
  const NOTE_ID = 'note-instance-uuid'
  const OWNER_ID = 'owner-uuid'

  const BASE_COMBAT_P39B = {
    id: COMBAT_ID,
    game_id: GAME_ID,
    phase: 'space_cannon',
    attacker_player_id: PLAYER_ID,
    defender_player_id: TARGET_ID,
    system_key: '0,0',
    space_cannon_pending: [
      { player_id: PLAYER_ID, system_key: '0,0', unit_type: 'pds', dice_count: 1, resolved: false },
    ],
  }

  function buildPlayersMock39b(callerPlayer, targetPlayer) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col) => {
            if (col === 'user_id') {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }) }
            }
            return { maybeSingle: vi.fn().mockResolvedValue({ data: targetPlayer, error: null }) }
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  }

  function buildUnitsMock39b(spaceCannonStat = '6') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { space_cannon: spaceCannonStat }, error: null }),
        }),
      }),
    }
  }

  function buildCombatsMock39b(combat = BASE_COMBAT_P39B) {
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

  function buildUnitRowsMock39b() {
    const emptyResult = { data: [], error: null }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue(emptyResult),
            }),
            is: vi.fn().mockResolvedValue(emptyResult),
          }),
          is: vi.fn().mockResolvedValue(emptyResult),
        }),
      }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  }

  function mockDb39b({
    callerPlayer = { id: PLAYER_ID, technologies: [], exhausted_technologies: [] },
    targetPlayer = { id: TARGET_ID, technologies: [] },
    spaceCannonStat = '6',
  } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return buildPlayersMock39b(callerPlayer, targetPlayer)
      if (table === 'game_combats') return buildCombatsMock39b(BASE_COMBAT_P39B)
      if (table === 'game_player_units') return buildUnitRowsMock39b()
      if (table === 'units') return buildUnitsMock39b(spaceCannonStat)
      return {}
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb39b()
    requireAuth.mockResolvedValue(USER_ID)
    getHeldNotes.mockResolvedValue([])
    returnNote.mockResolvedValue(undefined)
  })

  it('Strike Wing Ambuscade held by caller → +1 die for chosen unit; note returned', async () => {
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Strike Wing Ambuscade') {
        return [{ instanceId: NOTE_ID, holderPlayerId: PLAYER_ID, ownerPlayerId: OWNER_ID }]
      }
      return []
    })

    vi.spyOn(Math, 'random').mockReturnValue(0.0) // all rolls = 1, all misses

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      combat_id: COMBAT_ID,
      pass: false,
      selections: { ambuscade_unit_type: 'pds' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    // 1 base die + 1 ambuscade die = 2 dice total
    expect(body.dice).toHaveLength(2)
    expect(returnNote).toHaveBeenCalledWith(NOTE_ID, OWNER_ID, expect.anything())

    vi.restoreAllMocks()
  })

  it('Strike Wing Ambuscade not held → no extra die', async () => {
    getHeldNotes.mockResolvedValue([])

    vi.spyOn(Math, 'random').mockReturnValue(0.0)

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      combat_id: COMBAT_ID,
      pass: false,
      selections: { ambuscade_unit_type: 'pds' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    // 1 base die only
    expect(body.dice).toHaveLength(1)
    expect(returnNote).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
