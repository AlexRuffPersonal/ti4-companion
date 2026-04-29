# shared-techEffects

**File:** `supabase/functions/_shared/techEffects.ts`
**Status:** New
**Prereqs:** migration-043-tech-effects

## Functionality

```pseudocode
// Unit stat block returned by resolveUnitStats
interface StatBlock {
  combat: number; dice: number; move: number; capacity: number
  production: number; sustain: boolean
  bombardment?: { dice: number; combat: number }
  spaceCannon?: { dice: number; combat: number }
  afb?: { dice: number; combat: number }
}

// Applies unit upgrade stat deltas on top of baseStats
export function resolveUnitStats(unitType, baseStats, techs[]): StatBlock
  upgradeRow = fetch units WHERE name matches upgrade tech in techs for unitType
  if !upgradeRow: return baseStats
  apply delta fields from upgradeRow onto clone of baseStats
  return merged StatBlock

// Set of tech names that can be exhausted (card text says "exhaust this card")
export const EXHAUSTABLE_TECHS: Set<string> = {
  'Graviton Laser System', 'Bio-Stims', 'Magen Defense Grid', 'Supercharge',
  'Predictive Intelligence', 'Transit Diodes', 'Sling Relay',
  'Spacial Conduit Cylinder', 'AI Development Algorithm', 'Self-Assembly Routines',
  'Vortex', 'X-89 Bacterial Weapon', 'Production Biomes', 'Instinct Training',
  'Nullification Field', 'Genetic Recombination', 'Hegemonic Trade Policy',
  'Lazax Gate Folding', 'Mageon Implants', 'Temporal Command Suite',
  'Inheritance Systems'
}

// Maps tech name → trigger points it fires at
export const PASSIVE_TECH_TRIGGERS: Map<string, TechTrigger[]>

// Trigger points enum
type TechTrigger =
  'STATUS_PHASE_DRAW' | 'STATUS_PHASE_TOKENS' | 'STATUS_PHASE_START' |
  'STATUS_PHASE_END' | 'STRATEGY_PHASE_END' | 'PRODUCTION' | 'MOVEMENT' |
  'SYSTEM_ACTIVATE' | 'SPACE_COMBAT_START' | 'SPACE_COMBAT_END' |
  'SPACE_CANNON_FIRE' | 'BOMBARDMENT' | 'GROUND_COMBAT_ROUND_START' |
  'GROUND_COMBAT_ROUND_END' | 'GROUND_COMBAT_WIN' | 'PLANET_CONTROL_GAINED' |
  'PLANET_EXPLORED' | 'SHIPS_ENTER_SYSTEM' | 'ACTION_CARD_PLAYED' |
  'VOTE_CAST' | 'ACTION_PHASE_TURN_START' | 'TECH_RESEARCHED' | 'AGENT_EXHAUSTED'

// Applies all passive techs for a given trigger point
// edge functions call this at the appropriate hook
export async function applyPassiveTechs(
  trigger, techs[], exhaustedTechs[], context: TechResolveContext, db
): Promise<TechEffectResult>
  for each tech in techs where PASSIVE_TECH_TRIGGERS.get(tech) includes trigger:
    apply tech effect; skip if tech is in exhaustedTechs and requires non-exhausted state
```

## Tests

```pseudocode
resolveUnitStats: returns baseStats unchanged if no upgrade in techs
resolveUnitStats: applies combat/dice delta when upgrade tech present
EXHAUSTABLE_TECHS: contains 'Graviton Laser System'; does not contain 'Neural Motivator'
applyPassiveTechs STATUS_PHASE_DRAW: calls draw action card logic for Neural Motivator owner
applyPassiveTechs PRODUCTION: reduces cost by 1 for Sarween Tools owner
```
