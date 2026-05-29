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
  getHeldNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-fire-space-cannon/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const TARGET_ID = 'target-uuid'
const NOTE_ID = 'note-instance-uuid'
const OWNER_ID = 'owner-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-fire-space-cannon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
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

function buildPlayersMock(callerPlayer, targetPlayer) {
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

function buildUnitsMock(spaceCannonStat = '6') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { space_cannon: spaceCannonStat }, error: null }),
      }),
    }),
  }
}

function buildCombatsMock(combat = BASE_COMBAT) {
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

function mockDb({
  callerPlayer = { id: PLAYER_ID, technologies: [], exhausted_technologies: [] },
  targetPlayer = { id: TARGET_ID, technologies: [] },
  spaceCannonStat = '6',
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') return buildPlayersMock(callerPlayer, targetPlayer)
    if (table === 'game_combats') return buildCombatsMock(BASE_COMBAT)
    if (table === 'game_player_units') return buildUnitRowsMock()
    if (table === 'units') return buildUnitsMock(spaceCannonStat)
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
  getHeldNotes.mockResolvedValue([])
  returnNote.mockResolvedValue(undefined)
})

describe('game-fire-space-cannon Phase 39b — Strike Wing Ambuscade', () => {
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
