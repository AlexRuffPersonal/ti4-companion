// tests/functions/game-cast-votes.test.js
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
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-cast-votes/index.ts'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-cast-votes', body)

const GAME_ID = 'game-uuid'
const VOTER_USER_ID = 'voter-user-uuid'
const VOTER_PLAYER_ID = 'p2'
const AGENDA_ID = 'agenda-uuid'
const SPEAKER_PLAYER_ID = 'p1'

let upsertVotesMock, updateGameMock

function mockDb({
  game = {
    id: GAME_ID,
    speaker_player_id: SPEAKER_PLAYER_ID,
    agenda_current_card_id: AGENDA_ID,
    agenda_vote_current_player_id: VOTER_PLAYER_ID,
  },
  callerPlayer = { id: VOTER_PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0, vote_prevented: false },
  allPlayers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
  planets = [
    { exhausted: false, influence: 3 },
    { exhausted: false, influence: 2 },
    { exhausted: true,  influence: 1 },
  ],
  existingVotes = [],
  existingVoteCount = 1, // default >0 so window logic is skipped in baseline tests
  upsertError = null,
  updateGameError = null,
  updateWindowError = null,
  whenVotingCards = [],
  afterSpeakerCards = [],
} = {}) {
  upsertVotesMock = vi.fn().mockResolvedValue({ error: upsertError })
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: updateGameError }),
    }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
      update: (payload) => {
        updateGameMock(payload)
        if (payload && payload.pending_action_window !== undefined) {
          return { eq: vi.fn().mockResolvedValue({ error: updateWindowError ?? null }) }
        }
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: updateGameError }),
          }),
        }
      },
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((selectStr) => {
          if (selectStr === 'id, technologies, exhausted_technologies, trade_goods, vote_prevented, faction, leaders') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }
          }
          if (selectStr === 'id, technologies, exhausted_technologies') {
            return {
              eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
            }
          }
          return {
            eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
          }
        }),
      }
    }
    if (table === 'game_player_planets') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: planets, error: null }),
        }),
      }),
    }
    if (table === 'game_agenda_votes') return {
      upsert: upsertVotesMock,
      select: vi.fn().mockImplementation((_, opts) => {
        if (opts && opts.head) {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: existingVoteCount, error: null }),
            }),
          }
        }
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: existingVotes, error: null }),
          }),
        }
      }),
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => {
                const cards = val === 'When voting begins:' ? whenVotingCards : afterSpeakerCards
                return {
                  not: vi.fn().mockResolvedValue({ data: cards, error: null }),
                }
              }),
            }),
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
  requireAuth.mockResolvedValue(VOTER_USER_ID)
})

describe('game-cast-votes', () => {
  it('returns 401 for unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when it is not the caller's turn", async () => {
    mockDb({ callerPlayer: { id: 'p3', technologies: [], exhausted_technologies: [], trade_goods: 0, vote_prevented: false } }) // not the current voter
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when no agenda is in play', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: null, agenda_vote_current_player_id: VOTER_PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when vote_count exceeds available influence', async () => {
    // max non-exhausted influence = 3 + 2 = 5
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 6 }))
    expect(res.status).toBe(400)
  })

  it('upserts vote and advances current voter on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ game_player_id: VOTER_PLAYER_ID, choice: 'For', vote_count: 2, abstained: false }),
      expect.anything(),
    )
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda_vote_current_player_id: 'p3' }),
    )
  })

  it('accepts abstain and sets vote_count 0', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, abstain: true }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ abstained: true, vote_count: 0 }),
      expect.anything(),
    )
  })

  it('sets agenda_vote_current_player_id to null when all players have voted', async () => {
    mockDb({
      existingVotes: [
        { game_player_id: 'p1' },
        { game_player_id: 'p2' },
        { game_player_id: 'p3' },
      ],
    })
    await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda_vote_current_player_id: null }),
    )
  })

  it('GIVEN first vote + player holds When-voting-begins card — opens window and does NOT cast vote', async () => {
    const HOLDER_ID = 'player-with-card'
    mockDb({
      existingVoteCount: 0,
      whenVotingCards: [{ held_by_player_id: HOLDER_ID }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.window_opened).toBe('when_voting_begins')
    // Vote must NOT have been cast
    expect(upsertVotesMock).not.toHaveBeenCalled()
    // pending_action_window should be set
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeDefined()
    expect(windowCall[0].pending_action_window).toMatchObject({
      type: 'when_voting_begins',
      eligible_player_ids: [HOLDER_ID],
    })
  })

  it('GIVEN first vote + no When-voting-begins cards — casts vote normally', async () => {
    mockDb({ existingVoteCount: 0, whenVotingCards: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalled()
    // No window_opened in response
    const body = await res.json()
    expect(body.window_opened).toBeUndefined()
  })

  it('GIVEN speaker player casts vote + After-speaker-votes card held — opens after_speaker_votes window', async () => {
    const HOLDER_ID = 'player-with-after-card'
    // Set caller as speaker
    mockDb({
      callerPlayer: { id: SPEAKER_PLAYER_ID, vote_prevented: false },
      game: {
        id: GAME_ID,
        speaker_player_id: SPEAKER_PLAYER_ID,
        agenda_current_card_id: AGENDA_ID,
        agenda_vote_current_player_id: SPEAKER_PLAYER_ID,
      },
      afterSpeakerCards: [{ held_by_player_id: HOLDER_ID }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(200)
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeDefined()
    expect(windowCall[0].pending_action_window).toMatchObject({
      type: 'after_speaker_votes',
      eligible_player_ids: [HOLDER_ID],
    })
  })

  it('GIVEN non-speaker player casts vote — no after_speaker_votes window', async () => {
    mockDb({ afterSpeakerCards: [{ held_by_player_id: 'some-player' }] })
    // VOTER_PLAYER_ID (p2) is not the speaker (p1)
    await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window?.type === 'after_speaker_votes'
    )
    expect(windowCall).toBeUndefined()
  })
})

describe('Phase 30 tech effects', () => {
  it('GIVEN Mirror Computing owned, 2 TGs EXPECT TGs contribute 4 to available influence', async () => {
    // Planets give 0 influence (all exhausted), trade_goods=2, Mirror Computing → 4 influence from TGs
    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: ['Mirror Computing'],
        exhausted_technologies: [],
        trade_goods: 2,
      },
      planets: [
        { exhausted: true, influence: 3 },
        { exhausted: true, influence: 2 },
      ],
    })
    // vote_count: 4 should succeed (2 TGs × 2 = 4 influence)
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 4 }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 4 }),
      expect.anything(),
    )
  })

  it('GIVEN Predictive Intelligence owned, use_predictive=true EXPECT vote_count in upsert is original + 3', async () => {
    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: ['Predictive Intelligence'],
        exhausted_technologies: [],
        trade_goods: 0,
      },
      planets: [
        { exhausted: false, influence: 3 },
        { exhausted: false, influence: 2 },
      ],
    })
    // vote_count: 2, with use_predictive → upserted as 5
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      choice: 'For',
      vote_count: 2,
      selections: { use_predictive: true },
    }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 5 }),
      expect.anything(),
    )
  })

  it('GIVEN Genetic Recombination unexhausted opponent EXPECT window opened and { window_opened: true } returned', async () => {
    const mahactPlayerId = 'p1'
    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: [],
        exhausted_technologies: [],
        trade_goods: 0,
      },
      allPlayers: [
        {
          id: mahactPlayerId,
          technologies: ['Genetic Recombination'],
          exhausted_technologies: [],
        },
        {
          id: VOTER_PLAYER_ID,
          technologies: [],
          exhausted_technologies: [],
        },
        {
          id: 'p3',
          technologies: [],
          exhausted_technologies: [],
        },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.window_opened).toBe(true)
    // No vote should have been upserted
    expect(upsertVotesMock).not.toHaveBeenCalled()
  })

  it('GIVEN no Genetic Recombination opponents EXPECT no window opened', async () => {
    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: [],
        exhausted_technologies: [],
        trade_goods: 0,
      },
      allPlayers: [
        { id: 'p1', technologies: [], exhausted_technologies: [] },
        { id: VOTER_PLAYER_ID, technologies: [], exhausted_technologies: [] },
        { id: 'p3', technologies: [], exhausted_technologies: [] },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.window_opened).toBeUndefined()
    expect(upsertVotesMock).toHaveBeenCalled()
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'cast_votes' }))
  })
})

describe('game-cast-votes Phase 43c — Xxcha commander: extra vote per exhausted planet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
    requireAuth.mockResolvedValue(VOTER_USER_ID)
    mockDb()
  })

  it('Xxcha commander unlocked — extraVotes added from exhausted planet count', async () => {
    // Simulate xxcha_extra_vote_per_planet handler adding 3 extra votes (3 exhausted planets)
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Xxcha Kingdom', effect: 'xxcha_extra_vote_per_planet' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (context) => {
      context.extraVotes = (context.extraVotes ?? 0) + 3
    }))

    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: [],
        exhausted_technologies: [],
        trade_goods: 0,
        vote_prevented: false,
        faction: 'The Xxcha Kingdom',
        leaders: { commander: 'unlocked' },
      },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, choice: 'For', vote_count: 5,
      selections: { exhausted_planet_count: 3 },
    }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 8 }),
      expect.anything(),
    )
  })

  it('Xxcha commander — vote prevention immunity overrides vote_prevented flag', async () => {
    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: [],
        exhausted_technologies: [],
        trade_goods: 0,
        vote_prevented: true,
        faction: 'The Xxcha Kingdom',
        leaders: { commander: 'unlocked' },
      },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 3 }))
    // Should proceed (200), NOT return 409 due to vote prevention
    expect(res.status).toBe(200)
  })
})

describe('game-cast-votes Phase 43c — Hacan commander: trade goods to votes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
    requireAuth.mockResolvedValue(VOTER_USER_ID)
    mockDb()
  })

  it('Hacan commander — trade_goods_spent adds 2 votes per TG spent', async () => {
    // Simulate hacan_trade_good_votes handler: 2 TG spent → +4 votes
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Emirates Of Hacan', effect: 'hacan_trade_good_votes' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (context) => {
      // 2 TGs spent → 4 extra votes
      context.extraVotes = (context.extraVotes ?? 0) + 4
    }))

    mockDb({
      callerPlayer: {
        id: VOTER_PLAYER_ID,
        technologies: [],
        exhausted_technologies: [],
        trade_goods: 4,
        vote_prevented: false,
        faction: 'The Emirates Of Hacan',
        leaders: { commander: 'unlocked' },
      },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, choice: 'For', vote_count: 5,
      selections: { trade_goods_spent: 2 },
    }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 9 }),
      expect.anything(),
    )
  })
})

describe('phase 39b — Blood Pact promissory note', () => {
  const HOLDER_ID = 'p2'
  const OWNER_ID = 'p3'
  const NOTE_INSTANCE_ID = 'note-uuid'

  const EMPTY_NOTES = {
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }

  const BLOOD_PACT_NOTE = { instanceId: NOTE_INSTANCE_ID, holderPlayerId: HOLDER_ID, ownerPlayerId: OWNER_ID }

  let updateVotesMock

  function mockDb39b({ otherPlayerVote = null } = {}) {
    updateVotesMock = vi.fn()

    db.from.mockImplementation((table) => {
      if (table === 'games') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: GAME_ID,
                speaker_player_id: SPEAKER_PLAYER_ID,
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
            return { eq: vi.fn().mockResolvedValue({ data: [{ id: SPEAKER_PLAYER_ID, technologies: [], exhausted_technologies: [] }, { id: HOLDER_ID, technologies: [], exhausted_technologies: [] }, { id: OWNER_ID, technologies: [], exhausted_technologies: [] }], error: null }) }
          }
          return { eq: vi.fn().mockResolvedValue({ data: [{ id: SPEAKER_PLAYER_ID }, { id: HOLDER_ID }, { id: OWNER_ID }], error: null }) }
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
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
    requireAuth.mockResolvedValue(VOTER_USER_ID)
  })

  it('Blood Pact in_play, holder and owner vote same outcome → +4 votes for holder', async () => {
    getActiveNotes.mockResolvedValue({ ...EMPTY_NOTES, bloodPact: [BLOOD_PACT_NOTE] })
    mockDb39b({ otherPlayerVote: { choice: 'For' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(updateVotesMock).toHaveBeenCalledWith({ vote_count: 6 })
  })

  it('Blood Pact in_play, holder and owner vote different outcomes → no bonus', async () => {
    getActiveNotes.mockResolvedValue({ ...EMPTY_NOTES, bloodPact: [BLOOD_PACT_NOTE] })
    mockDb39b({ otherPlayerVote: { choice: 'Against' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(updateVotesMock).not.toHaveBeenCalled()
  })

  it('Blood Pact not in_play → no bonus', async () => {
    getActiveNotes.mockResolvedValue({ ...EMPTY_NOTES, bloodPact: [] })
    mockDb39b({ otherPlayerVote: { choice: 'For' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(updateVotesMock).not.toHaveBeenCalled()
  })
})
