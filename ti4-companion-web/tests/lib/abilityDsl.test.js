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
