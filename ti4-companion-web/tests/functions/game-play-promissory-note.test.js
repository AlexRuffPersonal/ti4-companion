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
import { handler } from '../../../supabase/functions/game-play-promissory-note/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ORIGIN_PLAYER_ID = 'origin-player-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'
const NOTE_ID = 'note-uuid'
const ABILITY_DEF_ID = 'ability-def-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-play-promissory-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID },
  playerError = null,
  noteRow = {
    id: NOTE_INSTANCE_ID,
    state: 'held',
    held_by_player_id: PLAYER_ID,
    note_id: NOTE_ID,
    origin_player_id: ORIGIN_PLAYER_ID,
  },
  noteRowError = null,
  abilitySource = { ability_definition_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler_key: 'test_handler', effects: [] } },
  abilitySourceError = null,
  noteRef = { purge_on_use: false, into_play_area: false },
  noteRefError = null,
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_promissory_notes') {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: noteRow, error: noteRowError }),
          }),
        }),
        update: updateMock,
      }
    }
    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: abilitySource, error: abilitySourceError }),
            }),
          }),
        }),
      }
    }
    if (table === 'promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: noteRef, error: noteRefError }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-play-promissory-note', () => {
  it('T401: returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(401)
  })

  it('T400(game_id): returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(400)
  })

  it('T400(note_instance_id): returns 400 when note_instance_id is missing', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when game_id is not a string', async () => {
    const res = await handler(makeRequest({
      game_id: 123,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when note_instance_id is not a string', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: 123,
    }))
    expect(res.status).toBe(400)
  })

  it('T404_PLAYER: returns 404 when player not found in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(404)
  })

  it('T404: returns 404 when note instance not found', async () => {
    mockDb({ noteRow: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(404)
  })

  it('returns 403 if caller does not hold the note', async () => {
    mockDb({
      noteRow: {
        id: NOTE_INSTANCE_ID,
        state: 'held',
        held_by_player_id: 'other-player-uuid',
        note_id: NOTE_ID,
        origin_player_id: ORIGIN_PLAYER_ID,
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(403)
  })

  it('returns 409 if note state is not held', async () => {
    mockDb({
      noteRow: {
        id: NOTE_INSTANCE_ID,
        state: 'played',
        held_by_player_id: PLAYER_ID,
        note_id: NOTE_ID,
        origin_player_id: ORIGIN_PLAYER_ID,
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 if note state is discarded', async () => {
    mockDb({
      noteRow: {
        id: NOTE_INSTANCE_ID,
        state: 'discarded',
        held_by_player_id: PLAYER_ID,
        note_id: NOTE_ID,
        origin_player_id: ORIGIN_PLAYER_ID,
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(409)
  })

  it('T404: returns 404 when no ability_definition for note', async () => {
    mockDb({ abilitySource: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/No ability definition/)
  })

  it('GIVEN into_play_area=true → state="in_play"', async () => {
    let capturedUpdate
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        const updateMock = vi.fn().mockImplementation((data) => {
          capturedUpdate = data
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID, origin_player_id: ORIGIN_PLAYER_ID },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'ability_sources') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ability_definition_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler_key: 'test', effects: [] } },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { purge_on_use: false, into_play_area: true }, error: null }),
            }),
          }),
        }
      }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
    expect(capturedUpdate.state).toBe('in_play')
  })

  it('GIVEN purge_on_use=true → state="discarded"', async () => {
    let capturedUpdate
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        const updateMock = vi.fn().mockImplementation((data) => {
          capturedUpdate = data
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID, origin_player_id: ORIGIN_PLAYER_ID },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'ability_sources') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ability_definition_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler_key: 'test', effects: [] } },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { purge_on_use: true, into_play_area: false }, error: null }),
            }),
          }),
        }
      }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
    expect(capturedUpdate.state).toBe('discarded')
  })

  it('GIVEN into_play_area=false, purge_on_use=false → state="held", held_by=origin_player_id', async () => {
    let capturedUpdate
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        const updateMock = vi.fn().mockImplementation((data) => {
          capturedUpdate = data
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID, origin_player_id: ORIGIN_PLAYER_ID },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'ability_sources') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ability_definition_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler_key: 'test', effects: [] } },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { purge_on_use: false, into_play_area: false }, error: null }),
            }),
          }),
        }
      }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.played).toBe(true)
    expect(capturedUpdate.state).toBe('held')
    expect(capturedUpdate.held_by_player_id).toBe(ORIGIN_PLAYER_ID)
  })

  it('returns 200 and { played: true } on success', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.played).toBe(true)
  })

  it('returns 500 on player query database error', async () => {
    mockDb({ playerError: new Error('DB error') })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(500)
  })

  it('returns 500 on note row query database error', async () => {
    mockDb({ noteRowError: new Error('DB error') })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(500)
  })

  it('returns 500 on note reference query database error', async () => {
    mockDb({ noteRefError: new Error('DB error') })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(500)
  })

  it('returns 500 on update database error', async () => {
    mockDb({ updateError: new Error('DB error') })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(500)
  })

  it('accepts optional selections field in request body', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      selections: { target_player_id: 'some-player' },
    }))
    expect(res.status).toBe(200)
  })
})
