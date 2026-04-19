// tests/lib/player-order.test.js
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { getNextPlayer } from '../../../supabase/functions/_shared/player-order.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const PLAYERS = [
  { id: 'p1', seat_index: 1, created_at: '2024-01-01T00:00:00Z' },
  { id: 'p2', seat_index: 3, created_at: '2024-01-01T00:01:00Z' },
  { id: 'p3', seat_index: 2, created_at: '2024-01-01T00:02:00Z' },
]

function mockPlayers(players = PLAYERS) {
  db.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: players }),
    }),
  })
}

describe('getNextPlayer — initiative order', () => {
  it('returns the next player by strategy card ascending', async () => {
    mockPlayers()
    // p1=1, p3=2, p2=3 → after p1 comes p3
    const next = await getNextPlayer('game-1', 'p1', 'initiative', null, db)
    expect(next).toBe('p3')
  })

  it('wraps from last back to first', async () => {
    mockPlayers()
    // p2 is last (seat 3) → wraps to p1 (seat 1)
    const next = await getNextPlayer('game-1', 'p2', 'initiative', null, db)
    expect(next).toBe('p1')
  })
})

describe('getNextPlayer — reverse_speaker order', () => {
  // join order: p1, p2, p3 (by created_at)
  // speaker = p1 → reverse_speaker order: p2, p3, p1 (speaker votes last)
  it('returns the player after the speaker first', async () => {
    mockPlayers()
    // first voter is p2 (after speaker p1 in join order)
    const next = await getNextPlayer('game-1', 'p2', 'reverse_speaker', 'p1', db)
    expect(next).toBe('p3')
  })

  it('speaker votes last — next after p3 is speaker p1', async () => {
    mockPlayers()
    const next = await getNextPlayer('game-1', 'p3', 'reverse_speaker', 'p1', db)
    expect(next).toBe('p1')
  })

  it('wraps from speaker back to the first voter', async () => {
    mockPlayers()
    // after speaker p1 wraps to p2
    const next = await getNextPlayer('game-1', 'p1', 'reverse_speaker', 'p1', db)
    expect(next).toBe('p2')
  })
})