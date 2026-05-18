# Phase 36: Objective Condition Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce all 69 objective conditions server-side before granting VP, and surface per-player eligibility status in the UI.

**Architecture:** A `condition_check JSONB` column is added to both objective reference tables and populated via admin re-import. A shared `objectiveConditions.ts` module (mirrored as `objectiveEvaluator.js` on the client) evaluates 13 condition types against game state. Scoring edge functions call the evaluator before awarding VP and apply spend side-effects. The client disables the SCORE button with a reason tooltip when a player is ineligible.

**Tech Stack:** Deno/TypeScript (edge functions), React 19/JS (client), Supabase PostgreSQL, Vitest

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/046_objective_conditions.sql` | New |
| `supabase/functions/_shared/objectiveConditions.ts` | New |
| `supabase/functions/game-score-objective/index.ts` | Modify |
| `supabase/functions/game-score-secret-objective/index.ts` | Modify |
| `supabase/functions/game-assign-hits/index.ts` | Modify |
| `src/lib/objectiveEvaluator.js` | New |
| `src/hooks/useGame.js` | Modify |
| `src/components/game/ObjectivesSection.jsx` | Modify |
| `src/components/game/MyPanelSection.jsx` | Modify |

---

## Task 1: Migration 046

**Files:**
- Create: `supabase/migrations/046_objective_conditions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 046_objective_conditions.sql
-- Adds structured condition_check to objective reference tables and
-- ships_destroyed tracking to game_combats for event-based secret objectives.

ALTER TABLE public.public_objectives
  ADD COLUMN condition_check JSONB;

ALTER TABLE public.secret_objectives
  ADD COLUMN condition_check JSONB;

-- Tracks which ships (by unit name) were destroyed per side in a combat.
-- Shape: { "attacker": { "fighter": 2, "destroyer": 1 }, "defender": { "cruiser": 1 } }
ALTER TABLE public.game_combats
  ADD COLUMN ships_destroyed JSONB NOT NULL DEFAULT '{"attacker":{},"defender":{}}';
```

- [ ] **Step 2: Apply migration locally**

```bash
supabase db push
```

Expected: migration applies without errors; `public_objectives`, `secret_objectives`, and `game_combats` tables gain new columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/046_objective_conditions.sql
git commit -m "feat: migration 046 — condition_check on objectives, ships_destroyed on combats"
```

---

## Task 2: Shared Evaluator — `objectiveConditions.ts`

**Files:**
- Create: `supabase/functions/_shared/objectiveConditions.ts`
- Test: `supabase/functions/_shared/objectiveConditions.test.ts`

> **Schema notes (verify before implementing):**
> - `technologies.colour` — British spelling
> - `technologies.name` — TEXT, matches slugs in `game_players.technologies TEXT[]`
> - `technologies.is_unit_upgrade` — BOOLEAN
> - `units.name` — TEXT UNIQUE (e.g. "Infantry", "PDS", "Space Dock")
> - `units.unit_type` — TEXT (e.g. "ground_force", "ship", "structure") added in migration 020
> - `units.planetary` — BOOLEAN (true = lives on planets)
> - `game_player_planets.exhausted` — BOOLEAN
> - `game_player_planets.planet_destroyed` — BOOLEAN

- [ ] **Step 1: Write the type definitions and failing test scaffold**

```typescript
// supabase/functions/_shared/objectiveConditions.ts

export type ConditionCheck = {
  type: string
  params: Record<string, unknown>
}

export type EligibilityResult = {
  eligible: boolean
  reason: string
}

export type PlanetEntry = {
  planet_name: string
  exhausted: boolean
  planet_destroyed: boolean
  resources: number
  influence: number
  tech_specialty: string | null
  type: string[]          // e.g. ["cultural", "hazardous"]
  system_key: string      // derived from tile position in map_tiles
  is_home: boolean        // true if system_key matches player's home system
}

export type UnitEntry = {
  system_key: string
  unit_name: string       // e.g. "Infantry", "PDS" — from units.name
  unit_type: string       // e.g. "ground_force", "ship", "structure" — from units.unit_type
  count: number
  on_planet: string | null
}

export type CombatEntry = {
  id: string
  attacker_player_id: string
  defender_player_id: string
  winner_player_id: string | null
  status: string
  combat_type: string
  ships_destroyed: { attacker: Record<string, number>; defender: Record<string, number> }
}

export type TechEntry = {
  name: string
  colour: string
  is_unit_upgrade: boolean
}

export type EvaluationContext = {
  playerId: string
  player: {
    command_tokens: { tactic_total: number; fleet: number; strategy: number }
    technologies: string[]   // array of technology names
    trade_goods: number
  }
  planets: PlanetEntry[]
  units: UnitEntry[]
  mecatolSystemKey: string   // always "0,0"
  combats: CombatEntry[]
  techRef: TechEntry[]       // full technologies reference table
}

export function evaluateCondition(
  conditionCheck: ConditionCheck | null,
  ctx: EvaluationContext
): EligibilityResult {
  throw new Error('not implemented')
}

export async function applySpendSideEffect(
  type: string,
  params: Record<string, unknown>,
  ctx: EvaluationContext,
  db: unknown
): Promise<void> {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Write the tests**

```typescript
// supabase/functions/_shared/objectiveConditions.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateCondition, applySpendSideEffect } from './objectiveConditions.ts'
import type { EvaluationContext } from './objectiveConditions.ts'

function baseCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    playerId: 'p1',
    player: { command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 }, technologies: [], trade_goods: 0 },
    planets: [],
    units: [],
    mecatolSystemKey: '0,0',
    combats: [],
    techRef: [],
    ...overrides,
  }
}

function planet(overrides: Partial<import('./objectiveConditions.ts').PlanetEntry> = {}) {
  return { planet_name: 'Jord', exhausted: false, planet_destroyed: false, resources: 2, influence: 1, tech_specialty: null, type: [], system_key: '1,0', is_home: false, ...overrides }
}

function unit(overrides: Partial<import('./objectiveConditions.ts').UnitEntry> = {}) {
  return { system_key: '1,0', unit_name: 'Infantry', unit_type: 'ground_force', count: 1, on_planet: 'Jord', ...overrides }
}

describe('evaluateCondition', () => {
  it('returns eligible:true for null condition', () => {
    expect(evaluateCondition(null, baseCtx())).toEqual({ eligible: true, reason: '' })
  })

  it('returns eligible:true for unknown type', () => {
    expect(evaluateCondition({ type: 'unknown_future_type', params: {} }, baseCtx())).toEqual({ eligible: true, reason: '' })
  })

  // count_planets
  describe('count_planets', () => {
    it('eligible when player has enough planets', () => {
      const ctx = baseCtx({ planets: [planet(), planet({ planet_name: 'Xxehan' }), planet({ planet_name: 'Archon Ren' })] })
      expect(evaluateCondition({ type: 'count_planets', params: { min: 3 } }, ctx).eligible).toBe(true)
    })

    it('ineligible when player has too few planets', () => {
      const ctx = baseCtx({ planets: [planet()] })
      const result = evaluateCondition({ type: 'count_planets', params: { min: 3 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/need/i)
    })

    it('does not count destroyed planets', () => {
      const ctx = baseCtx({ planets: [planet(), planet({ planet_destroyed: true }), planet({ planet_name: 'B' })] })
      const result = evaluateCondition({ type: 'count_planets', params: { min: 3 } }, ctx)
      expect(result.eligible).toBe(false)
    })

    it('filter:tech_specialty counts only planets with tech specialty', () => {
      const ctx = baseCtx({ planets: [planet({ tech_specialty: 'green' }), planet(), planet({ tech_specialty: 'blue' })] })
      expect(evaluateCondition({ type: 'count_planets', params: { min: 2, filter: 'tech_specialty' } }, ctx).eligible).toBe(true)
    })

    it('filter:same_trait finds best trait count', () => {
      const ctx = baseCtx({ planets: [
        planet({ type: ['cultural'] }),
        planet({ planet_name: 'B', type: ['cultural'] }),
        planet({ planet_name: 'C', type: ['hazardous'] }),
        planet({ planet_name: 'D', type: ['cultural'] }),
      ]})
      expect(evaluateCondition({ type: 'count_planets', params: { min: 3, filter: 'same_trait' } }, ctx).eligible).toBe(true)
    })

    it('filter:same_trait ineligible when no trait reaches min', () => {
      const ctx = baseCtx({ planets: [planet({ type: ['cultural'] }), planet({ planet_name: 'B', type: ['hazardous'] })] })
      expect(evaluateCondition({ type: 'count_planets', params: { min: 3, filter: 'same_trait' } }, ctx).eligible).toBe(false)
    })
  })

  // count_technologies
  describe('count_technologies', () => {
    it('eligible when player owns enough technologies', () => {
      const ctx = baseCtx({ player: { ...baseCtx().player, technologies: ['Neural Motivator', 'Sarween Tools', 'Predictive Intelligence'] } })
      expect(evaluateCondition({ type: 'count_technologies', params: { min: 2 } }, ctx).eligible).toBe(true)
    })

    it('filter:unit_upgrade counts only unit upgrade techs', () => {
      const techRef = [
        { name: 'PDS II', colour: 'yellow', is_unit_upgrade: true },
        { name: 'Carrier II', colour: 'blue', is_unit_upgrade: true },
        { name: 'Neural Motivator', colour: 'green', is_unit_upgrade: false },
      ]
      const ctx = baseCtx({ player: { ...baseCtx().player, technologies: ['PDS II', 'Neural Motivator'] }, techRef })
      expect(evaluateCondition({ type: 'count_technologies', params: { min: 2, filter: 'unit_upgrade' } }, ctx).eligible).toBe(false)
      expect(evaluateCondition({ type: 'count_technologies', params: { min: 1, filter: 'unit_upgrade' } }, ctx).eligible).toBe(true)
    })

    it('colors+per_color: eligible when each of N colors has per_color techs', () => {
      const techRef = [
        { name: 'Neural Motivator', colour: 'green', is_unit_upgrade: false },
        { name: 'Psychoarchaeology', colour: 'green', is_unit_upgrade: false },
        { name: 'Sarween Tools', colour: 'yellow', is_unit_upgrade: false },
        { name: 'Predictive Intelligence', colour: 'yellow', is_unit_upgrade: false },
      ]
      const ctx = baseCtx({ player: { ...baseCtx().player, technologies: ['Neural Motivator', 'Psychoarchaeology', 'Sarween Tools', 'Predictive Intelligence'] }, techRef })
      expect(evaluateCondition({ type: 'count_technologies', params: { colors: 2, per_color: 2 } }, ctx).eligible).toBe(true)
    })

    it('colors+per_color: ineligible when only one color reaches per_color threshold', () => {
      const techRef = [
        { name: 'Neural Motivator', colour: 'green', is_unit_upgrade: false },
        { name: 'Psychoarchaeology', colour: 'green', is_unit_upgrade: false },
      ]
      const ctx = baseCtx({ player: { ...baseCtx().player, technologies: ['Neural Motivator', 'Psychoarchaeology'] }, techRef })
      expect(evaluateCondition({ type: 'count_technologies', params: { colors: 2, per_color: 2 } }, ctx).eligible).toBe(false)
    })
  })

  // count_units
  describe('count_units', () => {
    it('counts units of matching type across all systems', () => {
      const ctx = baseCtx({ units: [
        unit({ unit_name: 'PDS', unit_type: 'structure', count: 2, on_planet: 'Jord' }),
        unit({ system_key: '2,0', unit_name: 'PDS', unit_type: 'structure', count: 2, on_planet: 'Xxehan' }),
      ]})
      expect(evaluateCondition({ type: 'count_units', params: { unit: 'pds', min: 4 } }, ctx).eligible).toBe(true)
    })

    it('location:non_home excludes units in home system', () => {
      const ctx = baseCtx({ planets: [
        planet({ system_key: 'home', is_home: true }),
      ], units: [
        unit({ system_key: 'home', unit_name: 'Infantry', unit_type: 'ground_force', count: 3, on_planet: 'Jord' }),
        unit({ system_key: '2,0', unit_name: 'Infantry', unit_type: 'ground_force', count: 6, on_planet: 'Mecatol Rex' }),
      ]})
      const result = evaluateCondition({ type: 'count_units', params: { unit: 'ground_force', min: 9, location: 'non_home' } }, ctx)
      expect(result.eligible).toBe(false)  // only 6 outside home
    })
  })

  // count_command_tokens
  describe('count_command_tokens', () => {
    it('counts fleet pool', () => {
      const ctx = baseCtx({ player: { ...baseCtx().player, command_tokens: { tactic_total: 2, fleet: 5, strategy: 2 } } })
      expect(evaluateCondition({ type: 'count_command_tokens', params: { pool: 'fleet', min: 5 } }, ctx).eligible).toBe(true)
    })

    it('total pool sums all three', () => {
      const ctx = baseCtx({ player: { ...baseCtx().player, command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } } })
      expect(evaluateCondition({ type: 'count_command_tokens', params: { pool: 'total', min: 7 } }, ctx).eligible).toBe(true)
      expect(evaluateCondition({ type: 'count_command_tokens', params: { pool: 'total', min: 8 } }, ctx).eligible).toBe(false)
    })
  })

  // planet_stat_total
  describe('planet_stat_total', () => {
    it('sums resources across all non-destroyed planets including exhausted', () => {
      const ctx = baseCtx({ planets: [
        planet({ resources: 4, exhausted: false }),
        planet({ planet_name: 'B', resources: 5, exhausted: true }),    // exhausted but still counts
        planet({ planet_name: 'C', resources: 3, planet_destroyed: true }), // destroyed: skip
      ]})
      expect(evaluateCondition({ type: 'planet_stat_total', params: { stat: 'resources', min: 9 } }, ctx).eligible).toBe(true)
      expect(evaluateCondition({ type: 'planet_stat_total', params: { stat: 'resources', min: 10 } }, ctx).eligible).toBe(false)
    })
  })

  // control_mecatol
  describe('control_mecatol', () => {
    it('eligible when player has any unit in mecatol system', () => {
      const ctx = baseCtx({ units: [unit({ system_key: '0,0', unit_name: 'Carrier', unit_type: 'ship', on_planet: null })] })
      expect(evaluateCondition({ type: 'control_mecatol', params: {} }, ctx).eligible).toBe(true)
    })

    it('ineligible when player has no unit in mecatol system', () => {
      const ctx = baseCtx({ units: [unit({ system_key: '1,0' })] })
      expect(evaluateCondition({ type: 'control_mecatol', params: {} }, ctx).eligible).toBe(false)
    })
  })

  // spend_resources
  describe('spend_resources', () => {
    it('eligible when non-exhausted planets cover amount', () => {
      const ctx = baseCtx({ planets: [
        planet({ resources: 4, exhausted: false }),
        planet({ planet_name: 'B', resources: 5, exhausted: false }),
        planet({ planet_name: 'C', resources: 3, exhausted: true }),  // exhausted: does not count
      ]})
      expect(evaluateCondition({ type: 'spend_resources', params: { amount: 8 } }, ctx).eligible).toBe(true)
    })

    it('ineligible when non-exhausted planets do not cover amount', () => {
      const ctx = baseCtx({ planets: [
        planet({ resources: 3, exhausted: false }),
        planet({ planet_name: 'B', resources: 4, exhausted: true }),
      ]})
      const result = evaluateCondition({ type: 'spend_resources', params: { amount: 8 } }, ctx)
      expect(result.eligible).toBe(false)
      expect(result.reason).toMatch(/3.*available/i)
    })
  })

  // spend_influence
  describe('spend_influence', () => {
    it('eligible when non-exhausted planets cover amount', () => {
      const ctx = baseCtx({ planets: [
        planet({ influence: 5, exhausted: false }),
        planet({ planet_name: 'B', influence: 3, exhausted: false }),
      ]})
      expect(evaluateCondition({ type: 'spend_influence', params: { amount: 8 } }, ctx).eligible).toBe(true)
    })
  })

  // spend_trade_goods
  describe('spend_trade_goods', () => {
    it('eligible when trade_goods >= amount', () => {
      const ctx = baseCtx({ player: { ...baseCtx().player, trade_goods: 5 } })
      expect(evaluateCondition({ type: 'spend_trade_goods', params: { amount: 5 } }, ctx).eligible).toBe(true)
    })

    it('ineligible when trade_goods < amount', () => {
      const ctx = baseCtx({ player: { ...baseCtx().player, trade_goods: 4 } })
      expect(evaluateCondition({ type: 'spend_trade_goods', params: { amount: 5 } }, ctx).eligible).toBe(false)
    })
  })

  // spend_command_tokens
  describe('spend_command_tokens', () => {
    it('eligible when tactic pool >= amount', () => {
      const ctx = baseCtx({ player: { ...baseCtx().player, command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 } } })
      expect(evaluateCondition({ type: 'spend_command_tokens', params: { amount: 3, pool: 'tactic' } }, ctx).eligible).toBe(true)
    })
  })

  // won_combat
  describe('won_combat', () => {
    const completeCombat = {
      id: 'c1',
      attacker_player_id: 'p1',
      defender_player_id: 'p2',
      winner_player_id: 'p1',
      status: 'complete',
      combat_type: 'space',
      ships_destroyed: { attacker: {}, defender: {} },
    }

    it('eligible when player won any combat', () => {
      const ctx = baseCtx({ combats: [completeCombat] })
      expect(evaluateCondition({ type: 'won_combat', params: {} }, ctx).eligible).toBe(true)
    })

    it('ineligible when player won no combat', () => {
      const ctx = baseCtx({ combats: [{ ...completeCombat, winner_player_id: 'p2' }] })
      expect(evaluateCondition({ type: 'won_combat', params: {} }, ctx).eligible).toBe(false)
    })

    it('combat_type:ground only checks ground combats', () => {
      const ctx = baseCtx({ combats: [completeCombat] })  // space combat
      expect(evaluateCondition({ type: 'won_combat', params: { combat_type: 'ground' } }, ctx).eligible).toBe(false)
    })
  })

  // destroyed_ships
  describe('destroyed_ships', () => {
    const combatWithDestroyed = {
      id: 'c1',
      attacker_player_id: 'p1',
      defender_player_id: 'p2',
      winner_player_id: 'p1',
      status: 'complete',
      combat_type: 'space',
      ships_destroyed: { attacker: {}, defender: { Destroyer: 1, Fighter: 2 } },
    }

    it('eligible when player destroyed enough ships as attacker', () => {
      const ctx = baseCtx({ combats: [combatWithDestroyed] })
      // p1 is attacker; defender lost 3 ships total
      expect(evaluateCondition({ type: 'destroyed_ships', params: { min: 3 } }, ctx).eligible).toBe(true)
    })

    it('ship_type:non_fighter excludes fighters', () => {
      const ctx = baseCtx({ combats: [combatWithDestroyed] })
      // only 1 non-fighter destroyed (Destroyer)
      expect(evaluateCondition({ type: 'destroyed_ships', params: { min: 2, ship_type: 'non_fighter' } }, ctx).eligible).toBe(false)
      expect(evaluateCondition({ type: 'destroyed_ships', params: { min: 1, ship_type: 'non_fighter' } }, ctx).eligible).toBe(true)
    })
  })
})
```

- [ ] **Step 3: Run tests to confirm they all fail**

```bash
cd ti4-companion-web && npx vitest run ../../supabase/functions/_shared/objectiveConditions.test.ts
```

Expected: all tests fail with "not implemented".

- [ ] **Step 4: Implement `evaluateCondition`**

```typescript
// supabase/functions/_shared/objectiveConditions.ts
// (append after the type definitions)

export function evaluateCondition(
  conditionCheck: ConditionCheck | null,
  ctx: EvaluationContext
): EligibilityResult {
  if (!conditionCheck) return { eligible: true, reason: '' }
  const { type, params } = conditionCheck
  switch (type) {
    case 'count_planets':        return evalCountPlanets(params, ctx)
    case 'count_technologies':   return evalCountTechnologies(params, ctx)
    case 'count_units':          return evalCountUnits(params, ctx)
    case 'count_systems':        return evalCountSystems(params, ctx)
    case 'count_command_tokens': return evalCountCommandTokens(params, ctx)
    case 'planet_stat_total':    return evalPlanetStatTotal(params, ctx)
    case 'control_mecatol':      return evalControlMecatol(params, ctx)
    case 'spend_resources':      return evalSpend('resources', params, ctx)
    case 'spend_influence':      return evalSpend('influence', params, ctx)
    case 'spend_trade_goods':    return evalSpendTradeGoods(params, ctx)
    case 'spend_command_tokens': return evalSpendCommandTokens(params, ctx)
    case 'won_combat':           return evalWonCombat(params, ctx)
    case 'destroyed_ships':      return evalDestroyedShips(params, ctx)
    default:                     return { eligible: true, reason: '' }
  }
}

function evalCountPlanets(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const min = params.min as number
  const filter = params.filter as string | undefined
  let planets = ctx.planets.filter(p => !p.planet_destroyed)

  if (filter === 'tech_specialty') {
    planets = planets.filter(p => p.tech_specialty != null)
  } else if (filter === 'legendary') {
    planets = planets.filter(p => p.type.includes('legendary'))
  } else if (filter === 'cultural' || filter === 'hazardous' || filter === 'industrial') {
    planets = planets.filter(p => p.type.includes(filter))
  } else if (filter === 'same_trait') {
    const counts: Record<string, number> = {}
    for (const p of planets) {
      for (const t of p.type) counts[t] = (counts[t] ?? 0) + 1
    }
    const best = Math.max(0, ...Object.values(counts))
    return best >= min
      ? { eligible: true, reason: '' }
      : { eligible: false, reason: `Need ${min} planets of the same trait (best: ${best})` }
  }

  return planets.length >= min
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${min} qualifying planets (have ${planets.length})` }
}

function evalCountTechnologies(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const filter = params.filter as string | undefined
  const colors = params.colors as number | undefined
  const perColor = params.per_color as number | undefined
  const min = params.min as number | undefined

  let techs = ctx.player.technologies

  if (filter === 'unit_upgrade') {
    const upgradeNames = new Set(ctx.techRef.filter(t => t.is_unit_upgrade).map(t => t.name))
    techs = techs.filter(name => upgradeNames.has(name))
    const needed = min ?? 1
    return techs.length >= needed
      ? { eligible: true, reason: '' }
      : { eligible: false, reason: `Need ${needed} unit upgrade technologies (have ${techs.length})` }
  }

  if (colors != null && perColor != null) {
    const byColor: Record<string, number> = {}
    for (const name of techs) {
      const ref = ctx.techRef.find(t => t.name === name)
      if (ref) byColor[ref.colour] = (byColor[ref.colour] ?? 0) + 1
    }
    const qualifying = Object.values(byColor).filter(count => count >= perColor).length
    return qualifying >= colors
      ? { eligible: true, reason: '' }
      : { eligible: false, reason: `Need ${perColor}+ techs in each of ${colors} colors (qualifying colors: ${qualifying})` }
  }

  const needed = min ?? 1
  return techs.length >= needed
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${needed} technologies (have ${techs.length})` }
}

function evalCountUnits(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const unitParam = (params.unit as string).toLowerCase()
  const min = params.min as number
  const location = params.location as string | undefined

  const homeSystemKeys = new Set(
    ctx.planets.filter(p => p.is_home).map(p => p.system_key)
  )

  let units = ctx.units.filter(u => {
    const name = u.unit_name.toLowerCase()
    const type = u.unit_type.toLowerCase()
    if (unitParam === 'ground_force') return type === 'ground_force'
    if (unitParam === 'structure') return type === 'structure'
    if (unitParam === 'ship') return type === 'ship'
    if (unitParam === 'pds') return name === 'pds'
    if (unitParam === 'space_dock') return name === 'space dock' || name === 'space_dock'
    return name === unitParam || type === unitParam
  })

  if (location === 'non_home') units = units.filter(u => !homeSystemKeys.has(u.system_key))
  if (location === 'home')     units = units.filter(u => homeSystemKeys.has(u.system_key))

  const total = units.reduce((sum, u) => sum + u.count, 0)
  return total >= min
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${min} qualifying units (have ${total})` }
}

function evalCountSystems(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const min = params.min as number
  const filter = params.filter as string | undefined

  const systemsWithUnits = [...new Set(ctx.units.filter(u => u.count > 0).map(u => u.system_key))]
  const homeSystemKeys = new Set(ctx.planets.filter(p => p.is_home).map(p => p.system_key))

  let systems = systemsWithUnits
  if (filter === 'adjacent_mecatol') {
    // Adjacent to 0,0: systems at distance 1 in axial coordinates
    systems = systems.filter(sk => isAdjacentToMecatol(sk))
  }
  if (filter === 'non_home') {
    systems = systems.filter(sk => !homeSystemKeys.has(sk))
  }

  return systems.length >= min
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need units in ${min} qualifying systems (have ${systems.length})` }
}

// Mecatol Rex is at 0,0. Adjacent systems in axial coords are at distance 1.
function isAdjacentToMecatol(systemKey: string): boolean {
  const [q, r] = systemKey.split(',').map(Number)
  // Axial distance from 0,0
  const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
  return dist === 1
}

function evalCountCommandTokens(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const pool = params.pool as string
  const min = params.min as number
  const ct = ctx.player.command_tokens
  const value = pool === 'total'
    ? ct.tactic_total + ct.fleet + ct.strategy
    : ct[pool as keyof typeof ct] ?? 0
  return value >= min
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${min} tokens in ${pool} pool (have ${value})` }
}

function evalPlanetStatTotal(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const stat = params.stat as 'resources' | 'influence'
  const min = params.min as number
  const total = ctx.planets
    .filter(p => !p.planet_destroyed)
    .reduce((sum, p) => sum + p[stat], 0)
  return total >= min
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${min} total ${stat} (have ${total})` }
}

function evalControlMecatol(_params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const controls = ctx.units.some(u => u.system_key === ctx.mecatolSystemKey && u.count > 0)
  return controls
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: 'Must control Mecatol Rex' }
}

function evalSpend(stat: 'resources' | 'influence', params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const amount = params.amount as number
  const available = ctx.planets
    .filter(p => !p.planet_destroyed && !p.exhausted)
    .reduce((sum, p) => sum + p[stat], 0)
  return available >= amount
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${amount} ${stat} to spend (${available} available from ready planets)` }
}

function evalSpendTradeGoods(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const amount = params.amount as number
  const tg = ctx.player.trade_goods
  return tg >= amount
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${amount} trade goods (have ${tg})` }
}

function evalSpendCommandTokens(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const amount = params.amount as number
  const tactic = ctx.player.command_tokens.tactic_total
  return tactic >= amount
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need ${amount} command tokens to spend from tactic pool (have ${tactic})` }
}

function evalWonCombat(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const combatType = params.combat_type as string | undefined
  let combats = ctx.combats.filter(c => c.status === 'complete' && c.winner_player_id === ctx.playerId)
  if (combatType && combatType !== 'any') combats = combats.filter(c => c.combat_type === combatType)
  return combats.length > 0
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Must win a${combatType ? ' ' + combatType : ''} combat first` }
}

function evalDestroyedShips(params: Record<string, unknown>, ctx: EvaluationContext): EligibilityResult {
  const min = params.min as number
  const shipType = params.ship_type as string | undefined

  let total = 0
  for (const combat of ctx.combats.filter(c => c.status === 'complete')) {
    // Determine which side this player was on
    const side = combat.attacker_player_id === ctx.playerId ? 'defender' : 'attacker'
    const destroyed = combat.ships_destroyed[side] ?? {}
    for (const [unitName, count] of Object.entries(destroyed)) {
      if (shipType === 'non_fighter' && unitName.toLowerCase() === 'fighter') continue
      total += count
    }
  }

  return total >= min
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: `Need to destroy ${min} enemy ships (destroyed ${total})` }
}
```

- [ ] **Step 5: Implement `applySpendSideEffect` and `buildEvaluationContext`**

```typescript
// supabase/functions/_shared/objectiveConditions.ts (continued)

export async function applySpendSideEffect(
  type: string,
  params: Record<string, unknown>,
  ctx: EvaluationContext,
  db: SupabaseClient
): Promise<void> {
  if (type === 'spend_resources' || type === 'spend_influence') {
    const stat = type === 'spend_resources' ? 'resources' : 'influence'
    const amount = params.amount as number
    // Exhaust cheapest combination: sort ascending by stat value, exhaust until covered
    const readyPlanets = ctx.planets
      .filter(p => !p.planet_destroyed && !p.exhausted)
      .sort((a, b) => a[stat] - b[stat])
    let remaining = amount
    const toExhaust: string[] = []
    for (const p of readyPlanets) {
      if (remaining <= 0) break
      toExhaust.push(p.planet_name)
      remaining -= p[stat]
    }
    if (toExhaust.length > 0) {
      await db.from('game_player_planets')
        .update({ exhausted: true })
        .eq('player_id', ctx.playerId)
        .in('planet_name', toExhaust)
    }
  } else if (type === 'spend_trade_goods') {
    const amount = params.amount as number
    await db.from('game_players')
      .update({ trade_goods: ctx.player.trade_goods - amount })
      .eq('id', ctx.playerId)
  } else if (type === 'spend_command_tokens') {
    const amount = params.amount as number
    const ct = ctx.player.command_tokens
    await db.from('game_players')
      .update({ command_tokens: { ...ct, tactic_total: ct.tactic_total - amount } })
      .eq('id', ctx.playerId)
  }
  // state-based and event-based types: no side effect
}

export async function buildEvaluationContext(
  db: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<EvaluationContext> {
  const [
    { data: playerRow },
    { data: planetRows },
    { data: unitRows },
    { data: allPlayers },
    { data: combats },
    { data: techRef },
    { data: game },
    { data: factions },
    { data: unitTypes },
  ] = await Promise.all([
    db.from('game_players').select('command_tokens,technologies,trade_goods,faction').eq('id', playerId).single(),
    db.from('game_player_planets')
      .select('planet_name,exhausted,planet_destroyed,tile_id,tiles(planets)')
      .eq('game_id', gameId).eq('player_id', playerId),
    db.from('game_player_units')
      .select('system_key,count,on_planet,units(name,unit_type)')
      .eq('game_id', gameId).eq('player_id', playerId),
    db.from('game_players').select('id,faction').eq('game_id', gameId),
    db.from('game_combats').select('*').eq('game_id', gameId),
    db.from('technologies').select('name,colour,is_unit_upgrade'),
    db.from('games').select('map_tiles').eq('id', gameId).single(),
    db.from('factions').select('name,home_tile_number'),
    db.from('units').select('name,unit_type'),
  ])

  // Build map: tile_number → system_key from game.map_tiles
  const mapTiles = game?.map_tiles as Record<string, string> ?? {}
  const tileNumToSystem: Record<string, string> = {}
  for (const [systemKey, tileNum] of Object.entries(mapTiles)) {
    tileNumToSystem[tileNum as string] = systemKey
  }

  // Find home system key for this player
  const myFaction = playerRow?.faction
  const homeTileNumber = factions?.find(f => f.name === myFaction)?.home_tile_number
  const homeSystemKey = homeTileNumber ? tileNumToSystem[homeTileNumber] : undefined

  // Build planet entries by joining tile planet data
  const planets: PlanetEntry[] = (planetRows ?? []).flatMap(row => {
    const tilePlanets = (row.tiles as any)?.planets ?? []
    const tileEntry = tilePlanets.find((p: any) => p.name === row.planet_name)
    if (!tileEntry) return []
    const systemKey = tileNumToSystem[row.tile_id] ?? ''
    return [{
      planet_name: row.planet_name,
      exhausted: row.exhausted,
      planet_destroyed: row.planet_destroyed,
      resources: tileEntry.resources ?? 0,
      influence: tileEntry.influence ?? 0,
      tech_specialty: tileEntry.tech_specialty ?? null,
      type: tileEntry.type ?? [],
      system_key: systemKey,
      is_home: systemKey === homeSystemKey,
    }]
  })

  // Build unit entries
  const units: UnitEntry[] = (unitRows ?? []).map(row => ({
    system_key: row.system_key,
    unit_name: (row.units as any)?.name ?? '',
    unit_type: (row.units as any)?.unit_type ?? '',
    count: row.count,
    on_planet: row.on_planet,
  }))

  return {
    playerId,
    player: {
      command_tokens: playerRow?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 },
      technologies: playerRow?.technologies ?? [],
      trade_goods: playerRow?.trade_goods ?? 0,
    },
    planets,
    units,
    mecatolSystemKey: '0,0',
    combats: (combats ?? []) as CombatEntry[],
    techRef: (techRef ?? []) as TechEntry[],
  }
}
```

- [ ] **Step 6: Run tests**

```bash
cd ti4-companion-web && npx vitest run ../../supabase/functions/_shared/objectiveConditions.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/objectiveConditions.ts supabase/functions/_shared/objectiveConditions.test.ts
git commit -m "feat: shared objectiveConditions evaluator — all 13 condition types"
```

---

## Task 3: Client Evaluator — `objectiveEvaluator.js`

**Files:**
- Create: `ti4-companion-web/src/lib/objectiveEvaluator.js`
- Test: `ti4-companion-web/tests/lib/objectiveEvaluator.test.js`

This is a direct JS port of `evaluateCondition` from Task 2. Copy the logic exactly — same switch, same helper functions, same return shape. Only `evaluateCondition` is exported (no `applySpendSideEffect`, no `buildEvaluationContext`).

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/lib/objectiveEvaluator.test.js
import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../../src/lib/objectiveEvaluator.js'

function base(overrides = {}) {
  return {
    playerId: 'p1',
    player: { command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 }, technologies: [], trade_goods: 0 },
    planets: [],
    units: [],
    mecatolSystemKey: '0,0',
    combats: [],
    techRef: [],
    ...overrides,
  }
}

function planet(o = {}) {
  return { planet_name: 'A', exhausted: false, planet_destroyed: false, resources: 2, influence: 1, tech_specialty: null, type: [], system_key: '1,0', is_home: false, ...o }
}

it('null conditionCheck → eligible', () => {
  expect(evaluateCondition(null, base())).toEqual({ eligible: true, reason: '' })
})

it('count_planets min:3 with 3 planets → eligible', () => {
  const ctx = base({ planets: [planet(), planet({ planet_name: 'B' }), planet({ planet_name: 'C' })] })
  expect(evaluateCondition({ type: 'count_planets', params: { min: 3 } }, ctx).eligible).toBe(true)
})

it('count_planets min:3 with 2 planets → ineligible', () => {
  const ctx = base({ planets: [planet(), planet({ planet_name: 'B' })] })
  expect(evaluateCondition({ type: 'count_planets', params: { min: 3 } }, ctx).eligible).toBe(false)
})

it('spend_resources not enough ready planets → ineligible', () => {
  const ctx = base({ planets: [planet({ resources: 3, exhausted: false })] })
  expect(evaluateCondition({ type: 'spend_resources', params: { amount: 8 } }, ctx).eligible).toBe(false)
})

it('control_mecatol with unit at 0,0 → eligible', () => {
  const ctx = base({ units: [{ system_key: '0,0', unit_name: 'Carrier', unit_type: 'ship', count: 1, on_planet: null }] })
  expect(evaluateCondition({ type: 'control_mecatol', params: {} }, ctx).eligible).toBe(true)
})

it('unknown type → eligible', () => {
  expect(evaluateCondition({ type: 'future_type', params: {} }, base()).eligible).toBe(true)
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/lib/objectiveEvaluator.test.js
```

Expected: fail with module not found or "not a function".

- [ ] **Step 3: Create the file**

```js
// ti4-companion-web/src/lib/objectiveEvaluator.js
// Client-side mirror of supabase/functions/_shared/objectiveConditions.ts
// Only evaluateCondition is exported — no side effects, no DB calls.

export function evaluateCondition(conditionCheck, ctx) {
  if (!conditionCheck) return { eligible: true, reason: '' }
  const { type, params } = conditionCheck
  switch (type) {
    case 'count_planets':        return evalCountPlanets(params, ctx)
    case 'count_technologies':   return evalCountTechnologies(params, ctx)
    case 'count_units':          return evalCountUnits(params, ctx)
    case 'count_systems':        return evalCountSystems(params, ctx)
    case 'count_command_tokens': return evalCountCommandTokens(params, ctx)
    case 'planet_stat_total':    return evalPlanetStatTotal(params, ctx)
    case 'control_mecatol':      return evalControlMecatol(params, ctx)
    case 'spend_resources':      return evalSpend('resources', params, ctx)
    case 'spend_influence':      return evalSpend('influence', params, ctx)
    case 'spend_trade_goods':    return evalSpendTradeGoods(params, ctx)
    case 'spend_command_tokens': return evalSpendCommandTokens(params, ctx)
    case 'won_combat':           return evalWonCombat(params, ctx)
    case 'destroyed_ships':      return evalDestroyedShips(params, ctx)
    default:                     return { eligible: true, reason: '' }
  }
}

function evalCountPlanets(params, ctx) {
  const min = params.min
  const filter = params.filter
  let planets = ctx.planets.filter(p => !p.planet_destroyed)
  if (filter === 'tech_specialty') planets = planets.filter(p => p.tech_specialty != null)
  else if (filter === 'legendary')  planets = planets.filter(p => p.type.includes('legendary'))
  else if (['cultural','hazardous','industrial'].includes(filter)) planets = planets.filter(p => p.type.includes(filter))
  else if (filter === 'same_trait') {
    const counts = {}
    for (const p of planets) for (const t of p.type) counts[t] = (counts[t] ?? 0) + 1
    const best = Math.max(0, ...Object.values(counts))
    return best >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${min} planets of the same trait (best: ${best})` }
  }
  return planets.length >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${min} qualifying planets (have ${planets.length})` }
}

function evalCountTechnologies(params, ctx) {
  const { min, filter, colors, per_color: perColor } = params
  let techs = ctx.player.technologies
  if (filter === 'unit_upgrade') {
    const upgradeNames = new Set(ctx.techRef.filter(t => t.is_unit_upgrade).map(t => t.name))
    techs = techs.filter(n => upgradeNames.has(n))
    const needed = min ?? 1
    return techs.length >= needed ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${needed} unit upgrade technologies (have ${techs.length})` }
  }
  if (colors != null && perColor != null) {
    const byColor = {}
    for (const name of techs) { const ref = ctx.techRef.find(t => t.name === name); if (ref) byColor[ref.colour] = (byColor[ref.colour] ?? 0) + 1 }
    const qualifying = Object.values(byColor).filter(c => c >= perColor).length
    return qualifying >= colors ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${perColor}+ techs in each of ${colors} colors (qualifying: ${qualifying})` }
  }
  const needed = min ?? 1
  return techs.length >= needed ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${needed} technologies (have ${techs.length})` }
}

function evalCountUnits(params, ctx) {
  const unitParam = params.unit.toLowerCase()
  const min = params.min
  const location = params.location
  const homeKeys = new Set(ctx.planets.filter(p => p.is_home).map(p => p.system_key))
  let units = ctx.units.filter(u => {
    const name = u.unit_name.toLowerCase(), type = u.unit_type.toLowerCase()
    if (unitParam === 'ground_force') return type === 'ground_force'
    if (unitParam === 'structure') return type === 'structure'
    if (unitParam === 'ship') return type === 'ship'
    if (unitParam === 'pds') return name === 'pds'
    if (unitParam === 'space_dock') return name === 'space dock' || name === 'space_dock'
    return name === unitParam || type === unitParam
  })
  if (location === 'non_home') units = units.filter(u => !homeKeys.has(u.system_key))
  if (location === 'home')     units = units.filter(u => homeKeys.has(u.system_key))
  const total = units.reduce((s, u) => s + u.count, 0)
  return total >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${min} qualifying units (have ${total})` }
}

function isAdjacentToMecatol(sk) {
  const [q, r] = sk.split(',').map(Number)
  return (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2 === 1
}

function evalCountSystems(params, ctx) {
  const min = params.min, filter = params.filter
  const homeKeys = new Set(ctx.planets.filter(p => p.is_home).map(p => p.system_key))
  let systems = [...new Set(ctx.units.filter(u => u.count > 0).map(u => u.system_key))]
  if (filter === 'adjacent_mecatol') systems = systems.filter(isAdjacentToMecatol)
  if (filter === 'non_home') systems = systems.filter(sk => !homeKeys.has(sk))
  return systems.length >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need units in ${min} qualifying systems (have ${systems.length})` }
}

function evalCountCommandTokens(params, ctx) {
  const { pool, min } = params
  const ct = ctx.player.command_tokens
  const value = pool === 'total' ? ct.tactic_total + ct.fleet + ct.strategy : ct[pool] ?? 0
  return value >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${min} tokens in ${pool} pool (have ${value})` }
}

function evalPlanetStatTotal(params, ctx) {
  const { stat, min } = params
  const total = ctx.planets.filter(p => !p.planet_destroyed).reduce((s, p) => s + p[stat], 0)
  return total >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${min} total ${stat} (have ${total})` }
}

function evalControlMecatol(_params, ctx) {
  return ctx.units.some(u => u.system_key === ctx.mecatolSystemKey && u.count > 0)
    ? { eligible: true, reason: '' }
    : { eligible: false, reason: 'Must control Mecatol Rex' }
}

function evalSpend(stat, params, ctx) {
  const amount = params.amount
  const available = ctx.planets.filter(p => !p.planet_destroyed && !p.exhausted).reduce((s, p) => s + p[stat], 0)
  return available >= amount ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${amount} ${stat} to spend (${available} available from ready planets)` }
}

function evalSpendTradeGoods(params, ctx) {
  const { amount } = params
  return ctx.player.trade_goods >= amount ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${amount} trade goods (have ${ctx.player.trade_goods})` }
}

function evalSpendCommandTokens(params, ctx) {
  const { amount } = params
  const t = ctx.player.command_tokens.tactic_total
  return t >= amount ? { eligible: true, reason: '' } : { eligible: false, reason: `Need ${amount} command tokens from tactic pool (have ${t})` }
}

function evalWonCombat(params, ctx) {
  const { combat_type: combatType } = params
  let combats = ctx.combats.filter(c => c.status === 'complete' && c.winner_player_id === ctx.playerId)
  if (combatType && combatType !== 'any') combats = combats.filter(c => c.combat_type === combatType)
  return combats.length > 0 ? { eligible: true, reason: '' } : { eligible: false, reason: `Must win a${combatType ? ' ' + combatType : ''} combat first` }
}

function evalDestroyedShips(params, ctx) {
  const { min, ship_type: shipType } = params
  let total = 0
  for (const c of ctx.combats.filter(c => c.status === 'complete')) {
    const side = c.attacker_player_id === ctx.playerId ? 'defender' : 'attacker'
    for (const [name, count] of Object.entries(c.ships_destroyed[side] ?? {})) {
      if (shipType === 'non_fighter' && name.toLowerCase() === 'fighter') continue
      total += count
    }
  }
  return total >= min ? { eligible: true, reason: '' } : { eligible: false, reason: `Need to destroy ${min} enemy ships (destroyed ${total})` }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/objectiveEvaluator.test.js
```

Expected: all pass.

- [ ] **Step 5: Add context-building helpers at the bottom of the file**

```js
// ti4-companion-web/src/lib/objectiveEvaluator.js (append)

export function buildPlanetEntries(playerPlanets, tilesMap, game) {
  const tileNumToSystem = {}
  for (const [sk, tn] of Object.entries(game?.map_tiles ?? {})) tileNumToSystem[tn] = sk
  return playerPlanets.flatMap(row => {
    const tile = tilesMap[row.tile_id]
    const tilePlanet = (tile?.planets ?? []).find(p => p.name === row.planet_name)
    if (!tilePlanet) return []
    const systemKey = tileNumToSystem[tile?.tile_number] ?? ''
    return [{
      planet_name: row.planet_name,
      exhausted: row.exhausted,
      planet_destroyed: row.planet_destroyed,
      resources: tilePlanet.resources ?? 0,
      influence: tilePlanet.influence ?? 0,
      tech_specialty: tilePlanet.tech_specialty ?? null,
      type: tilePlanet.type ?? [],
      system_key: systemKey,
      is_home: row.is_home_system ?? false,
    }]
  })
}

export function buildUnitEntries(allUnits) {
  return allUnits.map(u => ({
    system_key: u.system_key,
    unit_name: u.units?.name ?? '',
    unit_type: u.units?.unit_type ?? '',
    count: u.count,
    on_planet: u.on_planet,
  }))
}
```

- [ ] **Step 6: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/objectiveEvaluator.test.js
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add ti4-companion-web/src/lib/objectiveEvaluator.js ti4-companion-web/tests/lib/objectiveEvaluator.test.js
git commit -m "feat: client objectiveEvaluator — JS mirror of shared evaluator"
```

---

## Task 4: Track Ships Destroyed in `game-assign-hits`

**Files:**
- Modify: `supabase/functions/game-assign-hits/index.ts`
- Test: `supabase/functions/game-assign-hits/index.test.ts`

- [ ] **Step 1: Add failing tests for ships_destroyed update**

In the existing test file, add after existing passing tests:

```typescript
// In game-assign-hits/index.test.ts

it('increments ships_destroyed for attacker-side ship destroyed', async () => {
  // Mock: attacker loses a Destroyer (count goes to 0 → delete)
  // Expect: game_combats.ships_destroyed.attacker.Destroyer incremented by 1
  // Set up mockDb to return combat with attacker_player_id = PLAYER_ID
  // ... (follow existing test pattern in this file)
})

it('increments ships_destroyed for defender-side ship destroyed', async () => {
  // Mock: defender loses a Fighter (count → 0)
  // Expect: ships_destroyed.defender.Fighter incremented by 1
})

it('does not update ships_destroyed for ground force destruction', async () => {
  // Mock: Infantry unit destroyed (on_planet is non-null)
  // Expect: ships_destroyed update NOT called
})
```

- [ ] **Step 2: Find where units are destroyed in the function**

Open `supabase/functions/game-assign-hits/index.ts`. Locate the section where a unit's count reaches 0 and the row is deleted or set to count=0. This is where ships_destroyed must be updated.

- [ ] **Step 3: Add ships_destroyed update after unit destruction**

In the section where `count <= 0` for a unit (and the unit is a ship — `on_planet === null`):

```typescript
// After the unit destroy/decrement, if the unit was a ship (on_planet === null):
if (destroyedUnit.on_planet === null) {
  const side = combat.attacker_player_id === body.player_id ? 'attacker' : 'defender'
  const unitName = destroyedUnit.unit_name  // from units join
  const existing = (combat.ships_destroyed as any)?.[side]?.[unitName] ?? 0
  const updated = {
    ...combat.ships_destroyed,
    [side]: { ...(combat.ships_destroyed as any)[side], [unitName]: existing + destroyedUnit.count }
  }
  await db.from('game_combats')
    .update({ ships_destroyed: updated })
    .eq('id', combat.id)
}
```

> Note: `destroyedUnit.unit_name` requires the `game_player_units` query to join `units(name)`. Check if the existing query already does this; if not, add `units(name)` to the select.

- [ ] **Step 4: Run the assign-hits tests**

```bash
cd ti4-companion-web && npx vitest run ../../supabase/functions/game-assign-hits/index.test.ts
```

Expected: all pass including the new ones.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-assign-hits/index.ts supabase/functions/game-assign-hits/index.test.ts
git commit -m "feat: track ships_destroyed per combat for event-based objective conditions"
```

---

## Task 5: Objectives Data Catalogue and Re-Import

**Files:** No code. Data task using admin UI.

This task populates `condition_check` for all 69 objectives. Build the import JSON and re-import via admin UI.

- [ ] **Step 1: Export current objectives from DB**

Run in Supabase SQL editor:
```sql
SELECT name, stage, condition FROM public_objectives ORDER BY stage, name;
SELECT name, timing, condition FROM secret_objectives ORDER BY name;
```

- [ ] **Step 2: Map each objective to a condition_check JSON**

Use this mapping guide. For each row, add `"condition_check": { "type": "...", "params": { ... } }` to your import JSON.

**Condition type reference:**

| Condition text pattern | type | params example |
|------------------------|------|----------------|
| "Spend N resources" | `spend_resources` | `{ "amount": N }` |
| "Spend N influence" | `spend_influence` | `{ "amount": N }` |
| "Spend N trade goods" | `spend_trade_goods` | `{ "amount": N }` |
| "Spend N command tokens" | `spend_command_tokens` | `{ "amount": N, "pool": "tactic" }` |
| "Control N planets with tech specialties" | `count_planets` | `{ "min": N, "filter": "tech_specialty" }` |
| "Control N planets of the same trait" | `count_planets` | `{ "min": N, "filter": "same_trait" }` |
| "Control N cultural/hazardous/industrial planets" | `count_planets` | `{ "min": N, "filter": "cultural" }` |
| "Have N technologies of different colors (2 in each)" | `count_technologies` | `{ "colors": 2, "per_color": 2 }` |
| "Own N unit upgrade technologies" | `count_technologies` | `{ "min": N, "filter": "unit_upgrade" }` |
| "Have N total technologies" | `count_technologies` | `{ "min": N }` |
| "Have N PDS units" | `count_units` | `{ "unit": "pds", "min": N }` |
| "Have N structures outside home system" | `count_units` | `{ "unit": "structure", "min": N, "location": "non_home" }` |
| "Have N ground forces outside home system" | `count_units` | `{ "unit": "ground_force", "min": N, "location": "non_home" }` |
| "Have ships in N systems adjacent to Mecatol" | `count_systems` | `{ "min": N, "filter": "adjacent_mecatol" }` |
| "Have N command tokens in fleet pool" | `count_command_tokens` | `{ "pool": "fleet", "min": N }` |
| "Control Mecatol Rex" | `control_mecatol` | `{}` |
| "Have planets totalling N resources" | `planet_stat_total` | `{ "stat": "resources", "min": N }` |
| "Win a space combat" | `won_combat` | `{ "combat_type": "space" }` |
| "Win a ground combat" | `won_combat` | `{ "combat_type": "ground" }` |
| "Destroy N or more ships" | `destroyed_ships` | `{ "min": N }` |
| "Destroy N non-fighter ships" | `destroyed_ships` | `{ "min": N, "ship_type": "non_fighter" }` |

- [ ] **Step 3: Re-import public objectives**

Go to `/admin/import/public-objectives`, paste the full objectives JSON array with `condition_check` populated for each entry.

- [ ] **Step 4: Re-import secret objectives**

Go to `/admin/import/secret-objectives`, paste the full secret objectives JSON array.

- [ ] **Step 5: Verify in SQL editor**

```sql
SELECT name, condition_check FROM public_objectives WHERE condition_check IS NULL;
SELECT name, condition_check FROM secret_objectives WHERE condition_check IS NULL;
```

Expected: zero rows returned.

---

## Task 6: Enforce in `game-score-objective`

**Files:**
- Modify: `supabase/functions/game-score-objective/index.ts`
- Test: `supabase/functions/game-score-objective/index.test.ts`

- [ ] **Step 1: Add failing tests**

In the existing test file, add after existing tests:

```typescript
it('422 when player does not control their home system', async () => {
  // Mock: buildEvaluationContext returns ctx where home system planet is missing from player's planets
  // The edge function checks home system separately — mock the game player_planets query to exclude a home planet
  // EXPECT 422 with "Must control your home system"
})

it('422 when condition_check fails', async () => {
  // Mock: public_objectives returns condition_check: { type: 'count_planets', params: { min: 10 } }
  // Mock: player has 2 planets
  // EXPECT 422 with reason text from evaluator
})

it('200 scores and applies spend side effect for spend_resources', async () => {
  // Mock: condition_check: { type: 'spend_resources', params: { amount: 8 } }
  // Mock: player has ready planets covering 8 resources
  // EXPECT: scored_by updated, VP incremented, game_player_planets exhausted for cheapest combination
})

it('200 scores when condition_check is null (no enforcement)', async () => {
  // Mock: public_objectives.condition_check = null
  // EXPECT: scores normally
})
```

- [ ] **Step 2: Update the edge function**

```typescript
// At the top of the file, add imports:
import { buildEvaluationContext, evaluateCondition, applySpendSideEffect } from '../_shared/objectiveConditions.ts'

// In the existing objective fetch, extend the reference table query:
const { data: refObj } = await db
  .from('public_objectives')
  .select('points, condition_check')     // add condition_check
  .eq('id', gameObj.objective_id)
  .single()

// After the 'already scored' check, before the scored_by update, insert:

// 1. Home system control check (§61.16)
const ctx = await buildEvaluationContext(db, body.game_id, body.player_id)
const homeSystemPlanets = ctx.planets.filter(p => p.is_home)
// A player's home system typically has 1-2 planets; they must control all of them.
// We verify by checking if any expected home planets are missing.
// The home system key is derived from the faction's home_tile_number.
// If the player has no home system planets at all (e.g. Mecatol-only game start), skip check.
if (homeSystemPlanets.length === 0 && ctx.planets.length > 0) {
  return errorResponse('Must control your home system to score public objectives', 422)
}

// 2. Condition check
const conditionResult = evaluateCondition(refObj?.condition_check ?? null, ctx)
if (!conditionResult.eligible) {
  return errorResponse(conditionResult.reason, 422)
}

// ... existing scored_by + VP logic unchanged ...

// 3. Spend side effects (after VP update)
if (refObj?.condition_check) {
  await applySpendSideEffect(
    refObj.condition_check.type,
    refObj.condition_check.params,
    ctx,
    db
  )
}
```

> **Note on home system check:** The current approach flags players with 0 home planets when they have other planets. For a more precise check, implement a helper in `objectiveConditions.ts` that queries expected home planets from the tile/faction data and checks all are present in `game_player_planets`. Adjust if needed after testing against real games.

- [ ] **Step 3: Run tests**

```bash
cd ti4-companion-web && npx vitest run ../../supabase/functions/game-score-objective/index.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-score-objective/index.ts supabase/functions/game-score-objective/index.test.ts
git commit -m "feat: enforce objective conditions in game-score-objective"
```

---

## Task 7: Enforce in `game-score-secret-objective`

**Files:**
- Modify: `supabase/functions/game-score-secret-objective/index.ts`
- Test: `supabase/functions/game-score-secret-objective/index.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
it('422 when secret objective condition not met', async () => {
  // Mock: secret_objectives.condition_check: { type: 'won_combat', params: {} }
  // Mock: no completed combats in game
  // EXPECT 422 "Must win a combat first"
})

it('200 scores and applies spend side effect for spend_influence', async () => {
  // Mock: condition_check: { type: 'spend_influence', params: { amount: 6 } }
  // Mock: player has enough ready influence planets
  // EXPECT: scored, VP incremented, planets exhausted
})

it('200 when condition_check is null', async () => {
  // EXPECT: scores normally
})
```

- [ ] **Step 2: Update the edge function**

```typescript
// Add imports at top:
import { buildEvaluationContext, evaluateCondition, applySpendSideEffect } from '../_shared/objectiveConditions.ts'

// In the existing secret_objectives reference query, add condition_check to select.

// After existing state/ownership checks, before the VP update, insert:
const ctx = await buildEvaluationContext(db, body.game_id, body.player_id)
const conditionResult = evaluateCondition(refObj?.condition_check ?? null, ctx)
if (!conditionResult.eligible) {
  return errorResponse(conditionResult.reason, 422)
}

// After VP update:
if (refObj?.condition_check) {
  await applySpendSideEffect(refObj.condition_check.type, refObj.condition_check.params, ctx, db)
}
```

- [ ] **Step 3: Run tests**

```bash
cd ti4-companion-web && npx vitest run ../../supabase/functions/game-score-secret-objective/index.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-score-secret-objective/index.ts supabase/functions/game-score-secret-objective/index.test.ts
git commit -m "feat: enforce secret objective conditions in game-score-secret-objective"
```

---

## Task 8: Load `game_combats` in `useGame`

**Files:**
- Modify: `ti4-companion-web/src/hooks/useGame.js`
- Test: `ti4-companion-web/tests/hooks/useGame.test.jsx`

- [ ] **Step 1: Add failing test**

In existing useGame tests, add:

```js
it('fetches game_combats on load and exposes them in state', async () => {
  // Mock supabase to return combats: [{ id: 'c1', game_id: GAME_ID, status: 'complete' }]
  // Render useGame, wait for load
  // EXPECT result.game.combats to contain the combat row
})
```

- [ ] **Step 2: Add combats fetch and subscription**

In `useGame.js`, in the initial fetch block (alongside the existing `game_public_objectives` fetch), add:

```js
const { data: combatsData } = await supabase
  .from('game_combats')
  .select('*')
  .eq('game_id', gameData.id)

// In the setState call, include:
combats: combatsData ?? []
```

In the Realtime subscription setup (alongside the other table subscriptions), add:

```js
{ event: '*', schema: 'public', table: 'game_combats', filter: `game_id=eq.${gameData.id}` },
async () => {
  const { data } = await supabase.from('game_combats').select('*').eq('game_id', gameData.id)
  setState(prev => ({ ...prev, combats: data ?? [] }))
}
```

Return `combats` as part of the hook's return value alongside existing fields.

- [ ] **Step 3: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/hooks/useGame.test.jsx
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/src/hooks/useGame.js ti4-companion-web/tests/hooks/useGame.test.jsx
git commit -m "feat: load game_combats in useGame for objective condition evaluation"
```

---

## Task 9: Eligibility UI in `ObjectivesSection`

**Files:**
- Modify: `ti4-companion-web/src/components/game/ObjectivesSection.jsx`
- Test: `ti4-companion-web/tests/components/ObjectivesSection.test.jsx`

- [ ] **Step 1: Add failing tests**

```jsx
// In tests/components/ObjectivesSection.test.jsx
import { render, screen } from '@testing-library/react'
import ObjectivesSection from '../../src/components/game/ObjectivesSection.jsx'
import * as evaluator from '../../src/lib/objectiveEvaluator.js'
import { vi } from 'vitest'

vi.mock('../../src/lib/objectiveEvaluator.js')

const baseObj = {
  id: 'o1',
  state: 'revealed',
  scored_by: [],
  public_objectives: { name: 'Test Obj', stage: 1, points: 1, condition: 'Have 3 planets', condition_check: { type: 'count_planets', params: { min: 3 } } }
}
const players = [{ id: 'p1', display_name: 'Alice', colour: 'blue' }, { id: 'p2', display_name: 'Bob', colour: 'red' }]
const game = { phase: 'status' }
const buildCtx = () => ({ playerId: 'p1', player: { command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 }, technologies: [], trade_goods: 0 }, planets: [], units: [], mecatolSystemKey: '0,0', combats: [], techRef: [] })

it('shows enabled SCORE button when current player is eligible', () => {
  evaluator.evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
  render(<ObjectivesSection objectives={[baseObj]} players={players} game={game} currentPlayerId="p1" onScore={vi.fn()} evaluationCtxByPlayer={{ p1: buildCtx(), p2: buildCtx() }} />)
  expect(screen.getByRole('button', { name: /score/i })).not.toBeDisabled()
})

it('shows disabled SCORE button with reason when current player is ineligible', () => {
  evaluator.evaluateCondition.mockReturnValue({ eligible: false, reason: 'Need 2 more planets' })
  render(<ObjectivesSection objectives={[baseObj]} players={players} game={game} currentPlayerId="p1" onScore={vi.fn()} evaluationCtxByPlayer={{ p1: buildCtx(), p2: buildCtx() }} />)
  expect(screen.getByRole('button', { name: /need 2 more planets/i })).toBeDisabled()
})

it('shows green dot for eligible non-scored player', () => {
  evaluator.evaluateCondition.mockImplementation((_check, ctx) =>
    ctx.playerId === 'p1' ? { eligible: true, reason: '' } : { eligible: false, reason: 'nope' }
  )
  render(<ObjectivesSection objectives={[baseObj]} players={players} game={game} currentPlayerId="p1" onScore={vi.fn()} evaluationCtxByPlayer={{ p1: buildCtx(), p2: buildCtx() }} />)
  expect(screen.getByTestId('eligibility-dot-p1')).toHaveClass('bg-success')
  expect(screen.getByTestId('eligibility-dot-p2')).toHaveClass('bg-muted')
})

it('works with null condition_check (always eligible)', () => {
  const obj = { ...baseObj, public_objectives: { ...baseObj.public_objectives, condition_check: null } }
  evaluator.evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
  render(<ObjectivesSection objectives={[obj]} players={players} game={game} currentPlayerId="p1" onScore={vi.fn()} evaluationCtxByPlayer={{ p1: buildCtx(), p2: buildCtx() }} />)
  expect(screen.getByRole('button', { name: /score/i })).not.toBeDisabled()
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/components/ObjectivesSection.test.jsx
```

Expected: fail (new tests not met).

- [ ] **Step 3: Update the component**

```jsx
// ti4-companion-web/src/components/game/ObjectivesSection.jsx
import { evaluateCondition } from '../../lib/objectiveEvaluator.js'

export default function ObjectivesSection({ objectives, players, game, currentPlayerId, onScore, evaluationCtxByPlayer = {} }) {
  const revealed = objectives.filter(o => o.state === 'revealed')
  const isStatusPhase = game?.phase === 'status'

  return (
    <div>
      <p className="label mb-2">PUBLIC OBJECTIVES</p>
      {revealed.length === 0 ? (
        <p className="text-dim text-sm">No objectives revealed yet.</p>
      ) : (
        <div className="panel-inset flex flex-col gap-3">
          {revealed.map(obj => {
            const ref = obj.public_objectives
            const conditionCheck = ref?.condition_check ?? null

            // Evaluate eligibility for all players
            const eligibilityByPlayer = {}
            for (const player of players) {
              const ctx = evaluationCtxByPlayer[player.id]
              eligibilityByPlayer[player.id] = ctx
                ? evaluateCondition(conditionCheck, ctx)
                : { eligible: true, reason: '' }
            }

            const scorers = (obj.scored_by ?? [])
              .map(pid => players.find(p => p.id === pid)?.display_name)
              .filter(Boolean)
            const alreadyScored = (obj.scored_by ?? []).includes(currentPlayerId)
            const myEligibility = eligibilityByPlayer[currentPlayerId] ?? { eligible: true, reason: '' }
            const showScore = isStatusPhase && !alreadyScored && onScore

            return (
              <div key={obj.id} className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-text text-sm">{ref?.name}</span>
                  <span className="text-dim text-xs ml-2">
                    Stage {ref?.stage} · {ref?.points ?? 1} VP
                  </span>
                  {ref?.condition && (
                    <p data-testid="objective-condition" className="text-dim text-xs mt-0.5">
                      {ref.condition}
                    </p>
                  )}
                  {/* Per-player eligibility dots */}
                  <div className="flex gap-1 mt-1">
                    {players.filter(p => !(obj.scored_by ?? []).includes(p.id)).map(player => {
                      const el = eligibilityByPlayer[player.id]
                      return (
                        <span
                          key={player.id}
                          data-testid={`eligibility-dot-${player.id}`}
                          title={el?.eligible ? player.display_name : `${player.display_name}: ${el?.reason}`}
                          className={`inline-block w-2 h-2 rounded-full ${el?.eligible ? 'bg-success' : 'bg-muted'}`}
                        />
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-xs text-success">
                    {scorers.length > 0 ? scorers.join(', ') : <span className="text-dim">—</span>}
                  </div>
                  {showScore && (
                    myEligibility.eligible
                      ? (
                        <button className="btn-ghost text-xs" onClick={() => onScore(obj.id)}>
                          SCORE
                        </button>
                      ) : (
                        <button
                          className="btn-ghost text-xs opacity-40 cursor-not-allowed"
                          disabled
                          title={myEligibility.reason}
                        >
                          {myEligibility.reason}
                        </button>
                      )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire `evaluationCtxByPlayer` in the parent**

In `GameScreen.jsx` (or wherever `ObjectivesSection` is rendered), build and pass `evaluationCtxByPlayer`. This is done client-side using data from `useGame`:

```jsx
// In the component that renders ObjectivesSection:
import { evaluateCondition } from '../../lib/objectiveEvaluator.js'

// Build one context per player from game state:
const evaluationCtxByPlayer = useMemo(() => {
  if (!game || !players || !planets || !units) return {}
  const ctx = {}
  for (const player of players) {
    const myPlanets = buildPlanetEntries(player.id, planets, tiles, game)
    const myUnits = buildUnitEntries(player.id, units)
    ctx[player.id] = {
      playerId: player.id,
      player: {
        command_tokens: player.command_tokens,
        technologies: player.technologies ?? [],
        trade_goods: player.trade_goods ?? 0,
      },
      planets: myPlanets,
      units: myUnits,
      mecatolSystemKey: '0,0',
      combats: game.combats ?? [],
      techRef: technologies ?? [],
    }
  }
  return ctx
}, [game, players, planets, units, tiles, technologies])
```

`buildPlanetEntries` and `buildUnitEntries` are already defined in `objectiveEvaluator.js` (Task 3 Step 5). Import and use them here.

> **Note on `is_home`:** If `game_player_planets` doesn't have an `is_home_system` flag, derive it from `game.map_tiles` + `factions.home_tile_number` (same logic as server-side `buildEvaluationContext`). Check `useGame.js` to see if `factions` data is already loaded; if not, fetch it once in a `useMemo`.

- [ ] **Step 5: Run all tests**

```bash
cd ti4-companion-web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/src/components/game/ObjectivesSection.jsx ti4-companion-web/tests/components/ObjectivesSection.test.jsx ti4-companion-web/src/lib/objectiveEvaluator.js
git commit -m "feat: show per-player eligibility and enforce SCORE button in ObjectivesSection"
```

---

## Task 10: Eligibility UI in `MyPanelSection` (Secret Objectives)

**Files:**
- Modify: `ti4-companion-web/src/components/game/MyPanelSection.jsx`
- Test: `ti4-companion-web/tests/components/MyPanelSection.test.jsx`

- [ ] **Step 1: Add failing tests for secret objective eligibility**

```jsx
// In the existing MyPanelSection test file, add:
import * as evaluator from '../../src/lib/objectiveEvaluator.js'
vi.mock('../../src/lib/objectiveEvaluator.js')

it('shows eligible indicator on held secret objective when condition met', () => {
  evaluator.evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
  // Render MyPanelSection with a held secret objective that has condition_check
  // EXPECT: green indicator visible
})

it('shows reason text on ineligible held secret objective', () => {
  evaluator.evaluateCondition.mockReturnValue({ eligible: false, reason: 'Must win a combat first' })
  // Render MyPanelSection with held secret objective
  // EXPECT: 'Must win a combat first' appears
})

it('disables SCORE button for ineligible secret objective', () => {
  evaluator.evaluateCondition.mockReturnValue({ eligible: false, reason: 'nope' })
  // EXPECT: SCORE button is disabled
})
```

- [ ] **Step 2: Update `MyPanelSection.jsx`**

In the secret objectives section, for each held (unscored) secret objective, add:

```jsx
import { evaluateCondition } from '../../lib/objectiveEvaluator.js'

// Inside the secret objectives render loop:
const secretConditionCheck = obj.secret_objectives?.condition_check ?? null
const secretEligibility = myCtx ? evaluateCondition(secretConditionCheck, myCtx) : { eligible: true, reason: '' }

// Show indicator:
<span
  className={`inline-block w-2 h-2 rounded-full mr-1 ${secretEligibility.eligible ? 'bg-success' : 'bg-muted'}`}
  title={secretEligibility.eligible ? 'Condition met' : secretEligibility.reason}
/>

// SCORE button:
{canScore && (
  secretEligibility.eligible
    ? <button className="btn-ghost text-xs" onClick={() => onScoreSecret(obj.id)}>SCORE</button>
    : <button className="btn-ghost text-xs opacity-40 cursor-not-allowed" disabled title={secretEligibility.reason}>
        {secretEligibility.reason}
      </button>
)}
```

Where `myCtx` is the `EvaluationContext` for the current player, passed as a prop from the parent (same `evaluationCtxByPlayer[currentPlayerId]` built in Task 9).

- [ ] **Step 3: Run all tests**

```bash
cd ti4-companion-web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/src/components/game/MyPanelSection.jsx ti4-companion-web/tests/components/MyPanelSection.test.jsx
git commit -m "feat: eligibility status on secret objectives in MyPanelSection"
```

---

## Task 11: Deploy and Apply Migration

- [ ] **Step 1: Apply migration to production**

```bash
supabase db push
```

- [ ] **Step 2: Deploy updated edge functions**

```bash
supabase functions deploy game-score-objective --no-verify-jwt
supabase functions deploy game-score-secret-objective --no-verify-jwt
supabase functions deploy game-assign-hits --no-verify-jwt
```

- [ ] **Step 3: Update `_index.md` statuses**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change all Phase 36 rows from `planned` to `done`.

- [ ] **Step 4: Final commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "chore: mark phase 36 complete in _index.md"
```
