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
  EVT_RESEARCH_TECH: 'research_technology',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const HOLDER_ID = 'holder-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'

const NON_FACTION_TECH = {
  name: 'Neural Motivator',
  technology_type: 'green',
  prerequisites: {},
  expansion: 'base',
}

const FACTION_TECH = {
  name: 'Quantum Entanglement',
  technology_type: 'faction',
  prerequisites: {},
  expansion: 'base',
}

function makeRequest(body) {
  return new Request('http://localhost/game-research-technology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let holderUpdateEqMock

function mockDb({ tech = NON_FACTION_TECH, holderTechs = [] } = {}) {
  holderUpdateEqMock = vi.fn().mockResolvedValue({ error: null })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { status: 'active', expansions: { base: true } },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'technologies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols && cols.includes('technologies') && !cols.includes('exhausted')) {
            // holder player query
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { technologies: holderTechs },
                  error: null,
                }),
              }),
            }
          }
          // main player query
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
                  error: null,
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockImplementation(() => ({ eq: holderUpdateEqMock })),
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-research-technology Phase 39b — Research Agreement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('Research Agreement held, Jol-Nar researches non-faction tech → holder also gets tech; note returned', async () => {
    const note = { instanceId: NOTE_INSTANCE_ID, holderPlayerId: HOLDER_ID, ownerPlayerId: PLAYER_ID }
    getHeldNotes.mockResolvedValue([note])
    mockDb({ tech: NON_FACTION_TECH, holderTechs: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator', bypass_prerequisites: true }))
    expect(res.status).toBe(200)

    expect(getHeldNotes).toHaveBeenCalledWith(GAME_ID, 'Research Agreement', expect.anything())
    // Holder player should have received the tech (update called with holder's id)
    expect(holderUpdateEqMock).toHaveBeenCalledWith('id', HOLDER_ID)
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, PLAYER_ID, expect.anything())
  })

  it('Research Agreement held, Jol-Nar researches faction tech → no grant, no returnNote', async () => {
    const note = { instanceId: NOTE_INSTANCE_ID, holderPlayerId: HOLDER_ID, ownerPlayerId: PLAYER_ID }
    getHeldNotes.mockResolvedValue([note])
    mockDb({ tech: FACTION_TECH, holderTechs: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Quantum Entanglement', bypass_prerequisites: true }))
    expect(res.status).toBe(200)

    // Holder player should NOT have received the tech (update never called with holder's id)
    expect(holderUpdateEqMock).not.toHaveBeenCalledWith('id', HOLDER_ID)
    expect(returnNote).not.toHaveBeenCalled()
  })

  it('Research Agreement not held → no grant, no returnNote', async () => {
    getHeldNotes.mockResolvedValue([])
    mockDb({ tech: NON_FACTION_TECH })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator', bypass_prerequisites: true }))
    expect(res.status).toBe(200)

    expect(returnNote).not.toHaveBeenCalled()
  })
})
