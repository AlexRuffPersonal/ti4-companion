import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const SPEAKER_ID = 'speaker-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const READY_PLAYERS = [
  { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
  { id: 'p2', faction: 'Letnev', colour: 'red', display_name: 'Bob' },
]

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID, expansions: { base: true } },
  gameError = null,
  players = READY_PLAYERS,
  playersError = null,
  updateError = null,
  objectives = [{ id: 'obj-1', expansion: 'base' }, { id: 'obj-2', expansion: 'base' }],
  insertObjError = null,
  actionCards = [{ id: 'ac-1', quantity: 2, expansion: 'base' }, { id: 'ac-2', quantity: 1, expansion: 'base' }],
  insertActionError = null,
  agendas = [{ id: 'ag-1', expansion: 'base' }, { id: 'ag-2', expansion: 'base' }],
  insertAgendasError = null,
  factionData = { home_tile_number: '5', starting_techs: ['Neural Motivator'] },
  factionError = null,
  tileData = { planets: [{ name: 'Nestphar', tech_specialty: null }] },
  tileError = null,
  planetInsertError = null,
  techUpdateError = null,
  secretObjectives = [
    { id: 'so-1', expansion: 'base' },
    { id: 'so-2', expansion: 'base' },
    { id: 'so-3', expansion: 'base' },
    { id: 'so-4', expansion: 'base' },
  ],
  insertSecretsError = null,
} = {}) {
  const actionCardInsertMock = vi.fn().mockResolvedValue({ error: insertActionError })
  const agendaInsertMock = vi.fn().mockResolvedValue({ error: insertAgendasError })
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: techUpdateError }),
        }),
      }
    }
    if (table === 'public_objectives') {
      return {
        select: vi.fn().mockResolvedValue({ data: objectives, error: null }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertObjError }),
      }
    }
    if (table === 'action_cards') {
      return {
        select: vi.fn().mockResolvedValue({ data: actionCards, error: null }),
      }
    }
    if (table === 'game_action_card_deck') {
      return { insert: actionCardInsertMock }
    }
    if (table === 'factions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: factionData, error: factionError }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tileData, error: tileError }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        insert: vi.fn().mockResolvedValue({ error: planetInsertError }),
      }
    }
    if (table === 'secret_objectives') {
      return {
        select: vi.fn().mockResolvedValue({ data: secretObjectives, error: null }),
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertSecretsError }),
      }
    }
    if (table === 'agendas') {
      return {
        select: vi.fn().mockResolvedValue({ data: agendas, error: null }),
      }
    }
    if (table === 'game_agenda_deck') {
      return { insert: agendaInsertMock }
    }
  })
  return { actionCardInsertMock, agendaInsertMock }
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-start/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-start', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when speaker is not set', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/speaker must be set/i)
  })

  it('returns 409 when a player has not picked faction or colour', async () => {
    mockDb({
      players: [
        { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
        { id: 'p2', faction: null, colour: null, display_name: 'Bob' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Bob/i)
  })

  it('returns 409 when there are no players in the game', async () => {
    mockDb({ players: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no players/i)
  })

  it('returns 200 and sets status to active when all conditions are met', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(true)
  })

  it('returns 500 when db update fails', async () => {
    mockDb({ updateError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
  })

  it('inserts action cards into game_action_card_deck with correct copy counts', async () => {
    const { actionCardInsertMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    // ac-1 has quantity 2 → 2 copies; ac-2 has quantity 1 → 1 copy = 3 total
    expect(actionCardInsertMock).toHaveBeenCalledOnce()
    const inserted = actionCardInsertMock.mock.calls[0][0]
    expect(inserted).toHaveLength(3)
    expect(inserted.filter(r => r.action_card_id === 'ac-1')).toHaveLength(2)
    expect(inserted.filter(r => r.action_card_id === 'ac-2')).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ game_id: GAME_ID, state: 'deck' })
    const ac1Copies = inserted.filter(r => r.action_card_id === 'ac-1').map(r => r.copy_index).sort()
    expect(ac1Copies).toEqual([0, 1])
  })

  it('returns 500 when action card insert fails', async () => {
    mockDb({ insertActionError: { message: 'insert failed' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
  })

  it('sets starting technologies from faction data', async () => {
    mockDb({ factionData: { home_tile_number: null, starting_techs: ['Neural Motivator', 'Sarween Tools'] } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })

  it('returns 200 when faction has no home tile number', async () => {
    mockDb({ factionData: { home_tile_number: null, starting_techs: [] } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })

  it('returns 200 when home tile has no planets', async () => {
    mockDb({ tileData: { planets: [] } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })

  it('returns 500 when planet insert fails', async () => {
    mockDb({ planetInsertError: { message: 'insert failed' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/Failed to insert planets/)
  })

  it('returns 409 when faction data is not found', async () => {
    mockDb({ factionData: null })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Faction not found/)
  })

  it('deals exactly 2 secret objectives per player', async () => {
    const secretInsertMock = vi.fn().mockResolvedValue({ error: null })
    mockDb()
    // Override just the secret objectives insert
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_player_secret_objectives') return { insert: secretInsertMock }
      return originalImpl(table)
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(secretInsertMock).toHaveBeenCalledOnce()
    const inserted = secretInsertMock.mock.calls[0][0]
    // 2 players × 2 secrets each = 4 rows
    expect(inserted).toHaveLength(4)
    expect(inserted.filter(r => r.player_id === 'p1')).toHaveLength(2)
    expect(inserted.filter(r => r.player_id === 'p2')).toHaveLength(2)
    inserted.forEach(r => expect(r.state).toBe('held'))
  })

  it('returns 409 when secret objective deck is too small for all players', async () => {
    // 2 players × 2 = 4 needed; only 3 in deck
    mockDb({ secretObjectives: [
      { id: 'so-1', expansion: 'base' },
      { id: 'so-2', expansion: 'base' },
      { id: 'so-3', expansion: 'base' },
    ]})
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not enough secret objectives/i)
  })

  it('filters secret objectives by active expansions', async () => {
    const secretInsertMock = vi.fn().mockResolvedValue({ error: null })
    mockDb({
      gameData: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID, expansions: { base: true, pok: false } },
      secretObjectives: [
        { id: 'so-1', expansion: 'base' },
        { id: 'so-2', expansion: 'base' },
        { id: 'so-3', expansion: 'base' },
        { id: 'so-4', expansion: 'base' },
        { id: 'so-pok', expansion: 'pok' },
      ],
    })
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_player_secret_objectives') return { insert: secretInsertMock }
      return originalImpl(table)
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const inserted = secretInsertMock.mock.calls[0][0]
    // only base objectives dealt; pok filtered out
    inserted.forEach(r => {
      expect(['so-1', 'so-2', 'so-3', 'so-4']).toContain(r.secret_objective_id)
    })
  })
})
