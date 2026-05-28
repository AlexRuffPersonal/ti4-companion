import { describe, it, expect, vi } from 'vitest'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'

// Build a mock db that returns `player` on game_players select and tracks updates.
function makeDb({ player = { id: 'p1', trade_goods: 3, commodities: 2, vp: 5, technologies: [], action_card_count: 0 }, updateError = null, deckCard = null } = {}) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: updateError }) }
  const updateMock = vi.fn().mockReturnValue(updateChain)

  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: deckCard, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      return {}
    }),
  }
  return { db, updateMock, updateChain }
}

const CTX = { gameId: 'g1', activatingPlayerId: 'p1' }

describe('interpretEffects', () => {
  it('gain_trade_goods adds amount to player trade_goods', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 3, commodities: 2, vp: 5, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'gain_trade_goods', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 5 })
  })

  it('spend_trade_goods subtracts chosen_amount from trade_goods', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 5, commodities: 0, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'spend_trade_goods', amount: 'chosen_amount' }], { ...CTX, chosenAmount: 3 }, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 2 })
  })

  it('spend_trade_goods does not go below 0', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 1, commodities: 0, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'spend_trade_goods', amount: 5 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 0 })
  })

  it('gain_vp increments vp', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 4, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'gain_vp', amount: 1 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ vp: 5 })
  })

  it('lose_vp does not go below 0', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'lose_vp', amount: 1 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ vp: 0 })
  })

  it('gain_commodities increments commodities', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 2, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'gain_commodities', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ commodities: 4 })
  })

  it('choose_one executes the op at chosenOption index', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 2, commodities: 0, vp: 3, technologies: [], action_card_count: 0 } })
    await interpretEffects(
      [{ op: 'choose_one', options: [{ op: 'gain_vp', amount: 1 }, { op: 'gain_trade_goods', amount: 2 }] }],
      { ...CTX, chosenOption: 1 },
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 4 })
  })

  it('choose_one defaults to index 0 when chosenOption is undefined', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 3, technologies: [], action_card_count: 0 } })
    await interpretEffects(
      [{ op: 'choose_one', options: [{ op: 'gain_vp', amount: 1 }, { op: 'gain_trade_goods', amount: 2 }] }],
      CTX,
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ vp: 4 })
  })

  it('throws on unknown op', async () => {
    const { db } = makeDb()
    await expect(
      interpretEffects([{ op: 'unknown_op_xyz' }], CTX, db)
    ).rejects.toThrow('Unknown op: unknown_op_xyz')
  })
})

// ── Phase 29a ops ─────────────────────────────────────────────────────────────

describe('exhaust_planet', () => {
  it('happy path: updates exhausted=true for owned planet', async () => {
    const planet = { id: 'planet-1' }
    const planetUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_planets') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: planet, error: null }) }) }) }) }),
          update: planetUpdateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'exhaust_planet' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    expect(planetUpdateMock).toHaveBeenCalledWith({ exhausted: true })
  })

  it('throws 409 when planet not owned', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_planets') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'exhaust_planet' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    ).rejects.toThrow('Planet not owned')
  })
})

describe('destroy_units_on_planet', () => {
  it('happy path: decrements count by requested amount', async () => {
    const unitRow = { id: 'u1', count: 3 }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_units') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: unitRow, error: null }) }) }) }) }) }),
          update: updateMock,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'destroy_units_on_planet', unit_type: 'infantry', count: 2 }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ count: 1 })
  })

  it('throws 409 when not enough units and up_to is not set', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_units') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'destroy_units_on_planet', unit_type: 'infantry', count: 2 }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    ).rejects.toThrow('Not enough units')
  })

  it('up_to=true with fewer units than count: destroys available amount', async () => {
    const unitRow = { id: 'u1', count: 1 }
    const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_units') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: unitRow, error: null }) }) }) }) }) }),
          delete: deleteMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'destroy_units_on_planet', unit_type: 'infantry', count: 3, up_to: true }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    expect(deleteMock).toHaveBeenCalled()
  })
})

describe('steal_action_card', () => {
  it('happy path: transfers card and updates counts', async () => {
    const card = { id: 'card-1' }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 2, command_tokens: {} }, error: null }) }) }),
          update: updateMock,
        }
        if (table === 'game_action_card_deck') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: card, error: null }) }) }) }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'steal_action_card' }], { ...CTX, selections: { target_player_id: 'p2' } }, db)
    expect(updateMock).toHaveBeenCalled()
  })

  it('throws 409 when target has no cards', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
        if (table === 'game_action_card_deck') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'steal_action_card' }], { ...CTX, selections: { target_player_id: 'p2' } }, db)
    ).rejects.toThrow('Target has no cards')
  })
})

describe('look_at_hand', () => {
  it('does not throw and makes no write calls', async () => {
    const updateMock = vi.fn()
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }), update: updateMock }
        return {}
      }),
    }
    await interpretEffects([{ op: 'look_at_hand' }], { ...CTX, selections: { target_player_id: 'p2' } }, db)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('modify_next_production', () => {
  it('increments production_bonus by op.amount', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, production_bonus: 0 }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'modify_next_production', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ production_bonus: 2 })
  })
})

describe('block_system_movement', () => {
  it('appends system_key to movement_blocked_systems', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'games') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { movement_blocked_systems: ['1,0'] }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'block_system_movement' }], { ...CTX, selections: { system_key: '2,0' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ movement_blocked_systems: ['1,0', '2,0'] })
  })
})

describe('place_unit_no_move', () => {
  it('inserts new unit row with no_move_this_round=true', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_units') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }) }),
          insert: insertMock,
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'place_unit_no_move' }], { ...CTX, selections: { system_key: '1,0' } }, db)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ no_move_this_round: true }))
  })

  it('increments count and sets no_move_this_round when unit already exists', async () => {
    const existing = { id: 'u1', count: 2 }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_player_units') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }) }) }) }) }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'place_unit_no_move' }], { ...CTX, selections: { system_key: '1,0' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ count: 3, no_move_this_round: true })
  })
})

describe('remove_tokens_from_board', () => {
  it('deletes activations for target player this round', async () => {
    const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'games') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { round: 2 }, error: null }) }) }) }
        if (table === 'game_system_activations') return { delete: deleteMock }
        return {}
      }),
    }
    await interpretEffects([{ op: 'remove_tokens_from_board' }], { ...CTX, selections: { target_player_id: 'p2' } }, db)
    expect(deleteMock).toHaveBeenCalled()
  })
})

describe('swap_strategy_cards', () => {
  it('happy path: swaps strategy_card_id between both rows', async () => {
    const myRow = { id: 'row-1', strategy_card_id: 'sc-a' }
    const theirRow = { id: 'row-2', strategy_card_id: 'sc-b' }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    let callIdx = 0
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_strategy_card_assignments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(() => {
                    callIdx++
                    return Promise.resolve({ data: callIdx === 1 ? myRow : theirRow, error: null })
                  }),
                }),
              }),
            }),
            update: updateMock,
          }
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'swap_strategy_cards' }], { ...CTX, selections: { target_player_id: 'p2' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ strategy_card_id: 'sc-b' })
    expect(updateMock).toHaveBeenCalledWith({ strategy_card_id: 'sc-a' })
  })

  it('throws 409 if either player has no strategy card assigned', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'game_strategy_card_assignments') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'swap_strategy_cards' }], { ...CTX, selections: { target_player_id: 'p2' } }, db)
    ).rejects.toThrow('Strategy card not assigned')
  })
})

// ── Phase 29b ops ─────────────────────────────────────────────────────────────

describe('replace_agenda', () => {
  function makeReplaceDb({ newCard = { id: 'card-2' } } = {}) {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    let gameCallCount = 0
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 3, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }) }
        if (table === 'games') {
          gameCallCount++
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { agenda_current_card_id: 'card-1' }, error: null }) }) }),
            update: updateMock,
          }
        }
        if (table === 'game_agenda_deck') return {
          update: updateMock,
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: newCard, error: null }) }) }) }) }) }),
        }
        return {}
      }),
    }
    return { db, updateMock }
  }

  it('replaces current agenda with next deck card', async () => {
    const { db, updateMock } = makeReplaceDb()
    await interpretEffects([{ op: 'replace_agenda' }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ state: 'discard' })
    expect(updateMock).toHaveBeenCalledWith({ state: 'revealed' })
    expect(updateMock).toHaveBeenCalledWith({ agenda_current_card_id: 'card-2' })
  })

  it('throws 409 if agenda deck is empty', async () => {
    const { db } = makeReplaceDb({ newCard: null })
    await expect(
      interpretEffects([{ op: 'replace_agenda' }], CTX, db)
    ).rejects.toThrow('Agenda deck empty')
  })
})

describe('add_votes', () => {
  function makeVotesDb({ tradGoods = 5 } = {}) {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: tradGoods, commodities: 0, vp: 0, technologies: [], action_card_count: 0 }, error: null }) }) }),
          update: updateMock,
        }
        if (table === 'games') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { agenda_current_card_id: 'ag-1' }, error: null }) }) }) }
        if (table === 'game_agenda_votes') return { upsert: upsertMock }
        return {}
      }),
    }
    return { db, updateMock, upsertMock }
  }

  it('decrements trade_goods and upserts vote row', async () => {
    const { db, updateMock, upsertMock } = makeVotesDb({ tradGoods: 5 })
    await interpretEffects([{ op: 'add_votes' }], { ...CTX, selections: { vote_count: 3, vote_outcome: 'For' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 2 })
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 3, choice: 'For' }),
      expect.anything()
    )
  })

  it('throws 409 when insufficient trade goods', async () => {
    const { db } = makeVotesDb({ tradGoods: 1 })
    await expect(
      interpretEffects([{ op: 'add_votes' }], { ...CTX, selections: { vote_count: 3, vote_outcome: 'For' } }, db)
    ).rejects.toThrow('Insufficient trade goods')
  })
})

describe('research_same_technology', () => {
  it('appends technology to player list', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Neural Motivator'], action_card_count: 0 }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'research_same_technology' }], { ...CTX, technology_name: 'Sling Relay' }, db)
    expect(updateMock).toHaveBeenCalledWith({ technologies: ['Neural Motivator', 'Sling Relay'] })
  })

  it('throws 409 if technology already researched', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Sling Relay'], action_card_count: 0 }, error: null }) }) }) }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'research_same_technology' }], { ...CTX, technology_name: 'Sling Relay' }, db)
    ).rejects.toThrow('Technology already researched')
  })
})

// ── Phase 37 ops ─────────────────────────────────────────────────────────────

const PLAYER_WITH_TOKENS = { id: 'p1', trade_goods: 0, commodities: 0, vp: 5, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } }

describe('spend_influence_for_tokens', () => {
  it('grants floor(inf/3) tokens and exhausts correct planets', async () => {
    const planets = [
      { id: 'pl-1', player_id: 'p1', influence: 4 },
      { id: 'pl-2', player_id: 'p1', influence: 2 },
    ] // total = 6, floor(6/3) = 2
    const planetUpdateMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
    const playerUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }),
          update: playerUpdateMock,
        }
        if (table === 'game_player_planets') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: planets, error: null }) }) }),
          update: planetUpdateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'spend_influence_for_tokens' }], {
      ...CTX,
      selections: { influence_planet_ids: ['Mecatol Rex', 'Archon Ren'], token_pool: 'tactic_total' }
    }, db)
    expect(planetUpdateMock).toHaveBeenCalledWith({ exhausted: true })
    expect(playerUpdateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 5, fleet: 2, strategy: 1 } })
  })

  it('no-op when planet list is empty', async () => {
    const playerUpdateMock = vi.fn()
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }),
          update: playerUpdateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'spend_influence_for_tokens' }], {
      ...CTX,
      selections: { influence_planet_ids: [] }
    }, db)
    expect(playerUpdateMock).not.toHaveBeenCalled()
  })

  it('throws 409 if a planet is not owned', async () => {
    const planets = [{ id: 'pl-1', player_id: 'p2', influence: 4 }] // owned by p2, not p1
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        if (table === 'game_player_planets') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: planets, error: null }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'spend_influence_for_tokens' }], {
        ...CTX,
        selections: { influence_planet_ids: ['Mecatol Rex'] }
      }, db)
    ).rejects.toThrow('Planet not owned')
  })
})

describe('diplomacy_lock_system', () => {
  it('inserts activations for all other players and decrements their tactic tokens', async () => {
    const otherPlayers = [
      { id: 'p2', command_tokens: { tactic_total: 2, fleet: 1, strategy: 1 } },
      { id: 'p3', command_tokens: { tactic_total: 1, fleet: 0, strategy: 0 } },
    ]
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const playerUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    let activationSelectCallIdx = 0
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockImplementation((cols) => {
              if (cols && cols === 'id, command_tokens') {
                // called for otherPlayers fetch
                return { eq: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }) }) }
              }
              // initial player fetch
              return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }
            }),
            update: playerUpdateMock,
          }
        }
        if (table === 'game_system_activations') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: insertMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'diplomacy_lock_system' }], {
      ...CTX,
      gameRound: 2,
      selections: { target_system_coords: '3,0' }
    }, db)
    expect(insertMock).toHaveBeenCalledTimes(2)
    expect(playerUpdateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 1, fleet: 1, strategy: 1 } })
    expect(playerUpdateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 0, fleet: 0, strategy: 0 } })
  })

  it('skips player already in system (existing activation row)', async () => {
    const otherPlayers = [{ id: 'p2', command_tokens: { tactic_total: 2, fleet: 1, strategy: 1 } }]
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols && cols === 'id, command_tokens') {
              return { eq: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }) }) }
            }
            return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        if (table === 'game_system_activations') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-1' }, error: null }),
                }),
              }),
            }),
          }),
          insert: insertMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'diplomacy_lock_system' }], {
      ...CTX,
      gameRound: 1,
      selections: { target_system_coords: '3,0' }
    }, db)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws 409 when target_system_coords missing', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'diplomacy_lock_system' }], { ...CTX, selections: {} }, db)
    ).rejects.toThrow('target_system_coords required')
  })
})

describe('grant_free_secondary', () => {
  it('updates strategy card play row with provided player ids', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        if (table === 'game_strategy_card_plays') return { update: updateMock }
        return {}
      }),
    }
    await interpretEffects([{ op: 'grant_free_secondary' }], {
      ...CTX,
      strategyPlayId: 'play-1',
      selections: { free_secondary_player_ids: ['p2', 'p3'] }
    }, db)
    expect(updateMock).toHaveBeenCalledWith({ free_secondary_player_ids: ['p2', 'p3'] })
  })

  it('no-op if strategyPlayId not set', async () => {
    const updateMock = vi.fn()
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        if (table === 'game_strategy_card_plays') return { update: updateMock }
        return {}
      }),
    }
    await interpretEffects([{ op: 'grant_free_secondary' }], {
      ...CTX,
      // no strategyPlayId
      selections: { free_secondary_player_ids: ['p2'] }
    }, db)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('warfare_remove_board_token', () => {
  it('deletes activation row and increments correct pool', async () => {
    const activation = { id: 'act-1' }
    const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const playerUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }),
          update: playerUpdateMock,
        }
        if (table === 'game_system_activations') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: activation, error: null }),
                  }),
                }),
              }),
            }),
          }),
          delete: deleteMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'warfare_remove_board_token' }], {
      ...CTX,
      gameRound: 1,
      selections: { remove_from_system_coords: '2,1', remove_to_pool: 'tactic_total' }
    }, db)
    expect(deleteMock).toHaveBeenCalled()
    expect(playerUpdateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 4, fleet: 2, strategy: 1 } })
  })

  it('throws 409 if no token in the specified system', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        if (table === 'game_system_activations') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'warfare_remove_board_token' }], {
        ...CTX,
        gameRound: 1,
        selections: { remove_from_system_coords: '2,1' }
      }, db)
    ).rejects.toThrow('No token to remove from that system')
  })
})

describe('warfare_redistribute_tokens', () => {
  it('updates command_tokens correctly', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'warfare_redistribute_tokens' }], {
      ...CTX,
      selections: { redistribution_tactic: 4, redistribution_fleet: 3, redistribution_strategy: 2 }
    }, db)
    expect(updateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 4, fleet: 3, strategy: 2 } })
  })

  it('throws 409 if token sum exceeds 16', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'warfare_redistribute_tokens' }], {
        ...CTX,
        selections: { redistribution_tactic: 7, redistribution_fleet: 7, redistribution_strategy: 7 }
      }, db)
    ).rejects.toThrow('Token total exceeds 16')
  })
})

describe('score_public_objective', () => {
  function makeScoreDb({ state = 'revealed', scoredBy = [], points = 1 } = {}) {
    const gameObj = { id: 'gobj-1', state, scored_by: scoredBy, objective_id: 'obj-1' }
    const refObj = { points }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }),
          update: updateMock,
        }
        if (table === 'game_public_objectives') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: gameObj, error: null }) }) }) }),
          update: updateMock,
        }
        if (table === 'public_objectives') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: refObj, error: null }) }) }),
        }
        return {}
      }),
    }
    return { db, updateMock }
  }

  it('scores if revealed and not yet scored', async () => {
    const { db, updateMock } = makeScoreDb({ state: 'revealed', scoredBy: [], points: 2 })
    await interpretEffects([{ op: 'score_public_objective' }], {
      ...CTX,
      selections: { public_objective_id: 'gobj-1' }
    }, db)
    expect(updateMock).toHaveBeenCalledWith({ scored_by: ['p1'] })
    expect(updateMock).toHaveBeenCalledWith({ vp: 7 }) // 5 + 2
  })

  it('no-op if public_objective_id not provided', async () => {
    const updateMock = vi.fn()
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: PLAYER_WITH_TOKENS, error: null }) }) }) }
        if (table === 'game_public_objectives') return { update: updateMock }
        return {}
      }),
    }
    await interpretEffects([{ op: 'score_public_objective' }], {
      ...CTX,
      selections: {}
    }, db)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws 409 if objective is not revealed', async () => {
    const { db } = makeScoreDb({ state: 'hidden' })
    await expect(
      interpretEffects([{ op: 'score_public_objective' }], {
        ...CTX,
        selections: { public_objective_id: 'gobj-1' }
      }, db)
    ).rejects.toThrow('Objective not available')
  })

  it('throws 409 if already scored by activating player', async () => {
    const { db } = makeScoreDb({ state: 'revealed', scoredBy: ['p1'] })
    await expect(
      interpretEffects([{ op: 'score_public_objective' }], {
        ...CTX,
        selections: { public_objective_id: 'gobj-1' }
      }, db)
    ).rejects.toThrow('Already scored this objective')
  })
})

// ── Phase 41 (shared-abilityDsl-p39) ops ──────────────────────────────────────

describe('convert_all_commodities', () => {
  it('converts all commodities to trade goods', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 1, commodities: 3, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'convert_all_commodities' }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ commodities: 0, trade_goods: 4 })
  })

  it('no-ops when commodities=0', async () => {
    const updateMock = vi.fn()
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 2, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'convert_all_commodities' }], CTX, db)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('spend_commodities', () => {
  it('deducts commodities by op.amount', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 2, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'spend_commodities', amount: 1 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ commodities: 1 })
  })

  it('throws 409 when player has fewer commodities than amount', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'spend_commodities', amount: 1 }], CTX, db)
    ).rejects.toThrow('Insufficient commodities')
  })
})

// ── Phase 39a ops ─────────────────────────────────────────────────────────────

describe('purge_relic_fragments', () => {
  function makePurgeDb({ fragmentRows = [], updateError = null } = {}) {
    const updateMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: updateError }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
        }
        if (table === 'game_exploration_decks') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: fragmentRows, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
        return {}
      }),
    }
    return { db, updateMock }
  }

  it('discards count rows when sufficient fragments held', async () => {
    const fragments = [{ id: 'frag-1' }, { id: 'frag-2' }]
    const { db, updateMock } = makePurgeDb({ fragmentRows: fragments })
    await interpretEffects(
      [{ op: 'purge_relic_fragments', count: 2 }],
      { ...CTX, selections: { fragment_type: 'cultural' } },
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ state: 'discarded', resolved_by_player_id: null })
  })

  it('409 Insufficient relic fragments when fewer rows', async () => {
    const { db } = makePurgeDb({ fragmentRows: [{ id: 'frag-1' }] })
    await expect(
      interpretEffects(
        [{ op: 'purge_relic_fragments', count: 2 }],
        { ...CTX, selections: { fragment_type: 'hazardous' } },
        db
      )
    ).rejects.toThrow('Insufficient relic fragments')
  })

  it('400/dslError when fragment_type missing from selections', async () => {
    const { db } = makePurgeDb({ fragmentRows: [] })
    await expect(
      interpretEffects(
        [{ op: 'purge_relic_fragments', count: 1 }],
        { ...CTX, selections: {} },
        db
      )
    ).rejects.toThrow('fragment_type must be cultural, hazardous, or industrial')
  })
})

describe('gain_command_token_choice', () => {
  it('adds 1 token to the chosen bucket', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'gain_command_token_choice' }], { ...CTX, selections: { command_token_bucket: 'fleet' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 } })
  })

  it('defaults to tactic_total when bucket not provided', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } }, error: null }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'gain_command_token_choice' }], { ...CTX, selections: {} }, db)
    expect(updateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 4, fleet: 2, strategy: 1 } })
  })

  it('throws 409 for an invalid bucket name', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'gain_command_token_choice' }], { ...CTX, selections: { command_token_bucket: 'invalid_bucket' } }, db)
    ).rejects.toThrow('Invalid command token bucket')
  })
})

// ── Phase 43a ops ─────────────────────────────────────────────────────────────

describe('reclaim_command_tokens', () => {
  it('deletes all activation rows for player', async () => {
    const activations = [{ id: 'act-1' }, { id: 'act-2' }]
    const deleteMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
        if (table === 'game_system_activations') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: activations, error: null }) }) }),
          delete: deleteMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'reclaim_command_tokens' }], CTX, db)
    expect(deleteMock).toHaveBeenCalled()
  })

  it('no-ops when no activations exist for player', async () => {
    const deleteMock = vi.fn()
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
        if (table === 'game_system_activations') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          delete: deleteMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'reclaim_command_tokens' }], CTX, db)
    expect(deleteMock).not.toHaveBeenCalled()
  })
})

describe('replace_ship', () => {
  function makeReplaceShipDb({ oldCost = 2, newCost = 3, sourceUnit = { id: 'u1', count: 1 }, existingNew = null } = {}) {
    const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    let unitSelectCount = 0
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
        if (table === 'units') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col, val) => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: val === 'Destroyer' ? { cost: oldCost } : { cost: newCost }, error: null }),
              })),
            })),
          }
        }
        if (table === 'game_player_units') {
          unitSelectCount++
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      is: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: unitSelectCount === 1 ? sourceUnit : existingNew, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: updateMock,
            delete: deleteMock,
            insert: insertMock,
          }
        }
        return {}
      }),
    }
    return { db, deleteMock, updateMock, insertMock }
  }

  it('throws 409 when new unit costs more than 2 above old', async () => {
    const { db } = makeReplaceShipDb({ oldCost: 2, newCost: 5 })
    await expect(
      interpretEffects([{ op: 'replace_ship' }], {
        ...CTX,
        selections: { chosen_player_id: 'p2', system_key: '1,0', old_unit_type: 'Destroyer', new_unit_type: 'Dreadnought' }
      }, db)
    ).rejects.toThrow('New unit must cost at most 2 more')
  })

  it('throws 409 when source unit not found', async () => {
    const { db } = makeReplaceShipDb({ sourceUnit: null })
    await expect(
      interpretEffects([{ op: 'replace_ship' }], {
        ...CTX,
        selections: { chosen_player_id: 'p2', system_key: '1,0', old_unit_type: 'Destroyer', new_unit_type: 'Cruiser' }
      }, db)
    ).rejects.toThrow('Source unit not found')
  })

  it('decrements old unit and inserts new unit when count is 1', async () => {
    const { db, deleteMock, insertMock } = makeReplaceShipDb({ oldCost: 2, newCost: 3, sourceUnit: { id: 'u1', count: 1 }, existingNew: null })
    await interpretEffects([{ op: 'replace_ship' }], {
      ...CTX,
      selections: { chosen_player_id: 'p2', system_key: '1,0', old_unit_type: 'Destroyer', new_unit_type: 'Cruiser' }
    }, db)
    expect(deleteMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ unit_type: 'Cruiser', count: 1, on_planet: null }))
  })
})

describe('give_promissory_to_opponent', () => {
  it('throws 409 when note not in opponent hand', async () => {
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
        if (table === 'game_player_promissory_notes') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }),
          update: vi.fn(),
        }
        return {}
      }),
    }
    await expect(
      interpretEffects([{ op: 'give_promissory_to_opponent' }], {
        ...CTX,
        selections: { chosen_player_id: 'p2', note_id: 'note-1' }
      }, db)
    ).rejects.toThrow('Note not found in opponent hand')
  })

  it('transfers note to activating player', async () => {
    const note = { id: 'note-1' }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
        if (table === 'game_player_promissory_notes') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: note, error: null }) }) }) }) }),
          update: updateMock,
        }
        return {}
      }),
    }
    await interpretEffects([{ op: 'give_promissory_to_opponent' }], {
      ...CTX,
      selections: { chosen_player_id: 'p2', note_id: 'note-1' }
    }, db)
    expect(updateMock).toHaveBeenCalledWith({ held_by_player_id: 'p1' })
  })
})

// ── Phase 40 ops ──────────────────────────────────────────────────────────────

describe('repeal_law', () => {
  function makeRepealDb({ lawRow = { id: 'law-1', agenda_id: 'agenda-1' }, lawError = null } = {}) {
    const lawsUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const deckUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
        }
        if (table === 'game_laws') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: lawRow, error: lawError }) }) }) }),
          update: lawsUpdateMock,
        }
        if (table === 'game_agenda_deck') return {
          update: deckUpdateMock,
        }
        return {}
      }),
    }
    return { db, lawsUpdateMock, deckUpdateMock }
  }

  it('sets is_repealed=true and deck state to repealed', async () => {
    const { db, lawsUpdateMock, deckUpdateMock } = makeRepealDb()
    await interpretEffects([{ op: 'repeal_law' }], {
      ...CTX,
      selections: { law_id: 'law-1' }
    }, db)
    expect(lawsUpdateMock).toHaveBeenCalledWith({ is_repealed: true })
    expect(deckUpdateMock).toHaveBeenCalledWith({ state: 'repealed' })
  })

  it('409 missing law_id in selections', async () => {
    const { db } = makeRepealDb()
    await expect(
      interpretEffects([{ op: 'repeal_law' }], { ...CTX, selections: {} }, db)
    ).rejects.toThrow('law_id is required in selections')
  })

  it('409 law not found in game', async () => {
    const { db } = makeRepealDb({ lawRow: null })
    await expect(
      interpretEffects([{ op: 'repeal_law' }], { ...CTX, selections: { law_id: 'law-missing' } }, db)
    ).rejects.toThrow('Law not found in game')
  })
})

describe('use_minister_of_war', () => {
  const MINISTER_OF_WAR_LAW = { law_id: 'law-mow', name: 'Minister of War', elected_target: 'p1' }
  const OTHER_LAW = { law_id: 'law-other', name: 'Some Other Law', elected_target: null }

  function makeMowDb({ laws = [MINISTER_OF_WAR_LAW], planet = { id: 'planet-1', exhausted: false } } = {}) {
    const lawsSelectMock = vi.fn().mockResolvedValue({ data: laws.map(l => ({
      id: l.law_id,
      elected_target: l.elected_target,
      agendas: { name: l.name },
      is_repealed: false,
    })), error: null })
    const planetUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const playerUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'game_players') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }),
          update: playerUpdateMock,
        }
        if (table === 'game_laws') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: lawsSelectMock,
            }),
          }),
        }
        if (table === 'game_player_planets') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: planet, error: null }) }) }) }) }),
          update: planetUpdateMock,
        }
        return {}
      }),
    }
    return { db, planetUpdateMock, playerUpdateMock }
  }

  it('409 Minister of War not in play', async () => {
    const { db } = makeMowDb({ laws: [OTHER_LAW] })
    await expect(
      interpretEffects([{ op: 'use_minister_of_war' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    ).rejects.toThrow('Minister of War is not in play')
  })

  it('409 caller is not elected player', async () => {
    const { db } = makeMowDb({ laws: [{ ...MINISTER_OF_WAR_LAW, elected_target: 'p2' }] })
    await expect(
      interpretEffects([{ op: 'use_minister_of_war' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    ).rejects.toThrow('Only the elected player may use Minister of War')
  })

  it('409 planet not owned', async () => {
    const { db } = makeMowDb({ planet: null })
    await expect(
      interpretEffects([{ op: 'use_minister_of_war' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    ).rejects.toThrow('Planet not owned')
  })

  it('409 planet already exhausted', async () => {
    const { db } = makeMowDb({ planet: { id: 'planet-1', exhausted: true } })
    await expect(
      interpretEffects([{ op: 'use_minister_of_war' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    ).rejects.toThrow('Planet already exhausted')
  })

  it('success: exhausts planet and sets minister_of_war_unlocked=true', async () => {
    const { db, planetUpdateMock, playerUpdateMock } = makeMowDb()
    await interpretEffects([{ op: 'use_minister_of_war' }], { ...CTX, selections: { planet_name: 'Mecatol Rex' } }, db)
    expect(planetUpdateMock).toHaveBeenCalledWith({ exhausted: true })
    expect(playerUpdateMock).toHaveBeenCalledWith({ minister_of_war_unlocked: true })
  })
})
