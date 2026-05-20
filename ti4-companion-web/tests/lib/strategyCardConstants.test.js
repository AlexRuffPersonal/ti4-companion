import { describe, it, expect } from 'vitest'
import { STRATEGY_CARDS, getCard } from '../../src/lib/strategyCardConstants.js'

describe('strategyCardConstants', () => {
  it('getCard returns correct entry for each of 1-8', () => {
    for (let i = 1; i <= 8; i++) {
      const card = getCard(i)
      expect(card).not.toBeNull()
      expect(card.number).toBe(i)
    }
  })

  it('getCard returns null for unknown number', () => {
    expect(getCard(0)).toBeNull()
    expect(getCard(9)).toBeNull()
    expect(getCard(99)).toBeNull()
  })

  it('all 8 cards have primaryText, secondaryText, primaryFields, secondaryFields', () => {
    for (let i = 1; i <= 8; i++) {
      const card = STRATEGY_CARDS[i]
      expect(card).toBeDefined()
      expect(card.primaryText).toBeDefined()
      expect(typeof card.primaryText).toBe('string')
      expect(card.secondaryText).toBeDefined()
      expect(typeof card.secondaryText).toBe('string')
      expect(Array.isArray(card.primaryFields)).toBe(true)
      expect(Array.isArray(card.secondaryFields)).toBe(true)
    }
  })

  it('all 8 cards have a name and initiative', () => {
    for (let i = 1; i <= 8; i++) {
      const card = STRATEGY_CARDS[i]
      expect(card.name).toBeDefined()
      expect(typeof card.name).toBe('string')
      expect(card.initiative).toBe(i)
    }
  })
})
