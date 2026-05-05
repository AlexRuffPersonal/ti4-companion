import { describe, it, expect, vi } from 'vitest'
import { applyUndoHandler } from '../../../supabase/functions/_shared/undoHandlers.ts'

// Build a minimal mock db that tracks calls per table.
function makeDb() {
  const calls = {}

  const makeTableMock = (table) => {
    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      mockResolvedValue: undefined,
    }
    // Make eq chainable and resolve to { error: null }
    eqChain.eq = vi.fn().mockImplementation(() => eqChain)

    const updateChain = {
      eq: vi.fn().mockImplementation(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }
    const updateMock = vi.fn().mockReturnValue(updateChain)

    const upsertMock = vi.fn().mockResolvedValue({ error: null })

    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })

    calls[table] = { update: updateMock, upsert: upsertMock, delete: deleteMock }
    return { update: updateMock, upsert: upsertMock, delete: deleteMock }
  }

  const db = {
    from: vi.fn().mockImplementation((table) => makeTableMock(table)),
    _calls: calls,
  }
  return db
}

describe('applyUndoHandler', () => {
  it('EVT_SCORE_OBJECTIVE: updates game_players with vp_before and game_player_objectives with scored:false', async () => {
    const db = makeDb()
    const event = {
      event_type: 'score_objective',
      payload: { player_id: 'p1', objective_id: 'obj1', vp_before: 3 },
    }
    await applyUndoHandler(db, event)

    // Should call db.from for game_players and game_player_objectives
    const fromCalls = db.from.mock.calls.map(([t]) => t)
    expect(fromCalls).toContain('game_players')
    expect(fromCalls).toContain('game_player_objectives')

    // game_players update should pass vp_before
    const gpCall = db.from.mock.calls.find(([t]) => t === 'game_players')
    expect(gpCall).toBeDefined()
    // get the update mock for that invocation
    const gpIdx = db.from.mock.calls.indexOf(gpCall)
    const gpResult = db.from.mock.results[gpIdx].value
    expect(gpResult.update).toHaveBeenCalledWith({ vp: 3 })
  })

  it('EVT_RESEARCH_TECH: updates game_players with technologies_before', async () => {
    const db = makeDb()
    const techsBefore = ['tech_a', 'tech_b']
    const event = {
      event_type: 'research_technology',
      payload: { player_id: 'p1', technologies_before: techsBefore },
    }
    await applyUndoHandler(db, event)

    const fromCalls = db.from.mock.calls.map(([t]) => t)
    expect(fromCalls).toContain('game_players')

    const gpIdx = db.from.mock.calls.findIndex(([t]) => t === 'game_players')
    const gpResult = db.from.mock.results[gpIdx].value
    expect(gpResult.update).toHaveBeenCalledWith({ technologies: techsBefore })
  })

  it('EVT_ASSIGN_HITS: upserts each unit row from units_before array', async () => {
    const db = makeDb()
    const unitsBefore = [
      { id: 'u1', count: 2 },
      { id: 'u2', count: 1 },
    ]
    const event = {
      event_type: 'assign_hits',
      payload: { units_before: unitsBefore },
    }
    await applyUndoHandler(db, event)

    // Should call db.from('game_player_units') twice — once per unit
    const gpuCalls = db.from.mock.calls.filter(([t]) => t === 'game_player_units')
    expect(gpuCalls).toHaveLength(2)

    // Each invocation should call upsert with the unit object
    const gpuResults = db.from.mock.calls
      .map((args, i) => ({ args, result: db.from.mock.results[i].value }))
      .filter(({ args }) => args[0] === 'game_player_units')

    expect(gpuResults[0].result.upsert).toHaveBeenCalledWith(unitsBefore[0], { onConflict: 'id' })
    expect(gpuResults[1].result.upsert).toHaveBeenCalledWith(unitsBefore[1], { onConflict: 'id' })
  })

  it('EVT_END_TURN: updates games with player_id as active_player_id', async () => {
    const db = makeDb()
    const event = {
      event_type: 'end_turn',
      payload: { player_id: 'p1', game_id: 'g1' },
    }
    await applyUndoHandler(db, event)

    const fromCalls = db.from.mock.calls.map(([t]) => t)
    expect(fromCalls).toContain('games')

    const gamesIdx = db.from.mock.calls.findIndex(([t]) => t === 'games')
    const gamesResult = db.from.mock.results[gamesIdx].value
    expect(gamesResult.update).toHaveBeenCalledWith({ active_player_id: 'p1' })
  })

  it('unknown event type: throws error with "No undo handler"', async () => {
    const db = makeDb()
    const event = {
      event_type: 'totally_unknown_event_xyz',
      payload: {},
    }
    await expect(applyUndoHandler(db, event)).rejects.toThrow('No undo handler for event type: totally_unknown_event_xyz')
  })
})
