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
  AGENT_REACTIVE_TRIGGERS: {},  // no reactive triggers in these tests
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
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

/**
 * Build a db mock that supports the activate-system flow for phase 43c tests.
 *
 * Options:
 *   playerData: overrides the player row returned from the single-player fetch
 *   activations: array of activation rows for the round (default: [])
 *   otherPlayers: array of other game players (default: [])
 */
function mockDb({ playerData = {}, activations = [], otherPlayers = [] } = {}) {
  const defaultPlayer = {
    id: PLAYER_ID,
    faction: 'The Federation Of Sol',
    command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
    technologies: [],
    exhausted_technologies: [],
    trade_goods: 0,
    promissory_notes: [],
    leaders: {},
  }
  const mergedPlayer = { ...defaultPlayer, ...playerData }

  const insertActivationMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
  })
  const updateActivationMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          // allGamePlayers fetch: no command_tokens in select
          if (fields && !fields.includes('command_tokens')) {
            return {
              eq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }),
            }
          }
          // Single player fetch with command_tokens
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: mergedPlayer,
                  error: null,
                }),
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
        insert: insertActivationMock,
        update: updateActivationMock,
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
    if (table === 'leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('Mahact commander — activate own-token system (Phase 43c)', () => {
  it('GIVEN Mahact player with unlocked commander and system already activated, EXPECT activation succeeds (no 409)', async () => {
    mockDb({
      playerData: {
        faction: 'The Mahact Gene-Sorcerers',
        leaders: { commander: 'unlocked' },
      },
      activations: [{ id: 'existing-activation-uuid', system_key: '1,-1' }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
  })

  it('GIVEN Mahact player with unlocked commander and system already activated, EXPECT mahact_il_na_viroset handler called', async () => {
    const mockHandlerFn = vi.fn().mockResolvedValue(undefined)
    getHandler.mockReturnValue(mockHandlerFn)

    mockDb({
      playerData: {
        faction: 'The Mahact Gene-Sorcerers',
        leaders: { commander: 'unlocked' },
      },
      activations: [{ id: 'existing-activation-uuid', system_key: '1,-1' }],
    })

    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))

    expect(getHandler).toHaveBeenCalledWith('mahact_il_na_viroset')
    expect(mockHandlerFn).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: '1,-1' }),
      expect.anything(),
    )
  })

  it('GIVEN Mahact player with locked commander and system already activated, EXPECT 409', async () => {
    mockDb({
      playerData: {
        faction: 'The Mahact Gene-Sorcerers',
        leaders: { commander: 'locked' },
      },
      activations: [{ id: 'existing-activation-uuid', system_key: '1,-1' }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('GIVEN non-Mahact player and system already activated, EXPECT 409', async () => {
    mockDb({
      playerData: {
        faction: 'The Federation Of Sol',
        leaders: { commander: 'unlocked' },
      },
      activations: [{ id: 'existing-activation-uuid', system_key: '1,-1' }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
  })

  it('GIVEN Mahact with unlocked commander activating a DIFFERENT system (no prior activation), EXPECT success without calling mahact handler', async () => {
    mockDb({
      playerData: {
        faction: 'The Mahact Gene-Sorcerers',
        leaders: { commander: 'unlocked' },
      },
      activations: [],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '2,0' }))
    expect(res.status).toBe(200)
    expect(getHandler).not.toHaveBeenCalledWith('mahact_il_na_viroset')
  })
})

describe('applyCommanderPassives called on SYSTEM_ACTIVATED (Phase 43c)', () => {
  it('GIVEN normal activation, EXPECT applyCommanderPassives called with SYSTEM_ACTIVATED trigger', async () => {
    mockDb({ playerData: { faction: 'The Federation Of Sol', leaders: {} } })

    await handler(makeRequest({ game_id: GAME_ID, system_key: '3,1' }))

    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'SYSTEM_ACTIVATED',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: '3,1' }),
      expect.anything(),
    )
  })

  it('GIVEN Arborec player has unlocked commander, EXPECT pending_window with type=commander_passive in response', async () => {
    const ARBOREC_PLAYER_ID = 'arborec-player-uuid'
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Arborec',
        player_id: ARBOREC_PLAYER_ID,
        effect: [{ op: 'produce_units', count: 1, in_system: 'active' }],
        condition: 'system contains Arborec production unit',
      }],
    })

    mockDb({ playerData: { faction: 'The Federation Of Sol', leaders: {} } })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '2,0' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_passive')
    expect(body.pending_window.faction).toBe('The Arborec')
    expect(body.pending_window.player_id).toBe(ARBOREC_PLAYER_ID)
  })

  it('GIVEN Yssaril player has unlocked commander, EXPECT pending_window with Yssaril peek effect', async () => {
    const YSSARIL_PLAYER_ID = 'yssaril-player-uuid'
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Yssaril Tribes',
        player_id: YSSARIL_PLAYER_ID,
        effect: 'yssaril_peek_window',
        condition: 'activated system contains your units',
      }],
    })

    mockDb({ playerData: { faction: 'The Federation Of Sol', leaders: {} } })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,0' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_passive')
    expect(body.pending_window.faction).toBe('The Yssaril Tribes')
    expect(body.pending_window.effect).toBe('yssaril_peek_window')
  })

  it('GIVEN no commander passives apply, EXPECT no pending_window when no reactive agents either', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    mockDb({ playerData: { faction: 'The Federation Of Sol', leaders: {} } })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '0,1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })
})
