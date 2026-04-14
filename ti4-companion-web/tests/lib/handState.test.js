import { describe, it, expect } from 'vitest'
import { deriveHandState } from '../../src/lib/handState.js'

function makeCards(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `card-${i}` }))
}

describe('deriveHandState', () => {
  it('returns overLimit false and mustDiscard false when hand is empty', () => {
    const result = deriveHandState([])
    expect(result.overLimit).toBe(false)
    expect(result.mustDiscard).toBe(false)
    expect(result.cards).toHaveLength(0)
  })

  it('returns overLimit false and mustDiscard false at exactly 7 cards', () => {
    const result = deriveHandState(makeCards(7))
    expect(result.overLimit).toBe(false)
    expect(result.mustDiscard).toBe(false)
  })

  it('returns overLimit true and mustDiscard true at 8 cards', () => {
    const result = deriveHandState(makeCards(8))
    expect(result.overLimit).toBe(true)
    expect(result.mustDiscard).toBe(true)
  })

  it('passes through the cards array unchanged', () => {
    const cards = makeCards(3)
    expect(deriveHandState(cards).cards).toBe(cards)
  })
})
