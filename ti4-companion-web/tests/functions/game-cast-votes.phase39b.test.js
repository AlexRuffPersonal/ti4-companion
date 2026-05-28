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
vi.mock('../../../supabase/functions/_shared/player-order.ts', () => ({
  getNextPlayer: vi.fn().mockResolvedValue('p3'),
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_CAST_VOTES: 'cast_votes',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn(),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-cast-votes/index.ts'

const GAME_ID = 'game-uuid'
const USER_ID = 'voter-user-uuid'
const HOLDER_ID = 'p2'
const OWNER_ID = 'p3'
const AGENDA_ID = 'agenda-uuid'
const SPEAKER_ID = 'p1'
const NOTE_INSTANCE_ID = 'note-uuid'

const EMPTY_NOTES = {
  supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
  bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
  tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
}

const BLOOD_PACT_NOTE = { instanceId: NOTE_INSTANCE_ID, holderPlayerId: HOLDER_ID, ownerPlayerId: OWNER_ID }

function makeRequest(body) {
  return new Request('http://localhost/game-cast-votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updateVotesMock

function mockDb({ otherPlayerVote = null } = {}) {
  updateVotesMock = vi.fn()

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: GAME_ID,
              speaker_player_id: SPEAKER_ID,
              agenda_current_card_id: AGENDA_ID,
              agenda_vote_current_player_id: HOLDER_ID,
            },
            error: null,
          }),
        }),
      }),
      update: (payload) => {
        if (payload && payload.pending_action_window !== undefined) {
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }
        return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      },
    }
    if (table === 'game_players') return {
      select: vi.fn().mockImplementation((selectStr) => {
        if (selectStr.includes('vote_prevented')) {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: HOLDER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0, vote_prevented: false, faction: 'The Barony of Letnev', leaders: null },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (selectStr === 'id, technologies, exhausted_technologies') {
          return { eq: vi.fn().mockResolvedValue({ data: [{ id: SPEAKER_ID, technologies: [], exhausted_technologies: [] }, { id: HOLDER_ID, technologies: [], exhausted_technologies: [] }, { id: OWNER_ID, technologies: [], exhausted_technologies: [] }], error: null }) }
        }
        return { eq: vi.fn().mockResolvedValue({ data: [{ id: SPEAKER_ID }, { id: HOLDER_ID }, { id: OWNER_ID }], error: null }) }
      }),
    }
    if (table === 'game_player_planets') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ exhausted: false, influence: 5 }], error: null }),
        }),
      }),
    }
    if (table === 'game_agenda_votes') return {
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: (payload) => {
        updateVotesMock(payload)
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      },
      select: vi.fn().mockImplementation((selectStr, opts) => {
        if (opts && opts.head) {
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 1, error: null }) }) }
        }
        if (selectStr === 'choice') {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: otherPlayerVote, error: null }),
                }),
              }),
            }),
          }
        }
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [{ game_player_id: HOLDER_ID }], error: null }),
          }),
        }
      }),
    }
    if (table === 'game_action_card_deck') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('Phase 39b Blood Pact', () => {
  it('Blood Pact in_play, holder and owner vote same outcome → +4 votes for holder', async () => {
    getActiveNotes.mockResolvedValue({ ...EMPTY_NOTES, bloodPact: [BLOOD_PACT_NOTE] })
    mockDb({ otherPlayerVote: { choice: 'For' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(updateVotesMock).toHaveBeenCalledWith({ vote_count: 6 })
  })

  it('Blood Pact in_play, holder and owner vote different outcomes → no bonus', async () => {
    getActiveNotes.mockResolvedValue({ ...EMPTY_NOTES, bloodPact: [BLOOD_PACT_NOTE] })
    mockDb({ otherPlayerVote: { choice: 'Against' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(updateVotesMock).not.toHaveBeenCalled()
  })

  it('Blood Pact not in_play → no bonus', async () => {
    getActiveNotes.mockResolvedValue({ ...EMPTY_NOTES, bloodPact: [] })
    mockDb({ otherPlayerVote: { choice: 'For' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(updateVotesMock).not.toHaveBeenCalled()
  })
})
