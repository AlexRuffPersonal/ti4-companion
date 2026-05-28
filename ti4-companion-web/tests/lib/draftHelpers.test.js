import { describe, it, expect } from 'vitest'
import {
  shuffle,
  scoreTile,
  buildSnakeOrder,
  axialRing,
  hexNeighbors,
} from '../../../supabase/functions/_shared/draftHelpers.ts'

describe('shuffle', () => {
  it('returns an array with the same elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const result = shuffle(arr)
    expect(result).toHaveLength(arr.length)
    expect(result.sort()).toEqual([...arr].sort())
  })

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    shuffle(arr)
    expect(arr).toEqual(copy)
  })

  it('probabilistically produces a different order (retry up to 10 times)', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    let different = false
    for (let i = 0; i < 10; i++) {
      const result = shuffle(arr)
      if (result.join(',') !== arr.join(',')) {
        different = true
        break
      }
    }
    expect(different).toBe(true)
  })
})

describe('scoreTile', () => {
  it('planets with resources and influence + wormhole', () => {
    const tile = {
      planets: [{ resources: 2, influence: 1 }],
      wormhole: 'alpha',
      anomaly: null,
    }
    // 2+1 = 3, +1 wormhole = 4
    expect(scoreTile(tile)).toBe(4)
  })

  it('anomaly tile with no planets', () => {
    const tile = {
      planets: [],
      wormhole: null,
      anomaly: 'gravity rift',
    }
    // 0 - 1 = -1
    expect(scoreTile(tile)).toBe(-1)
  })

  it('empty tile (no planets, no wormhole, no anomaly)', () => {
    const tile = { planets: [], wormhole: null, anomaly: null }
    expect(scoreTile(tile)).toBe(0)
  })

  it('multiple planets', () => {
    const tile = {
      planets: [
        { resources: 3, influence: 1 },
        { resources: 1, influence: 2 },
      ],
      wormhole: null,
      anomaly: null,
    }
    // 4 + 3 = 7
    expect(scoreTile(tile)).toBe(7)
  })
})

describe('buildSnakeOrder', () => {
  it('3P each with 3 tiles → length 9, snake pattern, each appears 3 times', () => {
    const players = ['A', 'B', 'C']
    const handSizes = { A: 3, B: 3, C: 3 }
    const order = buildSnakeOrder(players, handSizes)
    expect(order).toHaveLength(9)
    // Check each appears 3 times
    expect(order.filter((p) => p === 'A')).toHaveLength(3)
    expect(order.filter((p) => p === 'B')).toHaveLength(3)
    expect(order.filter((p) => p === 'C')).toHaveLength(3)
    // Snake: A,B,C,C,B,A,A,B,C
    expect(order).toEqual(['A', 'B', 'C', 'C', 'B', 'A', 'A', 'B', 'C'])
  })

  it('6P each with 5 tiles → length 30, each appears 5 times', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F']
    const handSizes = { A: 5, B: 5, C: 5, D: 5, E: 5, F: 5 }
    const order = buildSnakeOrder(players, handSizes)
    expect(order).toHaveLength(30)
    for (const p of players) {
      expect(order.filter((x) => x === p)).toHaveLength(5)
    }
  })

  it('non-uniform hand sizes (speaker has 6, others have 5) → length correct', () => {
    const players = ['S', 'A', 'B', 'C', 'D', 'E']
    const handSizes = { S: 6, A: 5, B: 5, C: 5, D: 5, E: 5 }
    const order = buildSnakeOrder(players, handSizes)
    const total = 6 + 5 * 5 // 31
    expect(order).toHaveLength(total)
    expect(order.filter((p) => p === 'S')).toHaveLength(6)
    expect(order.filter((p) => p === 'A')).toHaveLength(5)
  })

  it('handles zero-size hands gracefully', () => {
    const players = ['A', 'B']
    const handSizes = { A: 0, B: 3 }
    const order = buildSnakeOrder(players, handSizes)
    expect(order).toHaveLength(3)
    expect(order.every((p) => p === 'B')).toBe(true)
  })
})

describe('axialRing', () => {
  it('axialRing(0,0) === 0', () => {
    expect(axialRing(0, 0)).toBe(0)
  })

  it('axialRing(1,0) === 1', () => {
    expect(axialRing(1, 0)).toBe(1)
  })

  it('axialRing(2,-1) === 2', () => {
    expect(axialRing(2, -1)).toBe(2)
  })

  it('axialRing(-3,3) === 3', () => {
    expect(axialRing(-3, 3)).toBe(3)
  })

  it('axialRing(0,2) === 2', () => {
    expect(axialRing(0, 2)).toBe(2)
  })
})

describe('hexNeighbors', () => {
  it('returns exactly 6 neighbors for (0,0)', () => {
    const neighbors = hexNeighbors(0, 0)
    expect(neighbors).toHaveLength(6)
  })

  it('neighbors of (0,0) are all ring-1 tiles', () => {
    const neighbors = hexNeighbors(0, 0)
    for (const [q, r] of neighbors) {
      expect(axialRing(q, r)).toBe(1)
    }
  })

  it('returns 6 neighbors for arbitrary tile', () => {
    const neighbors = hexNeighbors(2, -1)
    expect(neighbors).toHaveLength(6)
    // Each neighbor should be ring-adjacent
    for (const [q, r] of neighbors) {
      const dist = Math.max(
        Math.abs(q - 2),
        Math.abs(r - (-1)),
        Math.abs(q + r - (2 + -1)),
      )
      expect(dist).toBe(1)
    }
  })
})
