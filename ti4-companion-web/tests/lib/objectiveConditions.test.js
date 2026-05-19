import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../../../supabase/functions/_shared/objectiveConditions.ts'

function makeCtx(overrides = {}) {
  return {
    player: {
      id: 'player-1',
      game_id: 'game-1',
      trade_goods: 0,
      technologies: [],
      command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 },
      faction: 'sol',
    },
    planets: [],
    units: [],
    homeSystems: { 'player-1': '2,0' },
    mecatolSystemKey: '0,0',
    combats: [],
    neighbors: ['player-2', 'player-3'],
    technologies: [],
    ...overrides,
  }
}

describe('evaluateCondition', () => {
  it('null conditionCheck → eligible: true', () => {
    const result = evaluateCondition(null, makeCtx())
    expect(result.eligible).toBe(true)
    expect(result.reason).toBe('')
  })

  it('count_planets min=3 filter=tech_specialty, 2 planets → not eligible', () => {
    const ctx = makeCtx({
      planets: [
        { planet_name: 'Mecatol Rex', exhausted: false, tile_id: 't1', name: 'Mecatol Rex', resources: 1, influence: 6, tech_specialty: 'blue', type: [] },
        { planet_name: 'Weltor', exhausted: false, tile_id: 't2', name: 'Weltor', resources: 2, influence: 0, tech_specialty: 'red', type: [] },
      ],
    })
    const result = evaluateCondition({ type: 'count_planets', params: { min: 3, filter: 'tech_specialty' } }, ctx)
    expect(result.eligible).toBe(false)
  })

  it('count_planets min=3 filter=tech_specialty, 3 planets → eligible', () => {
    const ctx = makeCtx({
      planets: [
        { planet_name: 'Mecatol Rex', exhausted: false, tile_id: 't1', name: 'Mecatol Rex', resources: 1, influence: 6, tech_specialty: 'blue', type: [] },
        { planet_name: 'Weltor', exhausted: false, tile_id: 't2', name: 'Weltor', resources: 2, influence: 0, tech_specialty: 'red', type: [] },
        { planet_name: 'Arc Prime', exhausted: false, tile_id: 't3', name: 'Arc Prime', resources: 4, influence: 0, tech_specialty: 'yellow', type: [] },
      ],
    })
    const result = evaluateCondition({ type: 'count_planets', params: { min: 3, filter: 'tech_specialty' } }, ctx)
    expect(result.eligible).toBe(true)
  })

  it('count_technologies colors=2 per_color=2, 1 green+3 blue → eligible', () => {
    // 2 distinct colors (blue=3, green=1); blue has >=2 → qualifies
    const ctx = makeCtx({
      player: {
        id: 'player-1',
        game_id: 'game-1',
        trade_goods: 0,
        technologies: ['Neural Motivator', 'Sarween Tools', 'AI Development Algorithm', 'Bio-Stims'],
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 },
        faction: 'sol',
      },
      technologies: [
        { id: 'Neural Motivator', color: 'blue' },
        { id: 'Sarween Tools', color: 'blue' },
        { id: 'AI Development Algorithm', color: 'blue' },
        { id: 'Bio-Stims', color: 'green' },
      ],
    })
    const result = evaluateCondition({ type: 'count_technologies', params: { colors: 2, per_color: 2 } }, ctx)
    expect(result.eligible).toBe(true)
  })

  it('count_technologies colors=2 per_color=2, 3 green+0 blue → not eligible', () => {
    // Only 1 distinct color (green=3); need 2 distinct colors → not eligible
    const ctx = makeCtx({
      player: {
        id: 'player-1',
        game_id: 'game-1',
        trade_goods: 0,
        technologies: ['Bio-Stims', 'Psychoarchaeology', 'X-89 Bacterial Weapon'],
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 1 },
        faction: 'sol',
      },
      technologies: [
        { id: 'Bio-Stims', color: 'green' },
        { id: 'Psychoarchaeology', color: 'green' },
        { id: 'X-89 Bacterial Weapon', color: 'green' },
      ],
    })
    const result = evaluateCondition({ type: 'count_technologies', params: { colors: 2, per_color: 2 } }, ctx)
    expect(result.eligible).toBe(false)
  })

  it('spend_resources amount=8, planets 5+4 non-exhausted → eligible', () => {
    const ctx = makeCtx({
      planets: [
        { planet_name: 'Jord', exhausted: false, tile_id: 't1', name: 'Jord', resources: 5, influence: 0, tech_specialty: null, type: [] },
        { planet_name: 'Nar', exhausted: false, tile_id: 't2', name: 'Nar', resources: 4, influence: 1, tech_specialty: null, type: [] },
      ],
    })
    const result = evaluateCondition({ type: 'spend_resources', params: { amount: 8 } }, ctx)
    expect(result.eligible).toBe(true)
  })

  it('spend_resources amount=8, planets 3+4 non-exhausted → not eligible', () => {
    const ctx = makeCtx({
      planets: [
        { planet_name: 'Jord', exhausted: false, tile_id: 't1', name: 'Jord', resources: 3, influence: 0, tech_specialty: null, type: [] },
        { planet_name: 'Nar', exhausted: false, tile_id: 't2', name: 'Nar', resources: 4, influence: 1, tech_specialty: null, type: [] },
      ],
    })
    const result = evaluateCondition({ type: 'spend_resources', params: { amount: 8 } }, ctx)
    expect(result.eligible).toBe(false)
  })

  it('won_combat vs_neighbor=true, player is winner → eligible', () => {
    const ctx = makeCtx({
      combats: [
        {
          id: 'c1',
          winner_player_id: 'player-1',
          attacker_player_id: 'player-1',
          defender_player_id: 'player-2',
          combat_type: 'space',
          ships_destroyed: null,
        },
      ],
    })
    const result = evaluateCondition({ type: 'won_combat', params: { vs_neighbor: true } }, ctx)
    expect(result.eligible).toBe(true)
  })

  it('won_combat vs_neighbor=true, player not winner → not eligible', () => {
    const ctx = makeCtx({
      combats: [
        {
          id: 'c1',
          winner_player_id: 'player-2',
          attacker_player_id: 'player-1',
          defender_player_id: 'player-2',
          combat_type: 'space',
          ships_destroyed: null,
        },
      ],
    })
    const result = evaluateCondition({ type: 'won_combat', params: { vs_neighbor: true } }, ctx)
    expect(result.eligible).toBe(false)
  })

  it('control_mecatol, player has planet in 0,0 → eligible', () => {
    const ctx = makeCtx({
      planets: [
        { planet_name: 'Mecatol Rex', exhausted: false, tile_id: 't-mecatol', name: 'Mecatol Rex', resources: 1, influence: 6, tech_specialty: null, type: [] },
      ],
    })
    const result = evaluateCondition({ type: 'control_mecatol', params: {} }, ctx)
    expect(result.eligible).toBe(true)
  })

  it('control_mecatol, player has no planet in 0,0 → not eligible', () => {
    const ctx = makeCtx({
      planets: [
        { planet_name: 'Jord', exhausted: false, tile_id: 't1', name: 'Jord', resources: 5, influence: 0, tech_specialty: null, type: [] },
      ],
    })
    const result = evaluateCondition({ type: 'control_mecatol', params: {} }, ctx)
    expect(result.eligible).toBe(false)
  })
})
