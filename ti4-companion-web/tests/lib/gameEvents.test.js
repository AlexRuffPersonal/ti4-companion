import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import {
  logEvent,
  getUndoableEvents,
  applyUndo,
  INFORMATIONAL_EVENTS,
  EVT_ROLL_COMBAT_DICE,
  EVT_ROLL_GROUND_COMBAT_DICE,
  EVT_UNDO,
} from '../../../supabase/functions/_shared/gameEvents.ts'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const EVENT_ID = 'event-uuid'

// ---------------------------------------------------------------------------
// Mock DB builder
// ---------------------------------------------------------------------------

function makeInsertMock(error = null) {
  return vi.fn().mockResolvedValue({ data: null, error })
}

function makeSelectChain(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data, error }),
            }),
          }),
        }),
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts row with correct fields', async () => {
    const insertMock = makeInsertMock()
    const db = { from: vi.fn().mockReturnValue({ insert: insertMock }) }

    await logEvent(db, {
      game_id: GAME_ID,
      player_id: PLAYER_ID,
      event_type: 'end_turn',
      payload: { foo: 'bar' },
      round: 2,
      phase: 'action',
    })

    expect(insertMock).toHaveBeenCalledWith({
      game_id: GAME_ID,
      player_id: PLAYER_ID,
      event_type: 'end_turn',
      payload: { foo: 'bar' },
      round: 2,
      phase: 'action',
    })
  })
})

describe('getUndoableEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes informational events', async () => {
    // We verify that informational event types are passed to the .not() filter
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const notMock = vi.fn().mockReturnValue({ order: orderMock })
    const isMock = vi.fn().mockReturnValue({ not: notMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    const db = { from: vi.fn().mockReturnValue({ select: selectMock }) }

    await getUndoableEvents(db, GAME_ID)

    expect(notMock).toHaveBeenCalledWith(
      'event_type',
      'in',
      expect.stringContaining(EVT_ROLL_COMBAT_DICE)
    )
    expect(notMock).toHaveBeenCalledWith(
      'event_type',
      'in',
      expect.stringContaining(EVT_ROLL_GROUND_COMBAT_DICE)
    )
  })

  it('excludes undone events', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const notMock = vi.fn().mockReturnValue({ order: orderMock })
    const isMock = vi.fn().mockReturnValue({ not: notMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    const db = { from: vi.fn().mockReturnValue({ select: selectMock }) }

    await getUndoableEvents(db, GAME_ID)

    // undone_at IS NULL filter
    expect(isMock).toHaveBeenCalledWith('undone_at', null)
  })

  it('orders newest-first and respects limit', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const notMock = vi.fn().mockReturnValue({ order: orderMock })
    const isMock = vi.fn().mockReturnValue({ not: notMock })
    const eqMock = vi.fn().mockReturnValue({ is: isMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    const db = { from: vi.fn().mockReturnValue({ select: selectMock }) }

    await getUndoableEvents(db, GAME_ID, 5)

    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limitMock).toHaveBeenCalledWith(5)
  })
})

describe('applyUndo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stamps undone_at on original', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })
    const singleMock = vi.fn().mockResolvedValue({
      data: { game_id: GAME_ID, player_id: PLAYER_ID, round: 1, phase: 'action' },
      error: null,
    })
    const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })

    const db = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
        select: selectMock,
        insert: insertMock,
      }),
    }

    await applyUndo(db, EVENT_ID)

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ undone_at: expect.any(String) }))
    expect(updateEqMock).toHaveBeenCalledWith('id', EVENT_ID)
  })

  it('inserts reversal row with undo_of set', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })
    const singleMock = vi.fn().mockResolvedValue({
      data: { game_id: GAME_ID, player_id: PLAYER_ID, round: 2, phase: 'status' },
      error: null,
    })
    const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })

    const db = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
        select: selectMock,
        insert: insertMock,
      }),
    }

    await applyUndo(db, EVENT_ID)

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: EVT_UNDO,
        undo_of: EVENT_ID,
        payload: { undo_of: EVENT_ID },
        game_id: GAME_ID,
      })
    )
  })
})

describe('INFORMATIONAL_EVENTS constant', () => {
  it('contains EVT_ROLL_COMBAT_DICE', () => {
    expect(INFORMATIONAL_EVENTS.has(EVT_ROLL_COMBAT_DICE)).toBe(true)
  })

  it('contains EVT_ROLL_GROUND_COMBAT_DICE', () => {
    expect(INFORMATIONAL_EVENTS.has(EVT_ROLL_GROUND_COMBAT_DICE)).toBe(true)
  })
})
