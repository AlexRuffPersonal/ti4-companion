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
  applyAbility: vi.fn().mockResolvedValue(undefined),
  dslError: vi.fn((msg, status = 409) => {
    const err = new Error(msg)
    err.status = status
    return err
  }),
}))

vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  RELIC_EFFECTS: {
    'Dominus Orb':        [{ op: 'dominus_orb_move' }],
    'Maw Of Worlds':      [{ op: 'exhaust_all_planets' }, { op: 'gain_technology', count: 1 }],
    'Stellar Converter':  [{ op: 'stellar_converter' }],
    'The Codex':          [{ op: 'take_from_discard', deck: 'action_card', count: 3 }],
    'Enigmatic Device':   [{ op: 'spend_resources', amount: 6 }, { op: 'gain_technology', count: 1 }],
    'Scepter Of Emelpar': [{ op: 'spend_from_reinforcements' }],
    "The Prophet's Tears":[{ op: 'choice', options: [[{ op: 'ignore_prerequisite' }], [{ op: 'draw_action_card', count: 1 }]] }],
    'Shard Of The Throne': [],
  },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-use-relic/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-use-relic', body)

const RELIC_ROW_ID = 'relic-row-1'
const RELIC_DEF_ID = 'relic-def-1'

const BASE_PLAYER = { id: PLAYER_ID }
const BASE_GAME = { phase: 'action', active_player_id: PLAYER_ID }
const BASE_RELIC_ROW = {
  id: RELIC_ROW_ID,
  game_id: GAME_ID,
  relic_id: RELIC_DEF_ID,
  held_by_player_id: PLAYER_ID,
  exhausted: false,
  state: 'active',
}
const BASE_RELIC_DEF = {
  id: RELIC_DEF_ID,
  name: 'Shard Of The Throne',
  purge_on_use: false,
  exhaustable: false,
  text: 'Gain 1 VP...',
}

function baseBody(overrides = {}) {
  return {
    game_id: GAME_ID,
    player_id: PLAYER_ID,
    relic_id: RELIC_ROW_ID,
    ...overrides,
  }
}

function mockDb({
  player = BASE_PLAYER,
  playerError = null,
  game = BASE_GAME,
  gameError = null,
  relicRow = BASE_RELIC_ROW,
  relicRowError = null,
  relicDef = BASE_RELIC_DEF,
  relicDefError = null,
  relicUpdateError = null,
  legendaryDeleteError = null,
} = {}) {
  buildDbMock(db, {
    game_players: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
          }),
        }),
      }),
    }),
    games: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
        }),
      }),
    }),
    game_relic_deck: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: relicRow, error: relicRowError }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: relicUpdateError }),
      }),
    }),
    relics: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: relicDef, error: relicDefError }),
        }),
      }),
    }),
    game_player_legendary_cards: () => ({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: legendaryDeleteError }),
        }),
      }),
    }),
  })
}

describe('game-use-relic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
    applyAbility.mockResolvedValue(undefined)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest(baseBody({ game_id: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/i)
  })

  it('400 missing player_id', async () => {
    const res = await handler(makeRequest(baseBody({ player_id: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/player_id/i)
  })

  it('400 missing relic_id', async () => {
    const res = await handler(makeRequest(baseBody({ relic_id: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/relic_id/i)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Player not found/i)
  })

  it('404 relic not found', async () => {
    mockDb({ relicRow: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Relic not found/i)
  })

  it('409 Relic not owned by player', async () => {
    mockDb({ relicRow: { ...BASE_RELIC_ROW, held_by_player_id: 'other-player' } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Relic not owned by player/i)
  })

  it('409 Relic already exhausted', async () => {
    mockDb({ relicRow: { ...BASE_RELIC_ROW, exhausted: true } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Relic already exhausted/i)
  })

  it('409 Relic already purged', async () => {
    mockDb({ relicRow: { ...BASE_RELIC_ROW, state: 'purged' } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Relic already purged/i)
  })

  it('409 not active player for action relic (The Codex)', async () => {
    mockDb({
      game: { phase: 'action', active_player_id: 'other-player' },
      relicDef: { ...BASE_RELIC_DEF, name: 'The Codex' },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Not your turn/i)
  })

  it('purges after use for purge_on_use relics (Dominus Orb)', async () => {
    mockDb({
      relicDef: { ...BASE_RELIC_DEF, name: 'Dominus Orb', purge_on_use: true, exhaustable: false },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Dominus Orb')
    const relicDeckCalls = db.from.mock.calls
      .map((c, i) => ({ table: c[0], i }))
      .filter(({ table }) => table === 'game_relic_deck')
    const updateIdx = relicDeckCalls[relicDeckCalls.length - 1].i
    const updateMock = db.from.mock.results[updateIdx].value
    expect(updateMock.update).toHaveBeenCalledWith({ state: 'purged' })
  })

  it('exhausts after use for exhaustable relics (Scepter Of Emelpar)', async () => {
    mockDb({
      relicDef: { ...BASE_RELIC_DEF, name: 'Scepter Of Emelpar', purge_on_use: false, exhaustable: true },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Scepter Of Emelpar')
    const relicDeckCalls = db.from.mock.calls
      .map((c, i) => ({ table: c[0], i }))
      .filter(({ table }) => table === 'game_relic_deck')
    const updateIdx = relicDeckCalls[relicDeckCalls.length - 1].i
    const updateMock = db.from.mock.results[updateIdx].value
    expect(updateMock.update).toHaveBeenCalledWith({ exhausted: true })
  })

  it("applies choice branch for Prophet's Tears with choice=0", async () => {
    mockDb({
      relicDef: { ...BASE_RELIC_DEF, name: "The Prophet's Tears", purge_on_use: false, exhaustable: true },
    })
    const res = await handler(makeRequest(baseBody({ choice: 0 })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const [ops, context] = applyAbility.mock.calls[0]
    expect(ops[0].op).toBe('choice')
    expect(context.chosenOption).toBe(0)
  })

  it('applies gain_technology for Enigmatic Device with resource spend', async () => {
    mockDb({
      relicDef: { ...BASE_RELIC_DEF, name: 'Enigmatic Device', purge_on_use: true, exhaustable: false },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const [ops] = applyAbility.mock.calls[0]
    expect(ops.some((op) => op.op === 'spend_resources')).toBe(true)
    expect(ops.some((op) => op.op === 'gain_technology')).toBe(true)
  })

  it('allows reactive relic use without active player gate (Scepter Of Emelpar)', async () => {
    mockDb({
      game: { phase: 'action', active_player_id: 'other-player' },
      relicDef: { ...BASE_RELIC_DEF, name: 'Scepter Of Emelpar', purge_on_use: false, exhaustable: true },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Scepter Of Emelpar')
  })

  it('deletes legendary card for Stellar Converter with planet_name', async () => {
    mockDb({
      relicDef: { ...BASE_RELIC_DEF, name: 'Stellar Converter', purge_on_use: true, exhaustable: false },
    })
    const res = await handler(makeRequest(baseBody({ planet_name: 'Mecatol Rex' })))
    expect(res.status).toBe(200)
    const legendaryCall = db.from.mock.calls.find((c) => c[0] === 'game_player_legendary_cards')
    expect(legendaryCall).toBeTruthy()
    const legendaryIdx = db.from.mock.calls.indexOf(legendaryCall)
    const legendaryMock = db.from.mock.results[legendaryIdx].value
    expect(legendaryMock.delete).toHaveBeenCalled()
  })

  it('no-op for Stellar Converter without planet_name', async () => {
    mockDb({
      relicDef: { ...BASE_RELIC_DEF, name: 'Stellar Converter', purge_on_use: true, exhaustable: false },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const legendaryCall = db.from.mock.calls.find((c) => c[0] === 'game_player_legendary_cards')
    expect(legendaryCall).toBeUndefined()
  })

  it('200 success with correct applied name for Shard Of The Throne', async () => {
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Shard Of The Throne')
    expect(applyAbility).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID }),
      expect.anything()
    )
  })
})
