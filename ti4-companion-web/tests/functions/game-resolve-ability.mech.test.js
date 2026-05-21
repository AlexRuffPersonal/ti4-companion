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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_RESOLVE_ABILITY: 'resolve_ability',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const UNIT_ID = 'unit-uuid'
const FACTION = 'The Federation of Sol'
const MECH_EFFECTS = [{ op: 'gain_trade_goods', amount: 1 }]

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const MECH_BODY = {
  game_id: GAME_ID,
  source_type: 'mech',
  source_id: UNIT_ID,
  selections: {},
}

function mockMechDb({
  player = { id: PLAYER_ID, action_card_count: 0, faction: FACTION },
  unit = { id: UNIT_ID, unit_type: 'mech', faction: FACTION, effects: MECH_EFFECTS },
} = {}) {
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
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: unit, error: null }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-resolve-ability — mech source_type', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    mockMechDb()
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when source_id is missing for mech source', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_id/i)
  })

  it('returns 404 when unit not found', async () => {
    mockMechDb({ unit: null })
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 409 when unit is not a mech', async () => {
    mockMechDb({ unit: { id: UNIT_ID, unit_type: 'infantry', faction: FACTION, effects: [] } })
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not a mech/i)
  })

  it('returns 409 when faction mismatch', async () => {
    mockMechDb({ unit: { id: UNIT_ID, unit_type: 'mech', faction: 'Mentak Coalition', effects: [] } })
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction mismatch/i)
  })

  it('returns 200 and calls interpretEffects with mech effects array', async () => {
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledWith(MECH_EFFECTS, expect.objectContaining({ gameId: GAME_ID }), expect.anything())
    const body = await res.json()
    expect(body.resolved).toBe(true)
  })

  it('propagates 409 when interpretEffects throws a DSL error', async () => {
    const dslError = new Error('Not enough resources')
    dslError.status = 409
    interpretEffects.mockRejectedValueOnce(dslError)
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not enough resources/i)
  })

  it('does not require ability_definition_id for mech source_type', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech', source_id: UNIT_ID }))
    expect(res.status).toBe(200)
  })
})
