import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'

const GAME_ID = 'game-uuid'
const HOLDER_PLAYER_ID = 'holder-player-uuid'
const ORIGIN_PLAYER_ID = 'origin-player-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'

function makeCtx(overrides = {}) {
  return {
    gameId: GAME_ID,
    activatingPlayerId: HOLDER_PLAYER_ID,
    noteOriginPlayerId: ORIGIN_PLAYER_ID,
    noteInstanceId: NOTE_INSTANCE_ID,
    selections: {},
    ...overrides,
  }
}

// Builds a chainable db.from mock that returns the given data/error for maybeSingle/update/upsert queries.
function makeChain({ data = null, error = null } = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  // make update return a chain that has eq and resolves
  chain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error }),
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  })
  return chain
}

// ---------------------------------------------------------------------------
// giftOfPrescience
// ---------------------------------------------------------------------------

describe('giftOfPrescience', () => {
  it('sets naalu_zero: true metadata on the note instance', async () => {
    let updatedId = null
    let updatedMeta = null
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_player_promissory_notes') {
          return {
            update: vi.fn((meta) => {
              updatedMeta = meta
              return {
                eq: vi.fn((col, val) => {
                  if (col === 'id') updatedId = val
                  return Promise.resolve({ error: null })
                }),
              }
            }),
          }
        }
      }),
    }

    const ctx = makeCtx({ noteInstanceId: NOTE_INSTANCE_ID })
    await resolvePromissoryHandler('giftOfPrescience', ctx, db)
    expect(updatedId).toBe(NOTE_INSTANCE_ID)
    expect(updatedMeta).toEqual({ metadata: { naalu_zero: true } })
  })

  it('throws if noteInstanceId is missing', async () => {
    const db = { from: vi.fn() }
    const ctx = makeCtx({ noteInstanceId: undefined })
    await expect(resolvePromissoryHandler('giftOfPrescience', ctx, db)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// politicalSecret
// ---------------------------------------------------------------------------

describe('politicalSecret', () => {
  it('upserts vote_prevented on origin and sets political_secret_blocked_player_id on game', async () => {
    const upsertedData = []
    const gameUpdates = []
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_agenda_votes') {
          return {
            upsert: vi.fn((data) => {
              upsertedData.push(data)
              return Promise.resolve({ error: null })
            }),
          }
        }
        if (table === 'games') {
          return {
            update: vi.fn((data) => {
              gameUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('politicalSecret', makeCtx(), db)

    expect(upsertedData[0]).toMatchObject({
      game_id: GAME_ID,
      game_player_id: ORIGIN_PLAYER_ID,
      vote_prevented: true,
    })
    expect(gameUpdates[0]).toEqual({ political_secret_blocked_player_id: ORIGIN_PLAYER_ID })
  })

  it('throws if noteOriginPlayerId is missing', async () => {
    const db = { from: vi.fn() }
    const ctx = makeCtx({ noteOriginPlayerId: undefined })
    await expect(resolvePromissoryHandler('politicalSecret', ctx, db)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// politicalFavor
// ---------------------------------------------------------------------------

describe('politicalFavor', () => {
  it('decrements origin strategy token and replaces agenda card', async () => {
    const originTokens = { tactic_total: 2, fleet: 2, strategy: 1 }
    const playerUpdates = []
    const agendaUpdates = []
    const gameUpdates = []

    const db = {
      from: vi.fn((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { command_tokens: originTokens },
                  error: null,
                }),
              }),
            }),
            update: vi.fn((data) => {
              playerUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { agenda_current_card_id: 'current-agenda-id' },
                  error: null,
                }),
              }),
            }),
            update: vi.fn((data) => {
              gameUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        if (table === 'game_agenda_deck') {
          return {
            update: vi.fn((data) => {
              agendaUpdates.push(data)
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'new-agenda-id' }, error: null }),
                    }),
                  }),
                }),
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'new-agenda-id' }, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'new-agenda-id' }, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('politicalFavor', makeCtx(), db)

    // Origin strategy token decremented by 1
    expect(playerUpdates[0]).toEqual({
      command_tokens: { tactic_total: 2, fleet: 2, strategy: 0 },
    })
    // Agenda replaced
    expect(gameUpdates).toContainEqual({ agenda_current_card_id: 'new-agenda-id' })
  })

  it('throws if origin has no strategy tokens', async () => {
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { command_tokens: { tactic_total: 2, fleet: 2, strategy: 0 } },
                  error: null,
                }),
              }),
            }),
          }
        }
      }),
    }
    await expect(resolvePromissoryHandler('politicalFavor', makeCtx(), db)).rejects.toThrow()
  })

  it('throws if noteOriginPlayerId is missing', async () => {
    await expect(
      resolvePromissoryHandler('politicalFavor', makeCtx({ noteOriginPlayerId: undefined }), { from: vi.fn() })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// acquiescence
// ---------------------------------------------------------------------------

describe('acquiescence', () => {
  it('swaps strategy card assignments between holder and origin', async () => {
    const MY_CARD = 'card-holder-uuid'
    const THEIR_CARD = 'card-origin-uuid'
    const updates = []
    let fromCallCount = 0

    const db = {
      from: vi.fn((table) => {
        if (table === 'game_strategy_card_assignments') {
          fromCallCount++
          const callNum = fromCallCount
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(
                    callNum === 1
                      ? { data: { id: 'my-row', strategy_card_id: MY_CARD }, error: null }
                      : { data: { id: 'their-row', strategy_card_id: THEIR_CARD }, error: null }
                  ),
                }),
              }),
            }),
            update: vi.fn((data) => {
              updates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('acquiescence', makeCtx(), db)

    expect(updates).toHaveLength(2)
    // holder gets origin's card
    expect(updates[0]).toEqual({ strategy_card_id: THEIR_CARD })
    // origin gets holder's card
    expect(updates[1]).toEqual({ strategy_card_id: MY_CARD })
  })

  it('throws if strategy card not assigned', async () => {
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_strategy_card_assignments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }
        }
      }),
    }
    await expect(resolvePromissoryHandler('acquiescence', makeCtx(), db)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// firesOfTheGashlai
// ---------------------------------------------------------------------------

describe('firesOfTheGashlai', () => {
  it('decrements origin strategy token and grants Magmus Reactor II to holder', async () => {
    const playerUpdates = []

    const db = {
      from: vi.fn((table) => {
        if (table === 'game_players') {
          let callCount = 0
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => {
                  callCount++
                  if (callCount === 1) {
                    // origin player query
                    return Promise.resolve({
                      data: { command_tokens: { tactic_total: 2, fleet: 2, strategy: 1 } },
                      error: null,
                    })
                  }
                  // holder player query
                  return Promise.resolve({
                    data: { technologies: [] },
                    error: null,
                  })
                }),
              }),
            }),
            update: vi.fn((data) => {
              playerUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('firesOfTheGashlai', makeCtx(), db)

    // Origin strategy token decremented
    expect(playerUpdates[0]).toEqual({
      command_tokens: { tactic_total: 2, fleet: 2, strategy: 0 },
    })
    // Holder gets Magmus Reactor II
    expect(playerUpdates[1]).toEqual({ technologies: ['Magmus Reactor II'] })
  })

  it('throws if origin has no strategy tokens', async () => {
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { command_tokens: { strategy: 0 } },
                  error: null,
                }),
              }),
            }),
          }
        }
      }),
    }
    await expect(resolvePromissoryHandler('firesOfTheGashlai', makeCtx(), db)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// creussIff
// ---------------------------------------------------------------------------

describe('creussIff', () => {
  it('upserts creuss wormhole_type into target system state', async () => {
    const TARGET_KEY = '3,-2'
    let upsertedData = null
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_system_state') {
          return {
            upsert: vi.fn((data) => {
              upsertedData = data
              return Promise.resolve({ error: null })
            }),
          }
        }
      }),
    }

    const ctx = makeCtx({ selections: { target_system_key: TARGET_KEY } })
    await resolvePromissoryHandler('creussIff', ctx, db)

    expect(upsertedData).toMatchObject({
      game_id: GAME_ID,
      system_key: TARGET_KEY,
      wormhole_type: 'creuss',
    })
  })

  it('throws if target_system_key is missing', async () => {
    await expect(
      resolvePromissoryHandler('creussIff', makeCtx({ selections: {} }), { from: vi.fn() })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// terraform
// ---------------------------------------------------------------------------

describe('terraform', () => {
  it('sets terraform_attached on planet and stores planet_name in metadata', async () => {
    const PLANET = 'Elysium'
    const planetUpdates = []
    const metaUpdates = []
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_player_planets') {
          return {
            update: vi.fn((data) => {
              planetUpdates.push(data)
              return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
            }),
          }
        }
        if (table === 'game_player_promissory_notes') {
          return {
            update: vi.fn((data) => {
              metaUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }),
    }

    const ctx = makeCtx({ selections: { planet_name: PLANET } })
    await resolvePromissoryHandler('terraform', ctx, db)

    expect(planetUpdates[0]).toEqual({ terraform_attached: true })
    expect(metaUpdates[0]).toEqual({ metadata: { planet_name: PLANET } })
  })

  it('throws if planet_name is missing', async () => {
    await expect(
      resolvePromissoryHandler('terraform', makeCtx({ selections: {} }), { from: vi.fn() })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// warFunding
// ---------------------------------------------------------------------------

describe('warFunding', () => {
  it('decrements origin TGs by 2 and sets reroll_allowed_player_id to holder', async () => {
    const playerUpdates = []
    const combatUpdates = []

    const db = {
      from: vi.fn((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { trade_goods: 5 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn((data) => {
              playerUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        if (table === 'game_combats') {
          return {
            update: vi.fn((data) => {
              combatUpdates.push(data)
              return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
            }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('warFunding', makeCtx(), db)

    expect(playerUpdates[0]).toEqual({ trade_goods: 3 })
    expect(combatUpdates[0]).toEqual({ reroll_allowed_player_id: HOLDER_PLAYER_ID })
  })

  it('clamps TGs to 0 if origin has fewer than 2', async () => {
    const playerUpdates = []
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { trade_goods: 1 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn((data) => {
              playerUpdates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        if (table === 'game_combats') {
          return {
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('warFunding', makeCtx(), db)
    expect(playerUpdates[0]).toEqual({ trade_goods: 0 })
  })
})

// ---------------------------------------------------------------------------
// tekklarLegion
// ---------------------------------------------------------------------------

describe('tekklarLegion', () => {
  it('sets tekklar_holder_player_id to holder on active combat', async () => {
    let updatedData = null
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_combats') {
          return {
            update: vi.fn((data) => {
              updatedData = data
              return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
            }),
          }
        }
      }),
    }

    await resolvePromissoryHandler('tekklarLegion', makeCtx(), db)
    expect(updatedData).toEqual({ tekklar_holder_player_id: HOLDER_PLAYER_ID })
  })
})

// ---------------------------------------------------------------------------
// theCavalry
// ---------------------------------------------------------------------------

describe('theCavalry', () => {
  const UNIT_ID = 'unit-flagship-uuid'

  it('sets cavalry_active_player_id and cavalry_unit_id on active combat', async () => {
    let updatedData = null
    const db = {
      from: vi.fn((table) => {
        if (table === 'game_combats') {
          return {
            update: vi.fn((data) => {
              updatedData = data
              return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
            }),
          }
        }
      }),
    }

    const ctx = makeCtx({ selections: { unit_id: UNIT_ID } })
    await resolvePromissoryHandler('theCavalry', ctx, db)

    expect(updatedData).toEqual({
      cavalry_active_player_id: HOLDER_PLAYER_ID,
      cavalry_unit_id: UNIT_ID,
    })
  })

  it('throws if unit_id is missing', async () => {
    await expect(
      resolvePromissoryHandler('theCavalry', makeCtx({ selections: {} }), { from: vi.fn() })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Model B no-ops
// ---------------------------------------------------------------------------

describe('Model B passive handlers (no-op)', () => {
  const modelBKeys = ['tradeConvoys', 'promiseOfProtection', 'bloodPact', 'darkPact', 'stymie', 'antivirus']

  modelBKeys.forEach((key) => {
    it(`${key} resolves without error and makes no DB calls`, async () => {
      const db = { from: vi.fn() }
      await expect(resolvePromissoryHandler(key, makeCtx(), db)).resolves.toBeUndefined()
      expect(db.from).not.toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// Model D no-ops
// ---------------------------------------------------------------------------

describe('Model D trigger-point handlers (no-op in promissoryHandlers)', () => {
  const modelDKeys = [
    'ceasefire',
    'researchAgreement',
    'cyberneticEnhancements',
    'militarySupport',
    'raghsCall',
    'greyfireMutagen',
    'spyNet',
    'scepterOfDominion',
    'strikeWingAmbuscade',
    'crucible',
  ]

  modelDKeys.forEach((key) => {
    it(`${key} resolves without error (handled by trigger functions)`, async () => {
      const db = { from: vi.fn() }
      await expect(resolvePromissoryHandler(key, makeCtx(), db)).resolves.toBeUndefined()
    })
  })
})
