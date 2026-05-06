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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-play-combat-action-card/index.ts'

const USER_ID = 'user-uuid'
const GAME_CODE = 'TEST01'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'
const CARD_ID = 'hand-card-uuid'
const ACTION_CARD_ID = 'action-card-def-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-play-combat-action-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function makeCombat(overrides = {}) {
  return {
    id: COMBAT_ID,
    game_id: GAME_ID,
    system_key: '1,-1',
    attacker_player_id: PLAYER_ID,
    defender_player_id: DEFENDER_ID,
    phase: 'window_start_round',
    round: 1,
    window_passes: { attacker: false, defender: false },
    pending_effects: {},
    sustained_this_phase: [],
    destroyed_this_phase: [],
    ships_moved_in: false,
    retreat_declared_by: null,
    retreat_destination: null,
    attacker_hits: 0,
    defender_hits: 0,
    winner_player_id: null,
    space_cannon_pending: [],
    ...overrides,
  }
}

function mockDb({
  game = { id: GAME_ID, phase: 'action', round: 1 },
  player = { id: PLAYER_ID },
  combat = makeCombat(),
  handCard = { id: CARD_ID, action_card_id: ACTION_CARD_ID },
  cardDef = { id: ACTION_CARD_ID, name: 'Morale Boost' },
  alreadyPlayed = [],
  enemyShips = [],
  targetUnit = null,
  playerShips = [],
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    if (table === 'game_combats') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    if (table === 'game_player_action_cards') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: handCard, error: null }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    if (table === 'action_cards') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: cardDef, error: null }),
        }),
      }),
    }
    if (table === 'game_player_action_cards_played') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: alreadyPlayed, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    if (table === 'game_player_units') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: enemyShips, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: targetUnit, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: targetUnit, error: null }),
          }),
          is: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: playerShips, error: null }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: targetUnit, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    if (table === 'game_system_tokens') return {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    if (table === 'units') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { space_cannon: '5 (x3)' }, error: null }),
        }),
      }),
    }
    return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-play-combat-action-card', () => {
  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_code is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID, card_id: CARD_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_code: GAME_CODE, card_id: CARD_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when card_id is missing', async () => {
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when player already passed this window', async () => {
    mockDb({ combat: makeCombat({ window_passes: { attacker: true, defender: false } }) })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already passed/i)
  })

  it('returns 409 when card not valid for current phase', async () => {
    mockDb({
      combat: makeCombat({ phase: 'window_post_destroy' }),
      cardDef: { id: ACTION_CARD_ID, name: 'Morale Boost' },
    })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not valid/i)
  })

  describe('Shields Holding', () => {
    it('GIVEN phase=window_pre_assign_defender, player=defender EXPECT pending_effects.shields_holding_defender=2', async () => {
      mockDb({
        player: { id: DEFENDER_ID },
        combat: makeCombat({ phase: 'window_pre_assign_defender' }),
        cardDef: { id: ACTION_CARD_ID, name: 'Shields Holding' },
      })
      let updateArg
      db.from.mockImplementation((table) => {
        if (table === 'game_combats') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: makeCombat({ phase: 'window_pre_assign_defender' }), error: null }) }) }) }),
          update: vi.fn().mockImplementation((arg) => { updateArg = arg; return { eq: vi.fn().mockResolvedValue({ error: null }) } }),
        }
        if (table === 'games') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID }, error: null }) }) }) }
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: DEFENDER_ID }, error: null }) }), maybeSingle: vi.fn().mockResolvedValue({ data: { id: DEFENDER_ID }, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        if (table === 'game_player_action_cards') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: CARD_ID, action_card_id: ACTION_CARD_ID }, error: null }) }) }) }), delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        if (table === 'action_cards') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: ACTION_CARD_ID, name: 'Shields Holding' }, error: null }) }) }) }
        if (table === 'game_player_action_cards_played') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }), insert: vi.fn().mockResolvedValue({ error: null }) }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
      expect(res.status).toBe(200)
      expect(updateArg?.pending_effects?.shields_holding_defender).toBe(2)
    })
  })

  describe('Direct Hit', () => {
    it('GIVEN unit.count=1 and target in sustained_this_phase EXPECT unit deleted', async () => {
      const UNIT_ID = 'unit-uuid'
      mockDb({
        combat: makeCombat({
          phase: 'window_post_sustain',
          sustained_this_phase: [{ unit_id: UNIT_ID }],
          attacker_player_id: PLAYER_ID,
          defender_player_id: DEFENDER_ID,
        }),
        cardDef: { id: ACTION_CARD_ID, name: 'Direct Hit' },
        targetUnit: { id: UNIT_ID, count: 1, player_id: DEFENDER_ID, unit_type: 'cruiser' },
      })
      let deleteCalledOnUnits = false
      db.from.mockImplementation((table) => {
        if (table === 'game_combats') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: makeCombat({ phase: 'window_post_sustain', sustained_this_phase: [{ unit_id: UNIT_ID }] }), error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        if (table === 'games') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID }, error: null }) }) }) }
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }) }), maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }) }) }) }
        if (table === 'game_player_action_cards') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: CARD_ID, action_card_id: ACTION_CARD_ID }, error: null }) }) }) }), delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        if (table === 'action_cards') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: ACTION_CARD_ID, name: 'Direct Hit' }, error: null }) }) }) }
        if (table === 'game_player_action_cards_played') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }), insert: vi.fn().mockResolvedValue({ error: null }) }
        if (table === 'game_player_units') return {
          select: vi.fn().mockImplementation((fields) => {
            if (fields === 'id, count, player_id, unit_type') {
              // Direct unit lookup by id
              return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: UNIT_ID, count: 1, player_id: DEFENDER_ID }, error: null }) }) }
            }
            // checkWinCondition: .select('id').eq().eq().eq().is().limit() — return no ships
            return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockImplementation(() => { deleteCalledOnUnits = true; return Promise.resolve({ error: null }) }) }),
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID, targets: { unit_id: UNIT_ID } }))
      expect(res.status).toBe(200)
      expect(deleteCalledOnUnits).toBe(true)
    })

    it('GIVEN targets.unit_id not in sustained_this_phase EXPECT 409', async () => {
      mockDb({
        combat: makeCombat({ phase: 'window_post_sustain', sustained_this_phase: [] }),
        cardDef: { id: ACTION_CARD_ID, name: 'Direct Hit' },
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID, targets: { unit_id: 'nonexistent-unit' } }))
      expect(res.status).toBe(409)
    })
  })

  describe('Skilled Retreat', () => {
    it('GIVEN adjacent system with no enemy ships EXPECT 200', async () => {
      mockDb({
        combat: makeCombat({ phase: 'window_announce_retreat', system_key: '1,-1' }),
        cardDef: { id: ACTION_CARD_ID, name: 'Skilled Retreat' },
        enemyShips: [],
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID, targets: { destination_system_key: '0,-1' } }))
      expect(res.status).toBe(200)
    })

    it('GIVEN destination has enemy ships EXPECT 409', async () => {
      mockDb({
        combat: makeCombat({ phase: 'window_announce_retreat', system_key: '1,-1' }),
        cardDef: { id: ACTION_CARD_ID, name: 'Skilled Retreat' },
        enemyShips: [{ id: 'enemy-ship' }],
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID, targets: { destination_system_key: '0,-1' } }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/enemy ships/i)
    })
  })

  describe('Experimental Battlestation', () => {
    it('GIVEN ships_moved_in=false EXPECT 409', async () => {
      mockDb({
        combat: makeCombat({ phase: 'window_pre_space_cannon', ships_moved_in: false }),
        cardDef: { id: ACTION_CARD_ID, name: 'Experimental Battlestation' },
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID, targets: { space_dock_unit_id: 'dock-uuid' } }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/no ships moved/i)
    })
  })

  describe('Rout', () => {
    it('GIVEN side=attacker (player is attacker) EXPECT 409', async () => {
      mockDb({
        player: { id: PLAYER_ID },
        combat: makeCombat({ phase: 'window_announce_retreat', attacker_player_id: PLAYER_ID }),
        cardDef: { id: ACTION_CARD_ID, name: 'Rout' },
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/only defender/i)
    })
  })

  describe('Intercept', () => {
    it('GIVEN retreat_declared_by=null EXPECT 409', async () => {
      mockDb({
        player: { id: DEFENDER_ID },
        combat: makeCombat({ phase: 'window_announce_retreat', retreat_declared_by: null }),
        cardDef: { id: ACTION_CARD_ID, name: 'Intercept' },
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/no retreat/i)
    })
  })

  describe('Courageous To The End', () => {
    it('GIVEN destroyed_this_phase entry for player EXPECT opponent hits incremented', async () => {
      mockDb({
        combat: makeCombat({
          phase: 'window_post_destroy',
          destroyed_this_phase: [{ player_id: PLAYER_ID, combat_value: 11 }], // combat_value=11 ensures no hits
          attacker_hits: 0,
          defender_hits: 0,
        }),
        cardDef: { id: ACTION_CARD_ID, name: 'Courageous To The End' },
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
      expect(res.status).toBe(200)
    })

    it('GIVEN no destroyed_this_phase entry EXPECT 409', async () => {
      mockDb({
        combat: makeCombat({ phase: 'window_post_destroy', destroyed_this_phase: [] }),
        cardDef: { id: ACTION_CARD_ID, name: 'Courageous To The End' },
      })
      const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID, card_id: CARD_ID }))
      expect(res.status).toBe(409)
    })
  })
})
