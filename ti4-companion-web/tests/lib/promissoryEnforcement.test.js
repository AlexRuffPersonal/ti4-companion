import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getActiveNotes, getHeldNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'

const GAME_ID = 'game-uuid'

function makeDb(data, error = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined,
  }
  // Make the chain thenable so await resolves to { data, error }
  const result = { data, error }
  chain.eq = vi.fn().mockImplementation(() => chain)
  chain.select = vi.fn().mockImplementation(() => chain)
  // Override the last eq to return a promise
  let eqCount = 0
  const originalEq = chain.eq
  chain.eq = vi.fn().mockImplementation((...args) => {
    eqCount++
    if (eqCount >= 2) {
      return Promise.resolve(result)
    }
    return chain
  })
  return {
    from: vi.fn().mockReturnValue(chain),
  }
}

// ---------------------------------------------------------------------------
// getHeldNotes
// ---------------------------------------------------------------------------

describe('getHeldNotes', () => {
  it('returns NoteEntry[] matching noteName (case-insensitive)', async () => {
    const rows = [
      {
        id: 'inst-1',
        held_by_player_id: 'holder-1',
        origin_player_id: 'owner-1',
        promissory_notes: { name: 'Trade Agreement' },
      },
      {
        id: 'inst-2',
        held_by_player_id: 'holder-2',
        origin_player_id: 'owner-2',
        promissory_notes: { name: 'Crucible' },
      },
    ]

    const db = makeDb(rows)
    const result = await getHeldNotes(GAME_ID, 'trade agreement', db)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      instanceId: 'inst-1',
      holderPlayerId: 'holder-1',
      ownerPlayerId: 'owner-1',
    })
  })

  it('returns [] when no held notes match the name', async () => {
    const rows = [
      {
        id: 'inst-1',
        held_by_player_id: 'holder-1',
        origin_player_id: 'owner-1',
        promissory_notes: { name: 'Crucible' },
      },
    ]

    const db = makeDb(rows)
    const result = await getHeldNotes(GAME_ID, 'trade agreement', db)

    expect(result).toEqual([])
  })

  it('returns [] when data is empty', async () => {
    const db = makeDb([])
    const result = await getHeldNotes(GAME_ID, 'crucible', db)
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getActiveNotes
// ---------------------------------------------------------------------------

describe('getActiveNotes', () => {
  it('includes tradeAgreement, crucible, strikeWingAmbuscade keys in result', async () => {
    const db = makeDb([])
    const result = await getActiveNotes(GAME_ID, db)

    expect(result).toHaveProperty('tradeAgreement')
    expect(result.tradeAgreement).toEqual([])
    expect(result).toHaveProperty('crucible')
    expect(result.crucible).toEqual([])
    expect(result).toHaveProperty('strikeWingAmbuscade')
    expect(result.strikeWingAmbuscade).toEqual([])
  })

  it('populates tradeAgreement from in_play rows', async () => {
    const rows = [
      {
        id: 'inst-ta',
        held_by_player_id: 'holder-a',
        owner_player_id: 'owner-a',
        promissory_notes: { name: 'Trade Agreement' },
      },
    ]

    const db = makeDb(rows)
    const result = await getActiveNotes(GAME_ID, db)

    expect(result.tradeAgreement).toHaveLength(1)
    expect(result.tradeAgreement[0]).toEqual({
      instanceId: 'inst-ta',
      holderPlayerId: 'holder-a',
      ownerPlayerId: 'owner-a',
    })
  })

  it('populates strikeWingAmbuscade from in_play rows', async () => {
    const rows = [
      {
        id: 'inst-swa',
        held_by_player_id: 'holder-b',
        owner_player_id: 'owner-b',
        promissory_notes: { name: 'Strike Wing Ambuscade' },
      },
    ]

    const db = makeDb(rows)
    const result = await getActiveNotes(GAME_ID, db)

    expect(result.strikeWingAmbuscade).toHaveLength(1)
    expect(result.strikeWingAmbuscade[0].instanceId).toBe('inst-swa')
  })
})
