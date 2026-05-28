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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'
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
  abilitySource = null,
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

function makeAbilitySource({ effects = [], handler_key = null } = {}) {
  return {
    ability_definition_id: ABILITY_DEF_ID,
    ability_definitions: { id: ABILITY_DEF_ID, handler_key, effects },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  interpretEffects.mockResolvedValue(undefined)
  resolvePromissoryHandler.mockResolvedValue(undefined)
  mockDb({ abilitySource: makeAbilitySource() })
})

describe('game-play-promissory-note Phase 39a — DSL resolution', () => {
  describe('T501: handler_key not yet implemented → 501', () => {
    it('returns 501 when resolvePromissoryHandler throws a 501 dslError', async () => {
      mockDb({ abilitySource: makeAbilitySource({ handler_key: 'ceasefire', effects: [] }) })
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
      mockDb({ abilitySource: makeAbilitySource({ effects, handler_key: null }) })

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
      mockDb({ abilitySource: makeAbilitySource({ handler_key: 'bloodPact', effects: [] }) })

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
      mockDb({ abilitySource: makeAbilitySource({ handler_key: 'politicalFavor', effects: [] }) })
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
      mockDb({ abilitySource: makeAbilitySource({ handler_key: 'darkPact', effects: [] }) })
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
      mockDb({ abilitySource: makeAbilitySource({ handler_key: 'warFunding', effects: [] }) })

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
