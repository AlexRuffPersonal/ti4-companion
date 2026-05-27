import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase db and auth
vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError {
    constructor(msg) { this.message = msg }
  }
  return { requireAuth: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn(),
  EVT_RESOLVE_AGENDA: 'agenda_resolved',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-resolve-agenda/index.ts'

describe('game-resolve-agenda (Phase 40)', () => {
  beforeEach(() => vi.clearAllMocks())

  // Helper to set up default mocks
  function setupDefaultMocks() {
    requireAuth.mockResolvedValue('user-123')

    const db_mock = db
    db_mock.from = vi.fn().mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'g1', speaker_player_id: 'p1', agenda_current_card_id: 'agenda-1', agenda_phase_step: 'agenda_1_voting', round: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      }
      if (table === 'game_players' && arguments[0] === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'agendas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'agenda-1',
                  type: 'law',
                  elect_type: 'player',
                  tractable: true,
                  effect_json: null,
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_agenda_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deck-1' }, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      }
      if (table === 'game_laws') {
        return {
          insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }
      }
      return { from: vi.fn() }
    })
    return db_mock
  }

  // Test 1: Planet-elect law enacted should set elected_planet_name to planet name
  it('planet-elect law enacted: elected_planet_name = elected planet name in game_laws insert', async () => {
    const db_mock = setupDefaultMocks()
    let insertedData = null

    db_mock.from = vi.fn().mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'g1', speaker_player_id: 'p1', agenda_current_card_id: 'agenda-1', agenda_phase_step: 'agenda_1_voting', round: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'agendas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'agenda-1',
                  type: 'law',
                  elect_type: 'planet',  // Planet-elect
                  tractable: true,
                  effect_json: null,
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_agenda_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deck-1' }, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      }
      if (table === 'game_laws') {
        return {
          insert: vi.fn().mockImplementation((data) => {
            insertedData = data
            return Promise.resolve({ data: {}, error: null })
          }),
        }
      }
      return { from: vi.fn() }
    })

    const req = {
      method: 'POST',
      json: vi.fn().mockResolvedValue({
        game_id: 'g1',
        agenda_id: 'agenda-1',
        elected_target: 'Mecatol Rex',
      }),
    }

    await handler(req)

    expect(insertedData).toBeDefined()
    expect(insertedData.elected_planet_name).toBe('Mecatol Rex')
    expect(insertedData.elected_target).toBe('Mecatol Rex')
  })

  // Test 2: Player-elect law enacted should set elected_planet_name to null
  it('player-elect law enacted: elected_planet_name = null in game_laws insert', async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: {}, error: null })

    // Create a proper chain of mocks for each table
    const gamesMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'g1', speaker_player_id: 'p1', agenda_current_card_id: 'agenda-1', agenda_phase_step: 'agenda_1_voting', round: 3 },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    }

    const gamePlayersMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),  // Caller is p1
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
        }),
      }),
    }

    const agendasMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'agenda-1',
              type: 'law',
              elect_type: 'player',  // Player-elect
              tractable: true,
              effect_json: null,
            },
            error: null,
          }),
        }),
      }),
    }

    const agendaDeckMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deck-1' }, error: null }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    }

    const gameLawsMock = {
      insert: insertMock,
    }

    db.from = vi.fn().mockImplementation((table) => {
      if (table === 'games') return gamesMock
      if (table === 'game_players') return gamePlayersMock
      if (table === 'agendas') return agendasMock
      if (table === 'game_agenda_deck') return agendaDeckMock
      if (table === 'game_laws') return gameLawsMock
      return {}
    })

    const req = {
      method: 'POST',
      json: vi.fn().mockResolvedValue({
        game_id: 'g1',
        agenda_id: 'agenda-1',
        elected_target: 'p2',  // player ID
      }),
    }

    const result = await handler(req)

    // Log the response for debugging
    console.log('Handler response:', result)

    // Verify that insert was called with the correct data
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      elected_planet_name: null,
      elected_target: 'p2',
    }))
  })

  // Test 3: award_vp for planet-elect law should award VP to player controlling the planet
  it('award_vp for planet-elect law: VP awarded to player controlling the elected planet', async () => {
    const db_mock = setupDefaultMocks()
    let vpUpdateData = null
    let vpUpdatePlayerId = null

    db_mock.from = vi.fn().mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'g1', speaker_player_id: 'p1', agenda_current_card_id: 'agenda-1', agenda_phase_step: 'agenda_1_voting', round: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
              }),
              maybeSingle: vi.fn().mockImplementation(() => {
                // For the vp lookup
                return Promise.resolve({ data: { vp: 5 }, error: null })
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            vpUpdateData = data
            return {
              eq: vi.fn().mockImplementation((col, val) => {
                vpUpdatePlayerId = val
                return Promise.resolve({ data: {}, error: null })
              }),
            }
          }),
        }
      }
      if (table === 'agendas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'agenda-1',
                  type: 'law',
                  elect_type: 'planet',  // Planet-elect
                  tractable: true,
                  effect_json: { op: 'award_vp', amount: 2 },  // award_vp effect
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_agenda_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deck-1' }, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { player_id: 'p3' },  // Planet is controlled by p3
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_laws') {
        return {
          insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }
      }
      return { from: vi.fn() }
    })

    const req = {
      method: 'POST',
      json: vi.fn().mockResolvedValue({
        game_id: 'g1',
        agenda_id: 'agenda-1',
        elected_target: 'Mecatol Rex',
      }),
    }

    await handler(req)

    // Verify VP was updated for the player controlling the planet
    expect(vpUpdateData).toBeDefined()
    expect(vpUpdateData.vp).toBe(7)  // 5 + 2
    expect(vpUpdatePlayerId).toBe('p3')  // The player who controls the planet
  })
})
