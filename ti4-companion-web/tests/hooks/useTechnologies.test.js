import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  exhaustTechnology: vi.fn(),
  readyTechnology: vi.fn(),
  useTechnologyAction: vi.fn(),
}))

import { exhaustTechnology, readyTechnology, useTechnologyAction } from '../../src/lib/edgeFunctions.js'
import { useTechnologies } from '../../src/hooks/useTechnologies.js'

const GAME_ID = 'game-uuid'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTechnologies', () => {
  describe('with a player with exhausted technologies', () => {
    const player = {
      technologies: ['Graviton Laser System', 'Bio-Stims', 'Scanlink Drone Network'],
      exhausted_technologies: ['Graviton Laser System'],
    }

    it('isExhausted returns true for exhausted technology', () => {
      const { isExhausted } = useTechnologies(player, GAME_ID)
      expect(isExhausted('Graviton Laser System')).toBe(true)
    })

    it('isExhausted returns false for non-exhausted technology', () => {
      const { isExhausted } = useTechnologies(player, GAME_ID)
      expect(isExhausted('Bio-Stims')).toBe(false)
    })

    it('ownedTechnologies returns the player technologies array', () => {
      const { ownedTechnologies } = useTechnologies(player, GAME_ID)
      expect(ownedTechnologies).toEqual(player.technologies)
    })

    it('exhaustedTechnologies returns the player exhausted_technologies array', () => {
      const { exhaustedTechnologies } = useTechnologies(player, GAME_ID)
      expect(exhaustedTechnologies).toEqual(player.exhausted_technologies)
    })
  })

  describe('with player=null', () => {
    it('ownedTechnologies returns []', () => {
      const { ownedTechnologies } = useTechnologies(null, GAME_ID)
      expect(ownedTechnologies).toEqual([])
    })

    it('exhaustedTechnologies returns []', () => {
      const { exhaustedTechnologies } = useTechnologies(null, GAME_ID)
      expect(exhaustedTechnologies).toEqual([])
    })
  })

  describe('action dispatchers', () => {
    const player = { technologies: [], exhausted_technologies: [] }

    it('exhaustTech calls exhaustTechnology with correct gameId and name', () => {
      exhaustTechnology.mockResolvedValue({ ok: true })
      const { exhaustTech } = useTechnologies(player, GAME_ID)
      exhaustTech('Graviton Laser System')
      expect(exhaustTechnology).toHaveBeenCalledWith(GAME_ID, 'Graviton Laser System')
    })

    it('readyTech calls readyTechnology with correct gameId and name', () => {
      readyTechnology.mockResolvedValue({ ok: true })
      const { readyTech } = useTechnologies(player, GAME_ID)
      readyTech('Bio-Stims')
      expect(readyTechnology).toHaveBeenCalledWith(GAME_ID, 'Bio-Stims')
    })

    it('useTechAction calls useTechnologyAction with correct gameId, name, selections', () => {
      useTechnologyAction.mockResolvedValue({ ok: true })
      const { useTechAction } = useTechnologies(player, GAME_ID)
      const selections = { target: 'player-2' }
      useTechAction('Scanlink Drone Network', selections)
      expect(useTechnologyAction).toHaveBeenCalledWith(GAME_ID, 'Scanlink Drone Network', selections)
    })
  })
})
