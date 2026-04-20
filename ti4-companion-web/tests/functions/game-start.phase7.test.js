// tests/functions/game-start.phase7.test.js
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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const PLAYERS = [
  { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
]
const AGENDAS = [
  { id: 'ag-1', expansion: 'base' },
  { id: 'ag-2', expansion: 'base' },
  { id: 'ag-3', expansion: 'pok' },
]

function makeRequest(body) {
  return new Request('http://localhost/game-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let agendaInsertMock

function mockDb({ agendas = AGENDAS, insertAgendaError = null, expansions = { base: true, pok: true } } = {}) {
  agendaInsertMock = vi.fn().mockResolvedValue({ error: insertAgendaError })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: 'sp-1', expansions },
          error: null,
        }),
      })}),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
    if (table === 'public_objectives') return {
      select: vi.fn().mockReturnValue({ data: [], error: null }),
    }
    if (table === 'action_cards') return {
      select: vi.fn().mockReturnValue({ data: [], error: null }),
    }
    if (table === 'secret_objectives') return {
      select: vi.fn().mockReturnValue({ data: [
        { id: 'so-1', expansion: 'base' }, { id: 'so-2', expansion: 'base' },
      ], error: null }),
    }
    if (table === 'game_player_secret_objectives') return {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    if (table === 'agendas') return {
      select: vi.fn().mockReturnValue({ data: agendas, error: null }),
    }
    if (table === 'game_agenda_deck') return {
      insert: agendaInsertMock,
    }
    if (table === 'factions') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { home_tile_number: null, starting_techs: [] }, error: null,
        }),
      })}),
    }
    return { select: vi.fn().mockReturnValue({ data: [], error: null }) }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-start/index.ts')
})

beforeEach(() => { vi.clearAllMocks(); mockDb(); requireAuth.mockResolvedValue(HOST_ID) })

describe('game-start phase7 — agenda deck', () => {
  it('inserts one row per eligible agenda into game_agenda_deck', async () => {
    // With pok active, all 3 agendas are eligible
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const insertArg = agendaInsertMock.mock.calls[0][0]
    expect(insertArg).toHaveLength(3)
    expect(insertArg[0]).toMatchObject({ game_id: GAME_ID, state: 'deck' })
    expect(typeof insertArg[0].deck_position).toBe('number')
  })

  it('filters agendas by active expansions (base only)', async () => {
    mockDb({ expansions: { base: true, pok: false } })
    requireAuth.mockResolvedValue(HOST_ID)
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const insertArg = agendaInsertMock.mock.calls[0]?.[0] ?? []
    // only base agendas (ag-1, ag-2)
    expect(insertArg).toHaveLength(2)
  })
})
