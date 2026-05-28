import { describe, it, expect, vi } from 'vitest'
import {
  getActiveLaws,
  assertProductionAllowed,
  assertMovementAllowed,
  assertFleetCapacity,
  assertCombatHitAllowed,
  applyStatusPhaseLaws,
  checkVpMaintenanceLaws,
  LawError,
} from '../../../supabase/functions/_shared/lawEffects.ts'

// Build a mock db with configurable law rows and player data.
function makeDb({ laws = [], player = null, updateError = null } = {}) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: updateError }) }
  const updateMock = vi.fn().mockReturnValue(updateChain)

  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_laws') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: laws, error: null }),
            }),
          }),
        }
      }
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
      return {}
    }),
  }

  return { db, updateMock, updateChain }
}

// Helper to build a law row in the shape returned by the join query.
function makeLawRow(name, elected_target = null, id = 'law-1') {
  return { id, elected_target, agendas: { name } }
}

// ──────────────────────────────────────────────
// getActiveLaws
// ──────────────────────────────────────────────

describe('getActiveLaws', () => {
  it('returns only non-repealed laws with name and elected_target', async () => {
    const rows = [
      makeLawRow('Fleet Regulations', null, 'l1'),
      makeLawRow('Demilitarized Zone', 'Mecatol Rex', 'l2'),
    ]
    const { db } = makeDb({ laws: rows })

    const result = await getActiveLaws(db, 'g1')

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ law_id: 'l1', name: 'Fleet Regulations', elected_target: null })
    expect(result[1]).toMatchObject({ law_id: 'l2', name: 'Demilitarized Zone', elected_target: 'Mecatol Rex' })
  })

  it('returns empty array when no active laws', async () => {
    const { db } = makeDb({ laws: [] })
    const result = await getActiveLaws(db, 'g1')
    expect(result).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// assertProductionAllowed
// ──────────────────────────────────────────────

describe('assertProductionAllowed', () => {
  it('passes when no laws are active', async () => {
    const { db } = makeDb({ laws: [] })
    await expect(assertProductionAllowed(db, 'g1', 'carrier')).resolves.toBeUndefined()
  })

  it('throws when Regulated Conscription active and unit is carrier', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Regulated Conscription')] })
    await expect(assertProductionAllowed(db, 'g1', 'carrier')).rejects.toThrow(LawError)
    await expect(assertProductionAllowed(db, 'g1', 'carrier')).rejects.toThrow('Regulated Conscription')
  })

  it('passes when Regulated Conscription active and unit is infantry', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Regulated Conscription')] })
    await expect(assertProductionAllowed(db, 'g1', 'infantry')).resolves.toBeUndefined()
  })

  it('throws when Articles of War active and unit is pds', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Articles of War')] })
    await expect(assertProductionAllowed(db, 'g1', 'pds')).rejects.toThrow(LawError)
    await expect(assertProductionAllowed(db, 'g1', 'pds')).rejects.toThrow('Articles of War')
  })

  it('passes when Articles of War active and unit is carrier', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Articles of War')] })
    await expect(assertProductionAllowed(db, 'g1', 'carrier')).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// assertMovementAllowed
// ──────────────────────────────────────────────

describe('assertMovementAllowed', () => {
  it('throws when DMZ active and planet matches elected_target', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Demilitarized Zone', 'Mecatol Rex')] })
    await expect(assertMovementAllowed(db, 'g1', 'Mecatol Rex')).rejects.toThrow(LawError)
    await expect(assertMovementAllowed(db, 'g1', 'Mecatol Rex')).rejects.toThrow('Demilitarized Zone')
  })

  it('passes when DMZ active but planet is different', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Demilitarized Zone', 'Mecatol Rex')] })
    await expect(assertMovementAllowed(db, 'g1', 'Jord')).resolves.toBeUndefined()
  })

  it('passes when no laws are active', async () => {
    const { db } = makeDb({ laws: [] })
    await expect(assertMovementAllowed(db, 'g1', 'Mecatol Rex')).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// assertFleetCapacity
// ──────────────────────────────────────────────

describe('assertFleetCapacity', () => {
  it('passes when Fleet Regulations not active', async () => {
    const { db } = makeDb({ laws: [], player: { command_tokens: { fleet: 3 } } })
    await expect(assertFleetCapacity(db, 'g1', 'p1', 10)).resolves.toBeUndefined()
  })

  it('throws when Fleet Regulations active and requestedSize > fleetMax - 2', async () => {
    const { db } = makeDb({
      laws: [makeLawRow('Fleet Regulations')],
      player: { command_tokens: { fleet: 4 } },
    })
    // fleetMax=4, max allowed = 4-2=2, requestedSize=3 → throws
    await expect(assertFleetCapacity(db, 'g1', 'p1', 3)).rejects.toThrow(LawError)
    await expect(assertFleetCapacity(db, 'g1', 'p1', 3)).rejects.toThrow('Fleet Regulations')
  })

  it('passes when Fleet Regulations active and requestedSize <= fleetMax - 2', async () => {
    const { db } = makeDb({
      laws: [makeLawRow('Fleet Regulations')],
      player: { command_tokens: { fleet: 4 } },
    })
    // fleetMax=4, max allowed = 4-2=2, requestedSize=2 → passes
    await expect(assertFleetCapacity(db, 'g1', 'p1', 2)).resolves.toBeUndefined()
  })

  it('passes when Fleet Regulations active and requestedSize = 0', async () => {
    const { db } = makeDb({
      laws: [makeLawRow('Fleet Regulations')],
      player: { command_tokens: { fleet: 2 } },
    })
    // fleetMax=2, max allowed = max(0, 2-2)=0, requestedSize=0 → passes
    await expect(assertFleetCapacity(db, 'g1', 'p1', 0)).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// assertCombatHitAllowed
// ──────────────────────────────────────────────

describe('assertCombatHitAllowed', () => {
  it('throws when Conventions of War active and unitType is fighter', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Conventions of War')] })
    await expect(assertCombatHitAllowed(db, 'g1', 'fighter')).rejects.toThrow(LawError)
    await expect(assertCombatHitAllowed(db, 'g1', 'fighter')).rejects.toThrow('Conventions of War')
  })

  it('passes when Conventions of War active and unitType is cruiser', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Conventions of War')] })
    await expect(assertCombatHitAllowed(db, 'g1', 'cruiser')).resolves.toBeUndefined()
  })

  it('passes when no laws are active', async () => {
    const { db } = makeDb({ laws: [] })
    await expect(assertCombatHitAllowed(db, 'g1', 'fighter')).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// applyStatusPhaseLaws
// ──────────────────────────────────────────────

describe('applyStatusPhaseLaws', () => {
  it('caps tokenGain at 3 when Executive Sanctions active', async () => {
    const { db } = makeDb({ laws: [makeLawRow('Executive Sanctions')] })
    const input = [
      { playerId: 'p1', tokenGain: 5 },
      { playerId: 'p2', tokenGain: 2 },
    ]
    const result = await applyStatusPhaseLaws(db, 'g1', input)
    expect(result).toEqual([
      { playerId: 'p1', tokenGain: 3 },
      { playerId: 'p2', tokenGain: 2 },
    ])
  })

  it('returns updates unchanged when Executive Sanctions not active', async () => {
    const { db } = makeDb({ laws: [] })
    const input = [{ playerId: 'p1', tokenGain: 5 }]
    const result = await applyStatusPhaseLaws(db, 'g1', input)
    expect(result).toEqual(input)
  })
})

// ──────────────────────────────────────────────
// checkVpMaintenanceLaws
// ──────────────────────────────────────────────

describe('checkVpMaintenanceLaws', () => {
  it('deducts 1 VP when matching maintenance law active and vp > 0', async () => {
    const { db, updateMock, updateChain } = makeDb({
      laws: [makeLawRow('Shard of the Throne', 'Mecatol Rex')],
      player: { vp: 3 },
    })
    await checkVpMaintenanceLaws(db, 'g1', 'p1', 'Mecatol Rex')
    expect(updateMock).toHaveBeenCalledWith({ vp: 2 })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('does not deduct VP when law elected_target is a different planet', async () => {
    const { db, updateMock } = makeDb({
      laws: [makeLawRow('Shard of the Throne', 'Jord')],
      player: { vp: 3 },
    })
    await checkVpMaintenanceLaws(db, 'g1', 'p1', 'Mecatol Rex')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('does not deduct VP when player vp is 0', async () => {
    const { db, updateMock } = makeDb({
      laws: [makeLawRow('Shard of the Throne', 'Mecatol Rex')],
      player: { vp: 0 },
    })
    await checkVpMaintenanceLaws(db, 'g1', 'p1', 'Mecatol Rex')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('does not deduct VP when no laws are active', async () => {
    const { db, updateMock } = makeDb({ laws: [], player: { vp: 3 } })
    await checkVpMaintenanceLaws(db, 'g1', 'p1', 'Mecatol Rex')
    expect(updateMock).not.toHaveBeenCalled()
  })
})
