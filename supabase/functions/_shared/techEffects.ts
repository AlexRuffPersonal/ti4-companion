import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface StatBlock {
  combat: number
  dice: number
  move: number
  capacity: number
  production: number
  sustain: boolean
  bombardment?: { dice: number; combat: number }
  spaceCannon?: { dice: number; combat: number }
  afb?: { dice: number; combat: number }
}

/**
 * Technologies that can be exhausted (used for active abilities or triggers).
 */
export const EXHAUSTABLE_TECHS: Set<string> = new Set([
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
])

export type TechTrigger =
  | 'STATUS_PHASE_DRAW'
  | 'STATUS_PHASE_TOKENS'
  | 'STATUS_PHASE_START'
  | 'STATUS_PHASE_END'
  | 'STRATEGY_PHASE_END'
  | 'PRODUCTION'
  | 'MOVEMENT'
  | 'SYSTEM_ACTIVATE'
  | 'SPACE_COMBAT_START'
  | 'SPACE_COMBAT_END'
  | 'SPACE_CANNON_FIRE'
  | 'BOMBARDMENT'
  | 'GROUND_COMBAT_ROUND_START'
  | 'GROUND_COMBAT_ROUND_END'
  | 'GROUND_COMBAT_WIN'
  | 'PLANET_CONTROL_GAINED'
  | 'PLANET_EXPLORED'
  | 'SHIPS_ENTER_SYSTEM'
  | 'ACTION_CARD_PLAYED'
  | 'VOTE_CAST'
  | 'ACTION_PHASE_TURN_START'
  | 'TECH_RESEARCHED'
  | 'AGENT_EXHAUSTED'

export interface TechResolveContext {
  gameId: string
  playerId: string
  [key: string]: unknown
}

export interface TechEffectResult {
  applied: string[]
}

/**
 * Maps technology names to the triggers they respond to.
 * This is a minimal stub — the full implementation will be added in Phase 30.
 */
export const PASSIVE_TECH_TRIGGERS: Map<string, TechTrigger[]> = new Map([
  ['Neural Motivator', ['STATUS_PHASE_DRAW']],
  ['Sarween Tools', ['PRODUCTION']],
])

/**
 * Applies unit upgrade stat deltas for the given unit type and active techs.
 * Currently returns baseStats unchanged — upgrade lookup will be fleshed out in Phase 30.
 */
export function resolveUnitStats(
  unitType: string,
  baseStats: StatBlock,
  techs: string[]
): StatBlock {
  // Scaffold for future phases — no upgrade deltas applied yet
  void unitType
  void techs
  return { ...baseStats }
}

/**
 * Applies passive tech effects triggered by the given trigger event.
 * Currently a stub that returns no applied effects — full implementation in Phase 30.
 */
export async function applyPassiveTechs(
  trigger: TechTrigger,
  techs: string[],
  exhaustedTechs: string[],
  context: TechResolveContext,
  db: SupabaseClient
): Promise<TechEffectResult> {
  void trigger
  void techs
  void exhaustedTechs
  void context
  void db
  return { applied: [] }
}
