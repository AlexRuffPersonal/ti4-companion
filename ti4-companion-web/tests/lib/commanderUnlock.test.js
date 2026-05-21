import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkCommanderUnlock } from '../../../supabase/functions/_shared/commanderUnlock.ts'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makePlayer(overrides = {}) {
  return {
    id: PLAYER_ID,
    technologies: [],
    trade_goods: 0,
    action_card_count: 0,
    commander_flags: {},
    leaders: {},
    faction: 'The Nekro Virus',
    ...overrides,
  }
}

function mockFromChain(data) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error: null }),
  }
  // Make the chain resolve for array queries
  chain.eq.mockReturnValue({
    ...chain,
    then: (resolve) => resolve({ data, error: null }),
  })
  return chain
}

describe('checkCommanderUnlock — Nekro Virus', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns false when < 3 techs', async () => {
    const player = makePlayer({ technologies: ['t1', 't2'] })
    const result = await checkCommanderUnlock('The Nekro Virus', GAME_ID, player, db)
    expect(result).toBe(false)
  })

  it('returns true when >= 3 techs', async () => {
    const player = makePlayer({ technologies: ['t1', 't2', 't3'] })
    const result = await checkCommanderUnlock('The Nekro Virus', GAME_ID, player, db)
    expect(result).toBe(true)
  })
})

describe('checkCommanderUnlock — Hacan', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns false when < 10 trade goods', async () => {
    const player = makePlayer({ trade_goods: 9 })
    const result = await checkCommanderUnlock('The Emirates Of Hacan', GAME_ID, player, db)
    expect(result).toBe(false)
  })

  it('returns true when >= 10 trade goods', async () => {
    const player = makePlayer({ trade_goods: 10 })
    const result = await checkCommanderUnlock('The Emirates Of Hacan', GAME_ID, player, db)
    expect(result).toBe(true)
  })
})

describe('checkCommanderUnlock — Jol-Nar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns false when < 8 techs', async () => {
    const player = makePlayer({ technologies: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'] })
    const result = await checkCommanderUnlock('The Universities Of Jol-Nar', GAME_ID, player, db)
    expect(result).toBe(false)
  })

  it('returns true when >= 8 techs', async () => {
    const player = makePlayer({ technologies: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'] })
    const result = await checkCommanderUnlock('The Universities Of Jol-Nar', GAME_ID, player, db)
    expect(result).toBe(true)
  })
})

describe('checkCommanderUnlock — Yin honour flag', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns false when used_indoctrination not set', async () => {
    const player = makePlayer({ commander_flags: {} })
    const result = await checkCommanderUnlock('The Yin Brotherhood', GAME_ID, player, db)
    expect(result).toBe(false)
  })

  it('returns true when commander_flags.used_indoctrination=true', async () => {
    const player = makePlayer({ commander_flags: { used_indoctrination: true } })
    const result = await checkCommanderUnlock('The Yin Brotherhood', GAME_ID, player, db)
    expect(result).toBe(true)
  })
})

describe('checkCommanderUnlock — Sol', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns false when total resources < 12', async () => {
    db.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { planet_name: 'Jord', tiles: { planets: { Jord: { resources: 4, influence: 2 } } } },
            ],
            error: null,
          }),
        }),
      }),
    })
    const player = makePlayer()
    const result = await checkCommanderUnlock('The Federation Of Sol', GAME_ID, player, db)
    expect(result).toBe(false)
  })

  it('returns true when total resources >= 12', async () => {
    db.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { planet_name: 'Jord', tiles: { planets: { Jord: { resources: 4, influence: 2 } } } },
              { planet_name: 'Nar', tiles: { planets: { Nar: { resources: 3, influence: 3 } } } },
              { planet_name: 'Archon Tau', tiles: { planets: { 'Archon Tau': { resources: 5, influence: 0 } } } },
            ],
            error: null,
          }),
        }),
      }),
    })
    const player = makePlayer()
    const result = await checkCommanderUnlock('The Federation Of Sol', GAME_ID, player, db)
    expect(result).toBe(true)
  })
})

describe('checkCommanderUnlock — unknown faction', () => {
  it('returns false for unknown faction', async () => {
    const player = makePlayer()
    const result = await checkCommanderUnlock('Unknown Faction', GAME_ID, player, db)
    expect(result).toBe(false)
  })
})
