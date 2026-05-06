import { describe, it, expect } from 'vitest'

import {
  resolveUnitStats,
  EXHAUSTABLE_TECHS,
} from '../../../supabase/functions/_shared/techEffects.ts'

const BASE_FIGHTER = {
  combat: 9,
  dice: 1,
  move: 0,
  capacity: 0,
  production: 0,
  sustain: false,
}

describe('resolveUnitStats', () => {
  it('returns baseStats unchanged if no upgrade in techs', () => {
    const result = resolveUnitStats('fighter', BASE_FIGHTER, [])
    expect(result).toEqual(BASE_FIGHTER)
  })

  it('returns baseStats unchanged even when unrelated techs are present', () => {
    const result = resolveUnitStats('fighter', BASE_FIGHTER, ['Neural Motivator', 'Sarween Tools'])
    expect(result).toEqual(BASE_FIGHTER)
  })
})

describe('EXHAUSTABLE_TECHS', () => {
  it('contains Graviton Laser System', () => {
    expect(EXHAUSTABLE_TECHS.has('Graviton Laser System')).toBe(true)
  })

  it('does not contain Neural Motivator', () => {
    expect(EXHAUSTABLE_TECHS.has('Neural Motivator')).toBe(false)
  })

  it('contains all expected entries', () => {
    const expected = [
      'Graviton Laser System',
      'Bio-Stims',
      'Magen Defense Grid',
      'Supercharge',
      'Predictive Intelligence',
      'Transit Diodes',
      'Sling Relay',
      'Spacial Conduit Cylinder',
      'AI Development Algorithm',
      'Self-Assembly Routines',
      'Vortex',
      'X-89 Bacterial Weapon',
      'Production Biomes',
      'Instinct Training',
      'Nullification Field',
      'Genetic Recombination',
      'Hegemonic Trade Policy',
      'Lazax Gate Folding',
      'Mageon Implants',
      'Temporal Command Suite',
      'Inheritance Systems',
    ]
    for (const tech of expected) {
      expect(EXHAUSTABLE_TECHS.has(tech), `missing: ${tech}`).toBe(true)
    }
  })
})
