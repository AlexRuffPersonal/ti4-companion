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
import { handler } from '../../../supabase/functions/game-fire-space-cannon/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const COMBAT_ID = 'combat-uuid'
const ATTACKER_ID = PLAYER_ID
const DEFENDER_ID = 'defender-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-fire-space-cannon', {
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

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-fire-space-cannon', () => {
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
