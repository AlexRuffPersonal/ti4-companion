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
import { handler } from '../../../supabase/functions/game-unlock-commander/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ABILITY_ID = 'ability-uuid'
const PLAYER_ID = 'player-uuid'
const LEADER_ID = 'leader-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-unlock-commander', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, vp: 5, technologies: ['a', 'b', 'c'], leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' }, faction: 'Arborec' },
  ability = { id: ABILITY_ID, unlock_conditions: [{ check: 'scored_objectives', gte: 3 }] },
  source = { id: 'src-uuid', source_id: LEADER_ID },
  leader = { id: LEADER_ID, leader_type: 'commander' },
  scoredObjectives = [
    { scored_by: [PLAYER_ID] },
    { scored_by: [PLAYER_ID] },
    { scored_by: [PLAYER_ID] },
  ],
  playerUpdateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: playerUpdateError }) }),
      }
    }
    if (table === 'ability_definitions') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }) }) }) }
    }
    if (table === 'ability_sources') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: source, error: null }) }) }) }) }
    }
    if (table === 'leaders') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: leader, error: null }) }) }) }
    }
    if (table === 'game_public_objectives') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: scoredObjectives, error: null }) }) }
    }
    if (table === 'game_player_secret_objectives') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
    }
    return {}
  })
}

describe('game-unlock-commander', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when scored_objectives condition is not met', async () => {
    mockDb({ scoredObjectives: [{ scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 and sets commander to unlocked when conditions are met', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, vp: 5, technologies: ['a', 'b', 'c'], leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' }, faction: 'Arborec' }, error: null }) }) }) }),
          update: updateMock,
        }
      }
      if (table === 'ability_definitions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: ABILITY_ID, unlock_conditions: [{ check: 'scored_objectives', gte: 3 }] }, error: null }) }) }) }
      if (table === 'ability_sources') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { source_id: LEADER_ID }, error: null }) }) }) }) }
      if (table === 'leaders') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_ID, leader_type: 'commander' }, error: null }) }) }) }
      if (table === 'game_public_objectives') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }], error: null }) }) }
      if (table === 'game_player_secret_objectives') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
      return {}
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ leaders: { agent: 'unlocked', commander: 'unlocked', hero: 'locked' } })
  })
})
