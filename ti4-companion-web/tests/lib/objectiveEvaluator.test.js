import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../../src/lib/objectiveEvaluator.js'

describe('objectiveEvaluator', () => {
  const createMockContext = (overrides = {}) => ({
    player: {
      id: 'player-1',
      trade_goods: 5,
      technologies: [],
      command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 },
    },
    planets: [],
    units: [],
    homeSystems: { 'player-1': '1,0' },
    mecatolSystemKey: '0,0',
    combats: [],
    neighbors: ['player-2', 'player-3'],
    technologies: [],
    ...overrides,
  })

  describe('null condition', () => {
    it('should return eligible: true for null conditionCheck', () => {
      const result = evaluateCondition(null, createMockContext())
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should return eligible: true for undefined conditionCheck', () => {
      const result = evaluateCondition(undefined, createMockContext())
      expect(result).toEqual({ eligible: true, reason: '' })
    })
  })

  describe('count_planets', () => {
    it('should be not eligible when player has fewer planets than required', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', tech_specialty: null, type: [] },
          { planet_name: 'Planet B', tech_specialty: null, type: [] },
          { planet_name: 'Planet C', tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'count_planets', params: { min: 4 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 4 planets/)
      expect(result.reason).toMatch(/have 3/)
    })

    it('should be eligible when player has enough planets', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', tech_specialty: null, type: [] },
          { planet_name: 'Planet B', tech_specialty: null, type: [] },
          { planet_name: 'Planet C', tech_specialty: null, type: [] },
          { planet_name: 'Planet D', tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'count_planets', params: { min: 4 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should filter by tech_specialty', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', tech_specialty: 'blue', type: [] },
          { planet_name: 'Planet B', tech_specialty: null, type: [] },
          { planet_name: 'Planet C', tech_specialty: 'red', type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'count_planets', params: { min: 2, filter: 'tech_specialty' } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should filter by hazardous type', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', tech_specialty: null, type: ['hazardous'] },
          { planet_name: 'Planet B', tech_specialty: null, type: [] },
          { planet_name: 'Planet C', tech_specialty: null, type: ['hazardous', 'industrial'] },
        ],
      })
      const result = evaluateCondition({ type: 'count_planets', params: { min: 2, filter: 'hazardous' } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })
  })

  describe('count_technologies', () => {
    it('should check min technologies', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 5,
          technologies: ['tech-1', 'tech-2'],
          command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'count_technologies', params: { min: 3 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 3 technologies/)
    })

    it('should be eligible when player has enough technologies', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 5,
          technologies: ['tech-1', 'tech-2', 'tech-3'],
          command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'count_technologies', params: { min: 3 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })
  })

  describe('count_units', () => {
    it('should count units of specific type', () => {
      const ctx = createMockContext({
        units: [
          { unit_type: 'dreadnought', count: 2, system_key: '1,0' },
          { unit_type: 'cruiser', count: 3, system_key: '1,0' },
        ],
      })
      const result = evaluateCondition({ type: 'count_units', params: { unit: 'dreadnought', min: 2 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when unit count is insufficient', () => {
      const ctx = createMockContext({
        units: [
          { unit_type: 'dreadnought', count: 1, system_key: '1,0' },
        ],
      })
      const result = evaluateCondition({ type: 'count_units', params: { unit: 'dreadnought', min: 2 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 2 dreadnought/)
    })

    it('should filter by home_system location', () => {
      const ctx = createMockContext({
        units: [
          { unit_type: 'infantry', count: 3, system_key: '1,0' },
          { unit_type: 'infantry', count: 2, system_key: '2,1' },
        ],
        homeSystems: { 'player-1': '1,0' },
      })
      const result = evaluateCondition(
        { type: 'count_units', params: { unit: 'infantry', min: 3, location: 'home_system' } },
        ctx
      )
      expect(result).toEqual({ eligible: true, reason: '' })
    })
  })

  describe('count_command_tokens', () => {
    it('should be eligible when player has enough fleet tokens', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 5,
          technologies: [],
          command_tokens: { tactic_total: 3, fleet: 6, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'count_command_tokens', params: { pool: 'fleet', min: 5 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when player lacks tokens', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 5,
          technologies: [],
          command_tokens: { tactic_total: 3, fleet: 2, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'count_command_tokens', params: { pool: 'fleet', min: 5 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 5 fleet tokens/)
    })
  })

  describe('planet_stat_total', () => {
    it('should sum resources from all planets (exhausted + ready)', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 5, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 4, influence: 3, exhausted: true, tech_specialty: null, type: [] },
          { planet_name: 'Planet C', resources: 5, influence: 4, exhausted: false, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'planet_stat_total', params: { stat: 'resources', min: 12 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when sum is insufficient', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 5, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 3, influence: 3, exhausted: false, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'planet_stat_total', params: { stat: 'resources', min: 12 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 12 total resources/)
    })
  })

  describe('control_mecatol', () => {
    it('should be eligible when player has Mecatol Rex', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Mecatol Rex', resources: 1, influence: 6, exhausted: false, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'control_mecatol', params: {} }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when player lacks Mecatol Rex', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Some Other Planet', resources: 1, influence: 6, exhausted: false, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'control_mecatol', params: {} }, ctx)
      expect(result).toEqual({ eligible: false, reason: 'Must control Mecatol Rex' })
    })
  })

  describe('spend_resources', () => {
    it('should be eligible when non-exhausted resources meet threshold', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 3, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 4, influence: 3, exhausted: true, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'spend_resources', params: { amount: 3 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when available resources are insufficient', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 3, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 4, influence: 3, exhausted: true, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'spend_resources', params: { amount: 8 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 8 resources to spend/)
    })

    it('should ignore exhausted planets when calculating available resources', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 3, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 4, influence: 3, exhausted: true, tech_specialty: null, type: [] },
          { planet_name: 'Planet C', resources: 4, influence: 4, exhausted: false, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'spend_resources', params: { amount: 6 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })
  })

  describe('spend_influence', () => {
    it('should be eligible when non-exhausted influence meets threshold', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 3, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 4, influence: 5, exhausted: true, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'spend_influence', params: { amount: 2 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when available influence is insufficient', () => {
      const ctx = createMockContext({
        planets: [
          { planet_name: 'Planet A', resources: 3, influence: 2, exhausted: false, tech_specialty: null, type: [] },
          { planet_name: 'Planet B', resources: 4, influence: 5, exhausted: true, tech_specialty: null, type: [] },
        ],
      })
      const result = evaluateCondition({ type: 'spend_influence', params: { amount: 5 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 5 influence to spend/)
    })
  })

  describe('spend_trade_goods', () => {
    it('should be eligible when player has enough trade goods', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 8,
          technologies: [],
          command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'spend_trade_goods', params: { amount: 5 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when player lacks trade goods', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 3,
          technologies: [],
          command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'spend_trade_goods', params: { amount: 5 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 5 trade goods/)
    })
  })

  describe('spend_command_tokens', () => {
    it('should be eligible when player has enough tokens in pool', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 5,
          technologies: [],
          command_tokens: { tactic_total: 3, fleet: 6, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'spend_command_tokens', params: { pool: 'fleet', amount: 5 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when player lacks tokens in pool', () => {
      const ctx = createMockContext({
        player: {
          id: 'player-1',
          trade_goods: 5,
          technologies: [],
          command_tokens: { tactic_total: 3, fleet: 2, strategy: 2 },
        },
      })
      const result = evaluateCondition({ type: 'spend_command_tokens', params: { pool: 'fleet', amount: 5 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need 5 fleet tokens to spend/)
    })
  })

  describe('won_combat', () => {
    it('should be eligible when player has won any combat', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          { winner_player_id: 'player-1', attacker_player_id: 'player-1', defender_player_id: 'player-2', combat_type: 'space', ships_destroyed: {} },
        ],
      })
      const result = evaluateCondition({ type: 'won_combat', params: {} }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when player has not won any combat', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          { winner_player_id: 'player-2', attacker_player_id: 'player-1', defender_player_id: 'player-2', combat_type: 'space', ships_destroyed: {} },
        ],
      })
      const result = evaluateCondition({ type: 'won_combat', params: {} }, ctx)
      expect(result).toEqual({ eligible: false, reason: 'Must have won a combat' })
    })

    it('should filter by combat_type', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          { winner_player_id: 'player-1', attacker_player_id: 'player-1', defender_player_id: 'player-2', combat_type: 'space', ships_destroyed: {} },
        ],
      })
      const result = evaluateCondition({ type: 'won_combat', params: { combat_type: 'ground' } }, ctx)
      expect(result).toEqual({ eligible: false, reason: 'Must have won a combat' })
    })

    it('should filter by vs_neighbor and be eligible', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          { winner_player_id: 'player-1', attacker_player_id: 'player-1', defender_player_id: 'player-2', combat_type: 'space', ships_destroyed: {} },
        ],
        neighbors: ['player-2', 'player-3'],
      })
      const result = evaluateCondition({ type: 'won_combat', params: { vs_neighbor: true } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should filter by vs_neighbor and be not eligible if opponent is not neighbor', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          { winner_player_id: 'player-1', attacker_player_id: 'player-1', defender_player_id: 'player-4', combat_type: 'space', ships_destroyed: {} },
        ],
        neighbors: ['player-2', 'player-3'],
      })
      const result = evaluateCondition({ type: 'won_combat', params: { vs_neighbor: true } }, ctx)
      expect(result).toEqual({ eligible: false, reason: 'Must have won a combat against a neighbor' })
    })
  })

  describe('destroyed_ships', () => {
    it('should count destroyed ships in combats where player was attacker', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          {
            winner_player_id: 'player-1',
            attacker_player_id: 'player-1',
            defender_player_id: 'player-2',
            combat_type: 'space',
            ships_destroyed: { attacker: { cruiser: 2, dreadnought: 1 }, defender: { dreadnought: 2 } },
          },
        ],
      })
      const result = evaluateCondition({ type: 'destroyed_ships', params: { min: 2 } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should be not eligible when destroyed ship count is insufficient', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          {
            winner_player_id: 'player-1',
            attacker_player_id: 'player-1',
            defender_player_id: 'player-2',
            combat_type: 'space',
            ships_destroyed: { attacker: { cruiser: 1 }, defender: { dreadnought: 2 } },
          },
        ],
      })
      const result = evaluateCondition({ type: 'destroyed_ships', params: { min: 5 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Need to have destroyed 5 ships/)
    })

    it('should filter by ship_type', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          {
            winner_player_id: 'player-1',
            attacker_player_id: 'player-1',
            defender_player_id: 'player-2',
            combat_type: 'space',
            ships_destroyed: { attacker: { cruiser: 1, dreadnought: 2 }, defender: { dreadnought: 2 } },
          },
        ],
      })
      const result = evaluateCondition({ type: 'destroyed_ships', params: { min: 2, ship_type: 'dreadnought' } }, ctx)
      expect(result).toEqual({ eligible: true, reason: '' })
    })

    it('should ignore combats where player was not attacker', () => {
      const ctx = createMockContext({
        player: { id: 'player-1', trade_goods: 5, technologies: [], command_tokens: { tactic_total: 3, fleet: 5, strategy: 2 } },
        combats: [
          {
            winner_player_id: 'player-1',
            attacker_player_id: 'player-2',
            defender_player_id: 'player-1',
            combat_type: 'space',
            ships_destroyed: { attacker: { dreadnought: 5 }, defender: {} },
          },
        ],
      })
      const result = evaluateCondition({ type: 'destroyed_ships', params: { min: 1 } }, ctx)
      expect(result.eligible).toBe(false)
    })
  })

  describe('unknown condition type', () => {
    it('should return not eligible with error message for unknown type', () => {
      const result = evaluateCondition({ type: 'unknown_type', params: {} }, createMockContext())
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/Unknown condition type/)
    })
  })
})
