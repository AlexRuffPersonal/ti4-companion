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
import { handler } from '../../../supabase/functions/game-pass-action-window/index.ts'
import { USER_ID, GAME_ID, COMBAT_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-pass-action-window', body)

const GAME_CODE = 'TEST01'
const PLAYER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const PLAYER2_ID = 'player2-uuid'

function makeCombat(overrides = {}) {
  return {
    id: COMBAT_ID,
    game_id: GAME_ID,
    attacker_player_id: PLAYER_ID,
    defender_player_id: DEFENDER_ID,
    phase: 'window_pre_assign_defender',
    window_passes: { attacker: false, defender: false },
    pending_effects: {},
    sustained_this_phase: [],
    destroyed_this_phase: [],
    attacker_hits: 0,
    defender_hits: 0,
    ...overrides,
  }
}

let updateCombatMock, selectUpdatedMock

function mockDb({
  game = { id: GAME_ID },
  player = { id: PLAYER_ID },
  combat = makeCombat(),
  updatedPhase = null,
} = {}) {
  updateCombatMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
  selectUpdatedMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { phase: updatedPhase ?? combat?.phase },
        error: null,
      }),
    }),
  })

  let combatSelectCount = 0
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
        }),
      }),
    }
    if (table === 'game_combats') {
      combatSelectCount++
      const isFirstSelect = combatSelectCount === 1
      return {
        select: isFirstSelect
          ? vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
                }),
              }),
            })
          : selectUpdatedMock,
        update: updateCombatMock,
      }
    }
    return nullSafeChain()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-pass-action-window (Phase 20 — combat windows)', () => {
  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_code is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('routes to game-level path when combat_id is missing (no 400)', async () => {
    // combat_id missing → game-level window path, not a 400
    // This just verifies it does NOT return 400 (game-level path runs instead)
    const res = await handler(makeRequest({ game_code: GAME_CODE }))
    expect(res.status).not.toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when phase does not start with window_', async () => {
    mockDb({ combat: makeCombat({ phase: 'attacker_roll' }) })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not in an action window/i)
  })

  it('GIVEN attacker passes but defender has not — window_passes updated, phase unchanged', async () => {
    mockDb({ combat: makeCombat({ phase: 'window_pre_assign_defender', window_passes: { attacker: false, defender: false } }) })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    // Should update window_passes with attacker=true but not advance phase
    expect(updateCombatMock).toHaveBeenCalledWith(
      expect.objectContaining({ window_passes: { attacker: true, defender: false } })
    )
  })

  it('GIVEN attacker passes and defender already passed — phase advances to defender_assign', async () => {
    mockDb({
      combat: makeCombat({ phase: 'window_pre_assign_defender', window_passes: { attacker: false, defender: true } }),
      updatedPhase: 'defender_assign',
    })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    // advanceFromWindow should be called → update with phase='defender_assign'
    expect(updateCombatMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'defender_assign', window_passes: { attacker: false, defender: false } })
    )
  })

  it('GIVEN window_post_sustain with non-empty destroyed_this_phase — both pass → phase=window_post_destroy', async () => {
    mockDb({
      combat: makeCombat({
        phase: 'window_post_sustain',
        window_passes: { attacker: false, defender: true },
        destroyed_this_phase: [{ unit_id: 'u1' }],
        sustained_this_phase: [],
      }),
      updatedPhase: 'window_post_destroy',
    })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(updateCombatMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'window_post_destroy' })
    )
  })

  it('GIVEN window_post_sustain with empty destroyed_this_phase — both pass → phase=attacker_roll', async () => {
    mockDb({
      combat: makeCombat({
        phase: 'window_post_sustain',
        window_passes: { attacker: false, defender: true },
        destroyed_this_phase: [],
        sustained_this_phase: [],
      }),
      updatedPhase: 'attacker_roll',
    })
    const res = await handler(makeRequest({ game_code: GAME_CODE, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(updateCombatMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'attacker_roll' })
    )
  })
})

describe('game-pass-action-window (Phase 29b — game-level windows)', () => {
  let gameUpdateMock

  function makeWindowRequest(body) {
    return new Request('http://localhost/game-pass-action-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    })
  }

  function makeWindow(overrides = {}) {
    return {
      type: 'when_agenda_revealed',
      eligible_player_ids: [PLAYER_ID, PLAYER2_ID],
      passed_player_ids: [],
      context: {},
      ...overrides,
    }
  }

  function mockWindowDb({ player = { id: PLAYER_ID }, pendingWindow = makeWindow() } = {}) {
    gameUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
        }),
      }
      if (table === 'games') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { pending_action_window: pendingWindow },
              error: null,
            }),
          }),
        }),
        update: gameUpdateMock,
      }
      return {}
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindowDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 409 when no pending_action_window on game', async () => {
    mockWindowDb({ pendingWindow: null })
    const res = await handler(makeWindowRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no active window/i)
  })

  it('returns 409 when player not in eligible_player_ids', async () => {
    mockWindowDb({ player: { id: 'other-player' } })
    const res = await handler(makeWindowRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not eligible/i)
  })

  it('returns 409 when player already in passed_player_ids', async () => {
    mockWindowDb({ pendingWindow: makeWindow({ passed_player_ids: [PLAYER_ID] }) })
    const res = await handler(makeWindowRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already passed/i)
  })

  it('GIVEN first player passes — updates window with new passed list', async () => {
    mockWindowDb({ pendingWindow: makeWindow({ eligible_player_ids: [PLAYER_ID, PLAYER2_ID], passed_player_ids: [] }) })
    const res = await handler(makeWindowRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(gameUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ pending_action_window: expect.objectContaining({ passed_player_ids: [PLAYER_ID] }) })
    )
  })

  it('GIVEN last player passes — clears pending_action_window to null', async () => {
    mockWindowDb({ pendingWindow: makeWindow({ eligible_player_ids: [PLAYER_ID], passed_player_ids: [] }) })
    const res = await handler(makeWindowRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(gameUpdateMock).toHaveBeenCalledWith({ pending_action_window: null })
  })
})
