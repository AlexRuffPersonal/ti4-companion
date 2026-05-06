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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-play-action-card/index.ts'

function makeRequest(body) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const GAME_ID = 'game-1'
const CARD_ID = 'card-1'
const CALLER_PLAYER_ID = 'player-caller'
const YSSARIL_PLAYER_ID = 'player-yssaril'
const XXCHA_PLAYER_ID = 'player-xxcha'

// Base game: action phase, Yssaril is active
const baseGame = {
  id: GAME_ID,
  phase: 'action',
  active_player_id: YSSARIL_PLAYER_ID,
  pending_action_window: null,
}

// Action card with Action: timing
const actionCard = {
  id: CARD_ID,
  state: 'held',
  held_by_player_id: CALLER_PLAYER_ID,
  timing: 'Action:',
  ability: null,
}

function buildFromMock({ callerPlayer, allPlayers, card = actionCard, game = baseGame, gamesUpdateCapture = null }) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
      }
      // Discrimination: maybeSingle returns the caller; plain array returns allPlayers
      // We use a call counter: first call to chain is the caller lookup, second is allPlayers
      let eqCount = 0
      chain.eq.mockImplementation(() => {
        eqCount++
        return chain
      })
      // maybeSingle is only called for the caller lookup
      chain.maybeSingle.mockResolvedValue({ data: callerPlayer, error: null })
      // For allPlayers query (no maybeSingle), we need a then-able
      // Override: if select is called with the allPlayers select string, return allPlayers result
      chain.select.mockImplementation((fields) => {
        if (fields && fields.includes('exhausted_technologies')) {
          // This is the allPlayers select
          return {
            eq: vi.fn().mockReturnValue({
              then: (resolve) => resolve({ data: allPlayers, error: null }),
            }),
          }
        }
        // Caller select
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
          update: vi.fn().mockReturnThis(),
        }
      })
      return chain
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: card, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }
    }
    if (table === 'games') {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
      if (gamesUpdateCapture) gamesUpdateCapture.update = updateMock
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: updateMock,
      }
    }
    return {}
  })
}

// Simpler, more direct mock approach
function setupMocks({ callerPlayer, allPlayers, card = actionCard, game = baseGame }) {
  const gamesUpdateCalls = []
  const gamePlayersUpdateCalls = []
  const cardUpdateCalls = []

  requireAuth.mockResolvedValue('user-caller')

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields.includes('exhausted_technologies')) {
            // allPlayers query
            return {
              eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
            }
          }
          // caller query
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
              }),
            }),
          }
        }),
        update: vi.fn().mockImplementation((vals) => {
          gamePlayersUpdateCalls.push(vals)
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
        }),
      }
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: card, error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          cardUpdateCalls.push(vals)
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          gamesUpdateCalls.push(vals)
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
        }),
      }
    }
    return {}
  })

  return { gamesUpdateCalls, gamePlayersUpdateCalls, cardUpdateCalls }
}

describe('game-play-action-card Phase 30 tech effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Transparasteel Plating (Yssaril technology)', () => {
    it('blocks a passed player from playing action cards during Yssaril turn', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: true,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: YSSARIL_PLAYER_ID,
          technologies: ['Transparasteel Plating'],
          exhausted_technologies: [],
          command_tokens: { strategy: 1 },
        },
      ]

      setupMocks({ callerPlayer, allPlayers, game: { ...baseGame, active_player_id: YSSARIL_PLAYER_ID } })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error).toMatch(/cannot play action cards during yssaril turn after passing/i)
    })

    it('allows a non-passed player to play action cards during Yssaril turn', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: YSSARIL_PLAYER_ID,
          technologies: ['Transparasteel Plating'],
          exhausted_technologies: [],
          command_tokens: { strategy: 0 },
        },
      ]

      // Caller IS the active player for this test, not Yssaril
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }
      setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))

      expect(res.status).toBe(200)
    })

    it('does not block when Yssaril player is not the active player', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: true,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: YSSARIL_PLAYER_ID,
          technologies: ['Transparasteel Plating'],
          exhausted_technologies: [],
          command_tokens: { strategy: 0 },
        },
      ]

      // Caller is the active player, not Yssaril
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }
      setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))

      expect(res.status).toBe(200)
    })
  })

  describe('Instinct Training (Xxcha technology)', () => {
    it('opens a when_action_card_played window after Action: card is played when Xxcha has unexhausted Instinct Training and a strategy token', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const xxchaPlayer = {
        id: XXCHA_PLAYER_ID,
        technologies: ['Instinct Training'],
        exhausted_technologies: [],
        command_tokens: { strategy: 1 },
      }
      const allPlayers = [callerPlayer, xxchaPlayer]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.instinct_training_window).toBe(true)
      expect(json.discarded).toBe(CARD_ID)

      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeTruthy()
      expect(windowUpdate.pending_action_window.type).toBe('when_action_card_played')
      expect(windowUpdate.pending_action_window.eligible_player_ids).toContain(XXCHA_PLAYER_ID)
      expect(windowUpdate.pending_action_window.passed_player_ids).toEqual([])
      expect(windowUpdate.pending_action_window.context.card_id).toBe(CARD_ID)
      expect(windowUpdate.pending_action_window.context.playing_player_id).toBe(CALLER_PLAYER_ID)
    })

    it('does not open a window when no player has Instinct Training', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: XXCHA_PLAYER_ID,
          technologies: ['Neural Motivator'],
          exhausted_technologies: [],
          command_tokens: { strategy: 1 },
        },
      ]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.instinct_training_window).toBeUndefined()
      // No games update for pending_action_window
      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeUndefined()
    })

    it('does not open a window when Instinct Training is exhausted', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: XXCHA_PLAYER_ID,
          technologies: ['Instinct Training'],
          exhausted_technologies: ['Instinct Training'],
          command_tokens: { strategy: 1 },
        },
      ]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))

      expect(res.status).toBe(200)
      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeUndefined()
    })

    it('does not open a window when Xxcha has no strategy tokens', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: XXCHA_PLAYER_ID,
          technologies: ['Instinct Training'],
          exhausted_technologies: [],
          command_tokens: { strategy: 0 },
        },
      ]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))

      expect(res.status).toBe(200)
      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeUndefined()
    })
  })
})
