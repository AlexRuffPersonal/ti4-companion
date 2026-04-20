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
const NOTE_INSTANCE_ID = 'note-instance-uuid'
const NOTE_ID = 'note-uuid'

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
  noteRow = { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID },
  noteRowError = null,
  noteRef = { purge_on_use: false },
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: noteRow, error: noteRowError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
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
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when note_instance_id is missing', async () => {
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

  it('returns 404 when player not found in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when note instance not found', async () => {
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
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(409)
  })

  it('sets note state to discarded when purge_on_use=true', async () => {
    const updateMock = vi.fn().mockResolvedValue({ error: null })
    mockDb({ noteRef: { purge_on_use: true } })
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID },
                error: null,
              }),
            }),
          }),
          update: updateMock.mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { purge_on_use: true }, error: null }),
            }),
          }),
        }
      }
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledOnce()
    const updateCall = updateMock.mock.calls[0][0]
    expect(updateCall.state).toBe('discarded')
  })

  it('sets note state to played when purge_on_use=false', async () => {
    const updateMock = vi.fn().mockResolvedValue({ error: null })
    mockDb({ noteRef: { purge_on_use: false } })
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID },
                error: null,
              }),
            }),
          }),
          update: updateMock.mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { purge_on_use: false }, error: null }),
            }),
          }),
        }
      }
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledOnce()
    const updateCall = updateMock.mock.calls[0][0]
    expect(updateCall.state).toBe('played')
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
})
