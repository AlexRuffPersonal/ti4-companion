// tests/functions/game-resolve-agenda.test.js
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
  EVT_RESOLVE_AGENDA: 'resolve_agenda',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-resolve-agenda/index.ts'

const GAME_ID = 'game-uuid'
const SPEAKER_USER_ID = 'speaker-user'
const SPEAKER_PLAYER_ID = 'p1'
const AGENDA_ID = 'agenda-uuid'
const DECK_ROW_ID = 'deck-row-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updateGameMock, updateDeckMock, updatePlayerMock, updatePlanetMock, insertLawsMock

function mockDb({
  game = { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: AGENDA_ID, agenda_phase_step: 'agenda_1_voting', round: 3 },
  callerPlayer = { id: SPEAKER_PLAYER_ID },
  agenda = { id: AGENDA_ID, type: 'directive', elect_type: null, tractable: false, effect_json: {} },
  deckRow = { id: DECK_ROW_ID },
  updateGameError = null,
} = {}) {
  updateGameMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateGameError }) })
  updateDeckMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  updatePlayerMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  updatePlanetMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
  insertLawsMock = vi.fn().mockResolvedValue({ error: null })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }) }) }),
      update: updateGameMock,
    }
    if (table === 'game_players') {
      const maybeSingleMock = vi.fn().mockResolvedValue({ data: callerPlayer, error: null })
      const innerEq = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
      const outerEq = vi.fn().mockReturnValue({ eq: innerEq, maybeSingle: maybeSingleMock })
      return {
        select: vi.fn().mockReturnValue({ eq: outerEq }),
        update: updatePlayerMock,
      }
    }
    if (table === 'agendas') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: agenda, error: null }) }) }),
    }
    if (table === 'game_agenda_deck') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: deckRow, error: null }) }) }) }) }),
      update: updateDeckMock,
    }
    if (table === 'game_laws') return { insert: insertLawsMock }
    if (table === 'game_player_planets') return { update: updatePlanetMock }
  })
}

beforeEach(() => { vi.clearAllMocks(); mockDb(); requireAuth.mockResolvedValue(SPEAKER_USER_ID) })

describe('game-resolve-agenda', () => {
  it('returns 401 for unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the speaker', async () => {
    mockDb({ callerPlayer: { id: 'not-speaker' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when agenda_id does not match current card', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: 'wrong-agenda', elected_target: null }))
    expect(res.status).toBe(409)
  })

  it('discards directive — sets deck state to discarded', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(200)
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'discarded' })
    expect(insertLawsMock).not.toHaveBeenCalled()
  })

  it('enacts non-tractable law — inserts with host_applies_manually true', async () => {
    mockDb({ agenda: { id: AGENDA_ID, type: 'law', elect_type: 'player', tractable: false, effect_json: {} } })
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: 'p2' }))
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'enacted' })
    expect(insertLawsMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_id: AGENDA_ID,
      elected_target: 'p2',
      host_applies_manually: true,
      is_repealed: false,
    }))
  })

  it('tractable award_vp law — updates player VP and enacts', async () => {
    mockDb({ agenda: { id: AGENDA_ID, type: 'law', elect_type: 'player', tractable: true, effect_json: { op: 'award_vp', amount: 1 } } })
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: 'p2' }))
    expect(updatePlayerMock).toHaveBeenCalled()
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'enacted' })
    expect(insertLawsMock).toHaveBeenCalledWith(expect.objectContaining({
      host_applies_manually: false,
    }))
  })

  it('advances step from agenda_1_voting to agenda_1_resolved', async () => {
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'agenda_1_resolved',
      agenda_current_card_id: null,
      agenda_vote_current_player_id: null,
    }))
  })

  it('advances step from agenda_2_voting to done', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: AGENDA_ID, agenda_phase_step: 'agenda_2_voting', round: 3 } })
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'done',
    }))
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'resolve_agenda' }))
  })
})
