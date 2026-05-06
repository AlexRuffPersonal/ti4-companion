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
