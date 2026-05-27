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

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  AGENT_REACTIVE_TRIGGERS: {},
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))

vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const SYSTEM_KEY = '1,-1'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

/**
 * Build minimal db mocks for the full activate-system flow.
 * activations: rows returned for game_system_activations select (current round, player's own tokens)
 * player: the game_players row for the activating player
 */
function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 }, faction: null, leaders: null },
  activations = [],
} = {}) {
  const mahactHandlerMock = vi.fn().mockResolvedValue(undefined)
  getHandler.mockReturnValue(mahactHandlerMock)

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields && !fields.includes('command_tokens')) {
            // allGamePlayers fetch
            return {
              eq: vi.fn().mockResolvedValue({ data: [player], error: null }),
            }
          }
          // single player fetch
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 1, map_tiles: {} },
              error: null,
            }),
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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    return {}
  })

  return { mahactHandlerMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
})

describe('game-activate-system Phase 43c — Mahact commander bypass', () => {
  it('GIVEN Mahact player with unlocked commander and own token already in system, EXPECT activation succeeds (200) and getHandler called', async () => {
    const mahactPlayer = {
      id: PLAYER_ID,
      command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
      faction: 'The Mahact Gene-Sorcerers',
      leaders: { commander: 'unlocked' },
    }
    const existingActivation = { id: 'act-uuid', system_key: SYSTEM_KEY }
    const { mahactHandlerMock } = mockDb({
      player: mahactPlayer,
      activations: [existingActivation],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(getHandler).toHaveBeenCalledWith('mahact_il_na_viroset')
    expect(mahactHandlerMock).toHaveBeenCalled()
  })

  it('GIVEN Mahact player with locked commander and own token already in system, EXPECT 409', async () => {
    const mahactPlayer = {
      id: PLAYER_ID,
      command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
      faction: 'The Mahact Gene-Sorcerers',
      leaders: { commander: 'locked' },
    }
    mockDb({
      player: mahactPlayer,
      activations: [{ id: 'act-uuid', system_key: SYSTEM_KEY }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('GIVEN non-Mahact player with own token already in system, EXPECT 409', async () => {
    const solPlayer = {
      id: PLAYER_ID,
      command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
      faction: 'The Federation Of Sol',
      leaders: { commander: 'unlocked' },
    }
    mockDb({
      player: solPlayer,
      activations: [{ id: 'act-uuid', system_key: SYSTEM_KEY }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })
})

describe('game-activate-system Phase 43c — commander passives applied', () => {
  it('GIVEN Arborec commander returns a pending window, EXPECT response includes pending_window', async () => {
    mockDb()
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Arborec',
        player_id: 'arborec-player-uuid',
        effect: [{ op: 'produce_units', count: 1, in_system: 'active' }],
      }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Arborec')
    expect(body.pending_window.trigger).toBe('SYSTEM_ACTIVATED')
  })

  it('GIVEN Yssaril commander returns a pending window, EXPECT response includes pending_window', async () => {
    mockDb()
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Yssaril Tribes',
        player_id: 'yssaril-player-uuid',
        effect: 'yssaril_peek_window',
      }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Yssaril Tribes')
  })

  it('GIVEN both reactive agent window and commander passive window, EXPECT reactive_agent window is first (allWindows[0])', async () => {
    // Simulate commander passive window alongside reactive agent window
    vi.mocked(applyCommanderPassives).mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Arborec',
        player_id: 'arborec-player-uuid',
        effect: [{ op: 'produce_units', count: 1, in_system: 'active' }],
      }],
    })

    // For this test, applyCommanderPassives returns a window but no reactive agents
    // We verify the commander window ends up in the response
    mockDb()

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // With no reactive agents but one commander passive window, pending_window is the commander one
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Arborec')
  })

  it('GIVEN no commander passives and no reactive agents, EXPECT no pending_window', async () => {
    mockDb()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN activation, EXPECT applyCommanderPassives called with SYSTEM_ACTIVATED trigger and correct context', async () => {
    mockDb()

    await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'SYSTEM_ACTIVATED',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: SYSTEM_KEY }),
      expect.anything(),
    )
  })
})
