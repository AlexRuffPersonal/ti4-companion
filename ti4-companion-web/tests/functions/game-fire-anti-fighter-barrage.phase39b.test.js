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
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/techEffects.ts', () => ({
  resolveUnitStats: vi.fn().mockImplementation((_name, baseStats) => baseStats),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-fire-anti-fighter-barrage/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const ATTACKER_ID = 'player-1'
const DEFENDER_ID = 'player-2'
const COMBAT_ID = 'combat-1'
const NOTE_ID = 'note-instance-1'
const OWNER_ID = 'owner-player-1'

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

const ATK_UNITS = [
  { id: 'u1', player_id: ATTACKER_ID, unit_type: 'destroyer', count: 1, system_key: '1,-1' },
]
const DEF_UNITS = []
const UNIT_DEFS = [{ name: 'destroyer', afb: '9' }]
const DESTROYER_DEF_ROW = { name: 'destroyer', combat: 9, move: 2, capacity: 0, afb: '9', space_cannon: null, bombardment: null }

function mockDb({
  player = { id: PLAYER_ID },
  combat = BASE_COMBAT,
  atkUnits = ATK_UNITS,
  defUnits = DEF_UNITS,
  unitDefs = UNIT_DEFS,
  destroyerDefRow = DESTROYER_DEF_ROW,
  updateError = null,
} = {}) {
  let unitsCallCount = 0
  let gamePlayersCallCount = 0
  let unitsTableCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const thisCall = gamePlayersCallCount
      if (thisCall === 1) {
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { technologies: [] } }),
            }),
          }),
        }
      } else {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
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
              maybeSingle: vi.fn().mockResolvedValue({ data: destroyerDefRow }),
            }),
          }),
        }
      }
    }
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-fire-anti-fighter-barrage Phase 39b — Strike Wing Ambuscade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
    getHeldNotes.mockResolvedValue([])
    returnNote.mockResolvedValue(undefined)
  })

  it('Strike Wing Ambuscade held by caller, ambuscade_unit_type set → +1 die for that unit; note returned', async () => {
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Strike Wing Ambuscade') {
        return [{ instanceId: NOTE_ID, holderPlayerId: PLAYER_ID, ownerPlayerId: OWNER_ID }]
      }
      return []
    })

    // Base roll (1 destroyer): miss. Ambuscade extra die: miss.
    vi.spyOn(Math, 'random').mockReturnValue(0.0) // ceil(0.0 * 10) = 0 → but actually 0.0 → Math.ceil(0) = 0... use 0.1 → 1 (miss < 9)

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      combat_id: COMBAT_ID,
      selections: { ambuscade_unit_type: 'destroyer' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    // Base: 1 die (1 destroyer × 1 die). Ambuscade: +1 die. Total: 2 attacker dice.
    expect(body.barrage_attacker_dice).toHaveLength(2)
    expect(returnNote).toHaveBeenCalledWith(NOTE_ID, OWNER_ID, expect.anything())

    vi.restoreAllMocks()
  })

  it('Strike Wing Ambuscade not held → no extra die, note not returned', async () => {
    getHeldNotes.mockResolvedValue([])

    vi.spyOn(Math, 'random').mockReturnValue(0.1) // roll = 1, miss

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      combat_id: COMBAT_ID,
      selections: { ambuscade_unit_type: 'destroyer' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    // Only 1 base die, no ambuscade die
    expect(body.barrage_attacker_dice).toHaveLength(1)
    expect(returnNote).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
