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
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-use-relic-fragment/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-use-relic-fragment', body)

const FRAG_1 = 'frag-1'
const FRAG_2 = 'frag-2'
const FRAG_3 = 'frag-3'

const BASE_FRAGMENT_IDS = [FRAG_1, FRAG_2, FRAG_3]

const BASE_PLAYER = { id: PLAYER_ID }
const BASE_GAME = { active_player_id: PLAYER_ID }

const BASE_FRAGMENTS = [
  { id: FRAG_1, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
  { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
  { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
]

function mockDb({
  player = BASE_PLAYER,
  playerError = null,
  game = BASE_GAME,
  gameError = null,
  fragments = BASE_FRAGMENTS,
  fragmentsError = null,
  discardError = null,
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
    game_exploration_decks: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: fragments, error: fragmentsError }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: discardError }),
      }),
    }),
  })
}

describe('game-use-relic-fragment', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/i)
  })

  it('400 fragment_ids missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/fragment_ids/i)
  })

  it('400 fragment_ids not array', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: 'not-an-array' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/fragment_ids/i)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(404)
  })

  it('409 not active player', async () => {
    mockDb({ game: { active_player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not your turn/i)
  })

  it('409 must submit exactly 3 fragment IDs (2 given)', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: [FRAG_1, FRAG_2] }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/exactly 3/i)
  })

  it('409 fragment not owned by player', async () => {
    mockDb({
      fragments: [
        { id: FRAG_1, state: 'held', resolved_by_player_id: 'other-player', relic_fragment_type: 'cultural' },
        { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
        { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not owned by player/i)
  })

  it('409 fragment not in hand (state=discarded)', async () => {
    mockDb({
      fragments: [
        { id: FRAG_1, state: 'discarded', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
        { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
        { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not in hand/i)
  })

  it('409 need at least 1 typed fragment (all unknown)', async () => {
    mockDb({
      fragments: [
        { id: FRAG_1, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
        { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
        { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/at least 1 typed/i)
  })

  it('409 fragments must all match or be unknown (cultural + hazardous + unknown)', async () => {
    mockDb({
      fragments: [
        { id: FRAG_1, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'cultural' },
        { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'hazardous' },
        { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/must all match or be unknown/i)
  })

  it('200 accepts 3 cultural fragments, discards all 3, calls applyAbility with gain_relic', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relic_gained).toBe(true)
    expect(applyAbility).toHaveBeenCalledWith(
      [{ op: 'gain_relic' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID },
      expect.anything()
    )
  })

  it('200 accepts 2 hazardous + 1 unknown', async () => {
    mockDb({
      fragments: [
        { id: FRAG_1, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'hazardous' },
        { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'hazardous' },
        { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relic_gained).toBe(true)
    expect(applyAbility).toHaveBeenCalledWith(
      [{ op: 'gain_relic' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID },
      expect.anything()
    )
  })

  it('200 accepts 1 industrial + 2 unknown', async () => {
    mockDb({
      fragments: [
        { id: FRAG_1, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'industrial' },
        { id: FRAG_2, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
        { id: FRAG_3, state: 'held', resolved_by_player_id: PLAYER_ID, relic_fragment_type: 'unknown' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relic_gained).toBe(true)
    expect(applyAbility).toHaveBeenCalledWith(
      [{ op: 'gain_relic' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID },
      expect.anything()
    )
  })
})
