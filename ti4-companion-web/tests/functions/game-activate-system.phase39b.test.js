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
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  AGENT_REACTIVE_TRIGGERS: {},
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn(),
  getActiveNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const GAME_ID = 'game-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const OWNER_ID = 'owner-uuid'
const HOLDER_ID = 'holder-uuid'
const SYSTEM_KEY = '0,0'
const TILE_ID = 'tile-uuid'
const ACTIVATION_ID = 'activation-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
  technologies: [],
  exhausted_technologies: [],
  trade_goods: 0,
  promissory_notes: [],
}

const BASE_GAME = {
  id: GAME_ID,
  active_player_id: PLAYER_ID,
  round: 1,
  map_tiles: { [SYSTEM_KEY]: { tile_id: TILE_ID } },
}

const PLAIN_TILE = { id: TILE_ID, wormhole: null, anomalies: [] }

/**
 * Build a standard db mock for the activate-system flow.
 * spaceUnits: array of { player_id, unit_type, count, system_key }
 * updateMocks: captured update calls (optional array)
 * activationInsertSelectData: data returned from the insert().select() chain
 */
function buildDbMock({
  callerPlayer = BASE_PLAYER,
  game = BASE_GAME,
  tiles = [PLAIN_TILE],
  allGamePlayers = [BASE_PLAYER],
  spaceUnits = [],
  activationSelectData = [{ id: ACTIVATION_ID }],
  activationUpdateMocks = null,
} = {}) {
  let gamePlayersCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const call = gamePlayersCallCount
      if (call === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
              }),
            }),
          }),
        }
      } else if (call === 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: allGamePlayers, error: null }),
          }),
        }
      } else {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      const updateFn = vi.fn().mockImplementation((data) => {
        if (activationUpdateMocks) activationUpdateMocks.push({ data })
        return { eq: vi.fn().mockResolvedValue({ error: null }) }
      })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: activationSelectData, error: null }),
        }),
        update: updateFn,
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: spaceUnits, error: null }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
        }),
      }
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  // Default: no held notes, no active notes
  getHeldNotes.mockResolvedValue([])
  getActiveNotes.mockResolvedValue({
    supportForThrone: [],
    alliance: [],
    tradeConvoys: [],
    promiseOfProtection: [],
    bloodPact: [],
    darkPact: [],
    stymie: [],
    antivirus: [],
    giftOfPrescience: [],
    tradeAgreement: [],
    crucible: [],
    strikeWingAmbuscade: [],
  })
  returnNote.mockResolvedValue(undefined)
})

describe('game-activate-system Phase 39b — Ceasefire', () => {
  it('Ceasefire held, owner activates, holder has units in system → 409', async () => {
    // PLAYER_ID is the activating player (owner). HOLDER_ID is someone else holding the note.
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Ceasefire') {
        return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }]
      }
      return []
    })

    buildDbMock({
      spaceUnits: [
        { player_id: HOLDER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY },
      ],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/ceasefire/i)
    // Note should be consumed (returned) before the 409 is sent
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, PLAYER_ID, expect.anything())
  })

  it('Ceasefire held, owner activates, holder has NO units in system → proceeds normally', async () => {
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Ceasefire') {
        return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }]
      }
      return []
    })

    buildDbMock({
      // Holder has units elsewhere, not in the activated system
      spaceUnits: [
        { player_id: HOLDER_ID, unit_type: 'cruiser', count: 1, system_key: '5,5' },
      ],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
  })
})

describe('game-activate-system Phase 39b — Greyfire Mutagen', () => {
  it('Greyfire Mutagen held, any activation → faction_abilities_blocked set to owner; note returned', async () => {
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Greyfire Mutagen') {
        return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }]
      }
      return []
    })

    const activationUpdates = []
    buildDbMock({ activationUpdateMocks: activationUpdates })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)

    // Should have updated the activation row with faction_abilities_blocked_player_id
    const blockedUpdate = activationUpdates.find(
      (u) => u.data?.faction_abilities_blocked_player_id !== undefined
    )
    expect(blockedUpdate).toBeDefined()
    expect(blockedUpdate.data.faction_abilities_blocked_player_id).toBe(OWNER_ID)

    // Should have returned the note
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, OWNER_ID, expect.anything())
  })
})

describe('game-activate-system Phase 39b — Crucible', () => {
  it('Crucible held, holder is the activating player → gravity_rift_immune set; note returned', async () => {
    // PLAYER_ID is activating (they hold the note). OWNER_ID is the original owner.
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Crucible') {
        return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }]
      }
      return []
    })

    const activationUpdates = []
    buildDbMock({ activationUpdateMocks: activationUpdates })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)

    const immuneUpdate = activationUpdates.find(
      (u) => u.data?.gravity_rift_immune_player_id !== undefined
    )
    expect(immuneUpdate).toBeDefined()
    expect(immuneUpdate.data.gravity_rift_immune_player_id).toBe(PLAYER_ID)

    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, OWNER_ID, expect.anything())
  })

  it('Crucible held, holder is NOT the activating player → no immune set, note not returned', async () => {
    // HOLDER_ID is a different player, not the one activating
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === 'Crucible') {
        return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: HOLDER_ID }]
      }
      return []
    })

    const activationUpdates = []
    buildDbMock({ activationUpdateMocks: activationUpdates })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)

    const immuneUpdate = activationUpdates.find(
      (u) => u.data?.gravity_rift_immune_player_id !== undefined
    )
    expect(immuneUpdate).toBeUndefined()
    expect(returnNote).not.toHaveBeenCalled()
  })
})

describe('game-activate-system Phase 39b — Model B in_play notes', () => {
  it('in_play note, holder activates system where owner has units → note returned', async () => {
    // PLAYER_ID is the holder. OWNER_ID is the note owner with units in the activated system.
    getActiveNotes.mockResolvedValue({
      supportForThrone: [],
      alliance: [],
      tradeConvoys: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }],
      promiseOfProtection: [],
      bloodPact: [],
      darkPact: [],
      stymie: [],
      antivirus: [],
      giftOfPrescience: [],
      tradeAgreement: [],
      crucible: [],
      strikeWingAmbuscade: [],
    })

    buildDbMock({
      spaceUnits: [
        { player_id: OWNER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY },
      ],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, OWNER_ID, expect.anything())
  })

  it('in_play note, holder activates system where owner has NO units → note not returned', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [],
      alliance: [],
      tradeConvoys: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }],
      promiseOfProtection: [],
      bloodPact: [],
      darkPact: [],
      stymie: [],
      antivirus: [],
      giftOfPrescience: [],
      tradeAgreement: [],
      crucible: [],
      strikeWingAmbuscade: [],
    })

    buildDbMock({
      // Owner has no units in the activated system
      spaceUnits: [],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalled()
  })

  it('in_play note, a different player (not holder) activates → note not returned', async () => {
    // HOLDER_ID holds the note; PLAYER_ID is activating (different player)
    getActiveNotes.mockResolvedValue({
      supportForThrone: [],
      alliance: [],
      promiseOfProtection: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: HOLDER_ID }],
      tradeConvoys: [],
      bloodPact: [],
      darkPact: [],
      stymie: [],
      antivirus: [],
      giftOfPrescience: [],
      tradeAgreement: [],
      crucible: [],
      strikeWingAmbuscade: [],
    })

    buildDbMock({
      spaceUnits: [
        { player_id: OWNER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY },
      ],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalled()
  })
})
