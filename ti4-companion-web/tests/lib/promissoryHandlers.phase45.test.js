import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  applyAbility: vi.fn().mockResolvedValue({ gainedRelicName: null }),
  dslError: (msg, status) => Object.assign(new Error(msg), { status: status ?? 400 }),
}))
vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  applyOnGainRelicEffect: vi.fn().mockResolvedValue(undefined),
}))

import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'

const GAME_ID = 'game-uuid'
const HOLDER_ID = 'holder-uuid'
const ORIGIN_ID = 'origin-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'

function makeCtx(overrides = {}) {
  return {
    gameId: GAME_ID,
    activatingPlayerId: HOLDER_ID,
    noteOriginPlayerId: ORIGIN_ID,
    noteInstanceId: NOTE_INSTANCE_ID,
    selections: {},
    ...overrides,
  }
}

// ── no-op stubs ──────────────────────────────────────────────────────────────

describe('supportForThrone no-op', () => {
  it('resolves without throwing', async () => {
    const db = { from: vi.fn() }
    await expect(resolvePromissoryHandler('supportForThrone', makeCtx(), db)).resolves.toBeUndefined()
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('alliance no-op', () => {
  it('resolves without throwing', async () => {
    const db = { from: vi.fn() }
    await expect(resolvePromissoryHandler('alliance', makeCtx(), db)).resolves.toBeUndefined()
  })
})

describe('tradeAgreement no-op', () => {
  it('resolves without throwing', async () => {
    const db = { from: vi.fn() }
    await expect(resolvePromissoryHandler('tradeAgreement', makeCtx(), db)).resolves.toBeUndefined()
  })
})

// ── terraform ────────────────────────────────────────────────────────────────

describe('terraform', () => {
  const PLANET_ROW_ID = 'planet-row-uuid'
  const ATTACHMENT_ID = 'attachment-uuid'

  function makeTerraformDb({ planetRow = { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'blue' } }, attachmentRow = { id: ATTACHMENT_ID } } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'game_player_planets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: planetRow, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'attachments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: attachmentRow, error: null }),
          }
        }
        if (table === 'game_player_promissory_notes') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    }
  }

  it('409 when planet not controlled by activating player', async () => {
    const db = makeTerraformDb({ planetRow: null })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Hopestone' } }), db).catch(e => e)
    expect(err.message).toMatch(/not controlled/i)
    expect(err.status).toBe(409)
  })

  it('409 when tile type is faction (home planet)', async () => {
    const db = makeTerraformDb({ planetRow: { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'faction' } } })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Trykk' } }), db).catch(e => e)
    expect(err.message).toMatch(/home planet/i)
  })

  it('409 when planet is Mecatol Rex', async () => {
    const db = makeTerraformDb()
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Mecatol Rex' } }), db).catch(e => e)
    expect(err.message).toMatch(/Mecatol Rex/i)
  })

  it('409 when attachment already applied', async () => {
    const db = makeTerraformDb({ planetRow: { id: PLANET_ROW_ID, attachments: [ATTACHMENT_ID], tiles: { type: 'blue' } } })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Hopestone' } }), db).catch(e => e)
    expect(err.message).toMatch(/already attached/i)
  })

  it('happy path: queries planet by activating player (not origin player)', async () => {
    const db = makeTerraformDb()
    await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Hopestone' } }), db)
    const planetCalls = db.from.mock.calls.filter(([t]) => t === 'game_player_planets')
    expect(planetCalls.length).toBeGreaterThan(0)
  })
})

// ── blackMarketForgery ───────────────────────────────────────────────────────

describe('blackMarketForgery', () => {
  const FRAG_1 = 'frag-1-uuid'
  const FRAG_2 = 'frag-2-uuid'

  function makeBMFDb({ fragments = [
    { id: FRAG_1, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
  ] } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'game_exploration_decks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: fragments, error: null }),
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    applyAbility.mockResolvedValue({ gainedRelicName: 'Shard of the Throne' })
    applyOnGainRelicEffect.mockResolvedValue(undefined)
  })

  it('400 when fragment_ids missing from selections', async () => {
    const db = makeBMFDb()
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: {} }), db).catch(e => e)
    expect(err.status).toBe(400)
  })

  it('400 when fragment_ids length is not 2', async () => {
    const db = makeBMFDb()
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1] } }), db).catch(e => e)
    expect(err.status).toBe(400)
  })

  it('409 when fragment not found (DB returns fewer than 2 rows)', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/not found/i)
    expect(err.status).toBe(409)
  })

  it('409 when fragment not owned by activating player', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'held', resolved_by_player_id: 'someone-else', relic_fragment_type: 'cultural' },
      { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/not owned/i)
  })

  it('409 when fragment state is not held', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'discarded', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
      { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/not in hand/i)
  })

  it('409 when fragments are different types', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
      { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'hazardous' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/same type/i)
  })

  it('happy path: discards both fragments and calls applyAbility gain_relic', async () => {
    const db = makeBMFDb()
    await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db)
    expect(applyAbility).toHaveBeenCalledWith([{ op: 'gain_relic' }], expect.anything(), db)
    expect(applyOnGainRelicEffect).toHaveBeenCalledWith('Shard of the Throne', expect.anything(), db)
  })

  it('happy path: does not call applyOnGainRelicEffect when no relic gained', async () => {
    applyAbility.mockResolvedValue({ gainedRelicName: null })
    const db = makeBMFDb()
    await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db)
    expect(applyOnGainRelicEffect).not.toHaveBeenCalled()
  })
})
