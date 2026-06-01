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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_RESOLVE_ABILITY: 'resolve_ability',
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
}))

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  AGENT_ABILITIES: {},
  HERO_ABILITIES: {},
  AGENT_REACTIVE_TRIGGERS: {},
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const GAME_ID = 'game-1'
const USER_ID = 'user-1'
const PLAYER_ID = 'player-1'
const OWNER_ID = 'player-2'
const TARGET_ID = 'player-3'
const ABILITY_ID = 'ability-1'

const DSL_ABILITY = {
  id: ABILITY_ID,
  ability_name: 'Test Ability',
  trigger: { timing: 'action' },
  effects: [{ op: 'gain_trade_goods', amount: 1 }],
  handler: null,
  exhausts_source: false,
  purges_source: false,
}

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', ...body }),
  })
}

function setupDefaultDb(abilityOverrides = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'ability_definitions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY, ...abilityOverrides }, error: null }),
          }),
        }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

describe('game-resolve-ability Phase 39b — promissory note enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    vi.mocked(getActiveNotes).mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
  })

  it('no relevant notes in_play → resolves normally (200)', async () => {
    setupDefaultDb()
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(200)
  })

  it('Promise of Protection in_play: Mentak pillages the holder → 409', async () => {
    setupDefaultDb({ ability_key: 'pillage' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: TARGET_ID }],
      antivirus: [], bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Promise of Protection blocks Pillage/i)
  })

  it('Promise of Protection does NOT block if target is not the holder', async () => {
    setupDefaultDb({ ability_key: 'pillage' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: 'some-other-player' }],
      antivirus: [], bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(200)
  })

  it('Antivirus in_play: Nekro uses Technological Singularity on holder → 409', async () => {
    setupDefaultDb({ ability_key: 'technological_singularity' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [],
      antivirus: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: TARGET_ID }],
      bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Antivirus blocks Technological Singularity/i)
  })

  it('Antivirus does NOT block if target is not the holder', async () => {
    setupDefaultDb({ ability_key: 'technological_singularity' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [],
      antivirus: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: 'some-other-player' }],
      bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(200)
  })

  it('Alliance in_play: holder uses use_commander → resolves (200)', async () => {
    setupDefaultDb({ ability_key: 'use_commander' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [{ ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }],
      supportForThrone: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { faction: 'The Federation Of Sol' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'ability_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY, ability_key: 'use_commander' }, error: null }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest({}))
    expect(res.status).toBe(200)
  })
})
