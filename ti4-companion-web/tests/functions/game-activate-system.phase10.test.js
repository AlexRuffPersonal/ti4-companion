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
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  game = { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: { '1,-1': { tile_id: 'tile-a' } } },
  activations = [],
  enemyUnits = [{ player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, system_key: '1,-1' }],
  scUnitDefs = [],
  tiles = [{ id: 'tile-a', wormhole: null }],
  combatInsertId = COMBAT_ID,
} = {}) {
  const activationInsertMock = vi.fn().mockResolvedValue({ error: null })
  const combatInsertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: combatInsertId }], error: null }),
  })

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
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations, error: null }),
            }),
          }),
        }),
        insert: activationInsertMock,
      }
    }
    if (table === 'game_player_units') {
      // Single broad fetch: .eq('game_id').is('on_planet', null)
      // enemyUnits is filtered client-side by system_key and player_id
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: scUnitDefs, error: null }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        insert: combatInsertMock,
      }
    }
  })
  return { activationInsertMock, combatInsertMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-activate-system — combat creation (Phase 10)', () => {
  it('returns combat_id when enemy ships are present in activated system', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.combat_id).toBe(COMBAT_ID)
  })

  it('returns combat_id: null when no enemy ships in system', async () => {
    mockDb({ enemyUnits: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.combat_id).toBeNull()
  })

  it('inserts combat row when enemy ships found', async () => {
    const { combatInsertMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(combatInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id: GAME_ID,
        system_key: '1,-1',
        attacker_player_id: PLAYER_ID,
        defender_player_id: DEFENDER_ID,
      })
    )
  })

  it('sets phase to window_pre_space_cannon when no space cannon units present', async () => {
    const { combatInsertMock } = mockDb({ scUnitDefs: [] })
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.phase).toBe('window_pre_space_cannon')
    expect(insertArg.space_cannon_pending).toEqual([])
  })

  it('sets phase to window_pre_space_cannon and populates pending when sc units exist', async () => {
    const { combatInsertMock } = mockDb({
      scUnitDefs: [{ name: 'pds', space_cannon: '5(x3)' }],
      enemyUnits: [
        { player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, system_key: '1,-1' },
        { player_id: PLAYER_ID, unit_type: 'pds', count: 1, system_key: '1,-1' },
      ],
    })
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.phase).toBe('window_pre_space_cannon')
    expect(insertArg.space_cannon_pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ player_id: PLAYER_ID, unit_type: 'pds', dice_count: 3, resolved: false }),
      ])
    )
  })

  it('GIVEN ships moved from another system EXPECT ships_moved_in=true and phase=window_pre_space_cannon', async () => {
    const { combatInsertMock } = mockDb()
    await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [
        { origin_system_key: '0,0' },   // different system → ships_moved_in=true
        { origin_system_key: '1,-1' },  // same system (e.g. planet to space)
      ],
    }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.ships_moved_in).toBe(true)
    expect(insertArg.phase).toBe('window_pre_space_cannon')
  })

  it('GIVEN no movement with different origin EXPECT ships_moved_in=false', async () => {
    const { combatInsertMock } = mockDb()
    await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [
        { origin_system_key: '1,-1' },  // same system only
      ],
    }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.ships_moved_in).toBe(false)
  })

  it('GIVEN empty movement_payload EXPECT ships_moved_in=false', async () => {
    const { combatInsertMock } = mockDb()
    await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [],
    }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.ships_moved_in).toBe(false)
  })
})
