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
  EVT_PLAY_PROMISSORY_NOTE: 'play_promissory_note',
}))

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/promissoryHandlers.ts', () => ({
  resolvePromissoryHandler: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'
import { handler } from '../../../supabase/functions/game-play-promissory-note/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const ORIGIN_PLAYER_ID = 'origin-player-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'
const NOTE_ID = 'note-uuid'
const ABILITY_DEF_ID = 'ability-def-uuid'
const ATTACHMENT_ID = 'attachment-uuid'
const PLANET_ROW_ID = 'planet-row-uuid'

const makeRequest = (body) => _makeRequest('game-play-promissory-note', body)

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
  abilitySource = { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'test_handler', effects: [] } },
  abilitySourceError = null,
  noteRef = { purge_on_use: false, into_play_area: false, name: 'Test Note' },
  noteRefError = null,
  updateError = null,
  // New for Terraform:
  planetRow = { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'blue' } },
  planetRowError = null,
  attachmentRow = { id: ATTACHMENT_ID },
  attachmentRowError = null,
  planetUpdateError = null,
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
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { round: 1 }, error: null }),
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
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: planetRow, error: planetRowError }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: planetUpdateError }),
        }),
      }
    }
    if (table === 'attachments') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: attachmentRow, error: attachmentRowError }),
          }),
        }),
      }
    }
    return nullSafeChain()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
  interpretEffects.mockResolvedValue(undefined)
  resolvePromissoryHandler.mockResolvedValue(undefined)
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
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { round: 1 }, error: null }) }) }) }
      }
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
                  data: { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'test', effects: [] } },
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
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { round: 1 }, error: null }) }) }) }
      }
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
                  data: { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'test', effects: [] } },
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
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { round: 1 }, error: null }) }) }) }
      }
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
                  data: { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'test', effects: [] } },
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

  // Terraform attachment validation tests moved to tests/lib/promissoryHandlers.phase45.test.js
  // The inline Terraform block was removed from index.ts; logic lives in resolvePromissoryHandler.

  it('merges body.planet_name into ctx.selections.planet_name before calling handler', async () => {
    mockDb({
      abilitySource: { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'terraform', effects: [] } },
      noteRef: { purge_on_use: false, into_play_area: true },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      planet_name: 'Hopestone',
    }))
    expect(res.status).toBe(200)
    expect(resolvePromissoryHandler).toHaveBeenCalledWith(
      'terraform',
      expect.objectContaining({ selections: expect.objectContaining({ planet_name: 'Hopestone' }) }),
      expect.anything()
    )
  })
})

const ABILITY_DEF_ID_39A = 'ability-def-uuid'

function makeAbilitySource({ effects = [], handler = null } = {}) {
  return {
    ability_id: ABILITY_DEF_ID_39A,
    ability_definitions: { id: ABILITY_DEF_ID_39A, handler, effects },
  }
}

describe('game-play-promissory-note Phase 39a — DSL resolution', () => {
  describe('T501: handler_key not yet implemented → 501', () => {
    it('returns 501 when resolvePromissoryHandler throws a 501 dslError', async () => {
      mockDb({ abilitySource: makeAbilitySource({ handler: 'ceasefire', effects: [] }) })
      const err = new Error('Promissory handler ceasefire not yet implemented')
      err.status = 501
      resolvePromissoryHandler.mockRejectedValue(err)

      const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
      expect(res.status).toBe(501)
    })
  })

  describe('T200 effects path', () => {
    it('calls interpretEffects and returns 200 when effects array is non-empty', async () => {
      const effects = [{ op: 'gain_trade_goods', amount: 1 }]
      mockDb({ abilitySource: makeAbilitySource({ effects, handler: null }) })

      const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledOnce()
      expect(resolvePromissoryHandler).not.toHaveBeenCalled()

      const [calledEffects, calledCtx] = interpretEffects.mock.calls[0]
      expect(calledEffects).toEqual(effects)
      expect(calledCtx.gameId).toBe(GAME_ID)
      expect(calledCtx.activatingPlayerId).toBe(PLAYER_ID)
      expect(calledCtx.noteInstanceId).toBe(NOTE_INSTANCE_ID)
      expect(calledCtx.noteOriginPlayerId).toBe(ORIGIN_PLAYER_ID)
    })
  })

  describe('T200 handler path', () => {
    it('calls resolvePromissoryHandler and returns 200 when handler_key is set and effects is empty', async () => {
      mockDb({ abilitySource: makeAbilitySource({ handler: 'bloodPact', effects: [] }) })

      const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
      expect(res.status).toBe(200)
      expect(resolvePromissoryHandler).toHaveBeenCalledOnce()
      expect(interpretEffects).not.toHaveBeenCalled()

      const [calledKey, calledCtx] = resolvePromissoryHandler.mock.calls[0]
      expect(calledKey).toBe('bloodPact')
      expect(calledCtx.gameId).toBe(GAME_ID)
      expect(calledCtx.activatingPlayerId).toBe(PLAYER_ID)
      expect(calledCtx.noteInstanceId).toBe(NOTE_INSTANCE_ID)
      expect(calledCtx.noteOriginPlayerId).toBe(ORIGIN_PLAYER_ID)
    })
  })

  describe('T409 from handler', () => {
    it('returns 409 when resolvePromissoryHandler throws a dslError with status 409', async () => {
      mockDb({ abilitySource: makeAbilitySource({ handler: 'politicalFavor', effects: [] }) })
      const err = new Error('Cannot play this note now')
      err.status = 409
      resolvePromissoryHandler.mockRejectedValue(err)

      const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('Cannot play this note now')
    })
  })

  describe('T500 from handler', () => {
    it('returns 500 when resolvePromissoryHandler throws a generic Error', async () => {
      mockDb({ abilitySource: makeAbilitySource({ handler: 'darkPact', effects: [] }) })
      resolvePromissoryHandler.mockRejectedValue(new Error('Unexpected failure'))

      const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
      expect(res.status).toBe(500)
    })
  })

  describe('context fields passed correctly', () => {
    it('passes noteInstanceId and noteOriginPlayerId in ctx to effects', async () => {
      const effects = [{ op: 'gain_trade_goods', amount: 2 }]
      mockDb({ abilitySource: makeAbilitySource({ effects }) })

      await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))

      const [, calledCtx] = interpretEffects.mock.calls[0]
      expect(calledCtx.noteInstanceId).toBe(NOTE_INSTANCE_ID)
      expect(calledCtx.noteOriginPlayerId).toBe(ORIGIN_PLAYER_ID)
    })

    it('passes noteInstanceId and noteOriginPlayerId in ctx to handler', async () => {
      mockDb({ abilitySource: makeAbilitySource({ handler: 'warFunding', effects: [] }) })

      await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))

      const [, calledCtx] = resolvePromissoryHandler.mock.calls[0]
      expect(calledCtx.noteInstanceId).toBe(NOTE_INSTANCE_ID)
      expect(calledCtx.noteOriginPlayerId).toBe(ORIGIN_PLAYER_ID)
    })
  })

  describe('abilitySource DB error', () => {
    it('returns 500 when ability_sources query fails', async () => {
      mockDb({ abilitySourceError: new Error('DB error') })
      const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
      expect(res.status).toBe(500)
    })
  })
})
