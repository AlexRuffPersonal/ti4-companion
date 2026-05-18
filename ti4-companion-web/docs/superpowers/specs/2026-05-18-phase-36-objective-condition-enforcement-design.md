# Phase 36: Objective Condition Enforcement

**Date:** 2026-05-18
**Status:** Approved

## Overview

Add structured condition enforcement to all 69 public and secret objectives. Instead of relying on the host to manually verify conditions before scoring, the app validates each objective's condition server-side before granting VP, and surfaces eligibility status in the UI so players know whether they can score at a glance.

### Rules basis

- §61.4 — Each objective card describes the requirement a player must fulfill to score.
- §61.5 — A player can score only if they fulfill the requirement at the time indicated on the card.
- §61.10 — Spend-based objectives require paying the cost at the time of scoring.
- §61.16 — A player cannot score public objectives if they do not control each planet in their home system.

---

## Section 1: Data Layer

### Migration 046

```sql
ALTER TABLE public_objectives  ADD COLUMN condition_check JSONB;
ALTER TABLE secret_objectives  ADD COLUMN condition_check JSONB;

ALTER TABLE game_combats
  ADD COLUMN ships_destroyed JSONB NOT NULL DEFAULT '{"attacker":{},"defender":{}}';
-- Shape: { "attacker": { "fighter": 2, "destroyer": 1 }, "defender": { "cruiser": 1 } }
```

`condition_check` is nullable — rows with `null` fall back to always-allowed scoring (safe default during rollout).

### Condition check format

```json
{ "type": "<condition_type>", "params": { ... } }
```

Examples:
```json
{ "type": "count_planets",      "params": { "min": 3, "filter": "tech_specialty" } }
{ "type": "count_technologies", "params": { "colors": 2, "per_color": 2 } }
{ "type": "spend_resources",    "params": { "amount": 8 } }
{ "type": "won_combat",         "params": { "vs_neighbor": true } }
{ "type": "destroyed_ships",    "params": { "min": 2, "ship_type": "non_fighter" } }
```

### Re-import

All 69 objectives are re-imported via the existing admin UI (`admin-import-public-objectives`, `admin-import-secret-objectives`) with `condition_check` populated. No changes needed to the import edge functions — they already forward all fields.

---

## Section 2: Condition Type Catalog

Nine condition types cover all 69 objectives.

### State-based

| Type | Params | Notes |
|------|--------|-------|
| `count_planets` | `min: number`, `filter?: "tech_specialty" \| "same_trait" \| "legendary" \| "cultural" \| "hazardous" \| "industrial"` | Counts controlled, non-destroyed planets matching the filter |
| `count_technologies` | `min?: number`, `colors?: number`, `per_color?: number`, `filter?: "unit_upgrade" \| "color:green"` etc | For "2 in each of 2 colors": `{ colors: 2, per_color: 2 }` |
| `count_units` | `unit: "pds" \| "space_dock" \| "ground_force" \| "ship" \| "structure"`, `min: number`, `location?: "non_home" \| "home" \| "any"` | Sums across all systems |
| `count_systems` | `min: number`, `filter?: "adjacent_mecatol" \| "non_home" \| "with_ships"` | Counts distinct system_keys with player units |
| `count_command_tokens` | `pool: "fleet" \| "strategy" \| "tactic" \| "total"`, `min: number` | Reads `game_players.command_tokens` |
| `planet_stat_total` | `stat: "resources" \| "influence"`, `min: number` | Sum across all controlled, non-destroyed planets regardless of exhaustion |
| `control_mecatol` | _(none)_ | Player has a unit in the Mecatol Rex system |

### Spend-based

| Type | Params | Side effect on scoring |
|------|--------|------------------------|
| `spend_resources` | `amount: number` | Exhaust player's planets totalling ≥ amount (cheapest combination) |
| `spend_influence` | `amount: number` | Same, using influence values |
| `spend_trade_goods` | `amount: number` | Deduct from `game_players.trade_goods` |
| `spend_command_tokens` | `amount: number`, `pool: "tactic"` | Decrement `command_tokens.tactic_total` |

Eligibility check: player must have enough ready (non-exhausted) planets / tokens to cover the cost. `spend_resources` / `spend_influence` sum only non-exhausted planets. This differs from `planet_stat_total`, which counts all controlled planets regardless of exhaustion state (used for objectives that check overall economic strength, not spending capacity).

### Event-based

| Type | Params | Evaluated against |
|------|--------|-------------------|
| `won_combat` | `combat_type?: "space" \| "ground" \| "any"`, `vs_neighbor?: true` | `game_combats` rows for this game where `winner_player_id = player`, `status = complete` |
| `destroyed_ships` | `min: number`, `ship_type?: "non_fighter"` | New `attacker/defender_ships_destroyed` columns on `game_combats` |

---

## Section 3: Shared Evaluator Module

Two parallel files — identical logic, different language:

- **`supabase/functions/_shared/objectiveConditions.ts`** — TypeScript, used by edge functions
- **`src/lib/objectiveEvaluator.js`** — JavaScript, used by React client

### EvaluationContext shape

```ts
type EvaluationContext = {
  player: GamePlayer                        // command_tokens, technologies, trade_goods
  planets: (GamePlayerPlanet & TilePlanet)[] // planet rows with tile join (resources, influence, tech_specialty, type[])
  units: GamePlayerUnit[]                   // all units for this player across all systems
  homeSystems: Record<string, string>       // player_id → system_key of their home system
  mecatolSystemKey: string
  combats: GameCombat[]                     // all game_combats for this game
  neighbors: string[]                       // player_ids who neighbor this player
  technologies: Technology[]                // reference table (for color lookups)
}
```

### Exports

```ts
// Returns { eligible: boolean; reason: string }
export function evaluateCondition(
  conditionCheck: { type: string; params: Record<string, unknown> } | null,
  ctx: EvaluationContext
): EligibilityResult

// Server-only: called after scoring succeeds for spend-based conditions
export async function applySpendSideEffect(
  type: string,
  params: Record<string, unknown>,
  ctx: EvaluationContext,
  db: SupabaseClient
): Promise<void>

// Server-only: builds context from DB for a given player
export async function buildEvaluationContext(
  db: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<EvaluationContext>
```

`evaluateCondition` with `null` condition_check returns `{ eligible: true, reason: '' }` (safe fallback).

---

## Section 4: Server Enforcement

### `game-score-objective` changes

1. Fetch `public_objectives.condition_check` in the existing objective query
2. Call `buildEvaluationContext(db, game_id, player_id)`
3. Pre-condition: verify player controls all planets in their home system (§61.16) — return 422 if not
4. Call `evaluateCondition(condition_check, ctx)` — return 422 with reason if `!eligible`
4. Proceed with existing `scored_by` append + VP increment
5. If spend-based, call `applySpendSideEffect(...)` after VP update

### `game-score-secret-objective` changes

Same pattern as above using `secret_objectives.condition_check`.

### `game-assign-hits` changes

When a hit is applied to a ship (non-planet unit), increment:
- `attacker_ships_destroyed` if the hit is being applied to the attacker's units
- `defender_ships_destroyed` if applied to the defender's units

The migration adds a JSONB column `ships_destroyed` (not two integers) to `game_combats`:
```sql
ALTER TABLE game_combats ADD COLUMN ships_destroyed JSONB NOT NULL DEFAULT '{"attacker":{},"defender":{}}';
```
Shape: `{ attacker: { fighter: 2, destroyer: 1 }, defender: { cruiser: 1 } }` — keyed by unit slug. `game-assign-hits` updates this map when a unit is destroyed. The evaluator aggregates totals by filtering out fighters when `ship_type: "non_fighter"` is set.

---

## Section 5: Client UX

### `ObjectivesSection.jsx`

- Imports `evaluateCondition` from `src/lib/objectiveEvaluator.js`
- Builds `EvaluationContext` per player from data already in `useGame`
- For each revealed objective × each non-scored player:
  - Green dot: eligible
  - Gray dot: not eligible (tooltip shows `reason`)
- SCORE button: disabled + shows reason tooltip if current player is not eligible

### Secret objectives in `MyPanelSection`

Same pattern — owning player sees eligibility status + disabled SCORE button with reason.

### `useGame.js`

One addition: load and subscribe to `game_combats` for the current game (Realtime). Used to evaluate event-based secret objective conditions. All other data needed (planets + tile join, units, technologies) is already fetched.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/046_objective_conditions.sql` | New: `condition_check` on both objective tables; `ships_destroyed` JSONB on `game_combats` |
| `supabase/functions/_shared/objectiveConditions.ts` | New shared module |
| `supabase/functions/game-score-objective/index.ts` | Add condition validation + spend side effects |
| `supabase/functions/game-score-secret-objective/index.ts` | Add condition validation + spend side effects |
| `supabase/functions/game-assign-hits/index.ts` | Track ships destroyed |
| `src/lib/objectiveEvaluator.js` | New client-side evaluator (mirrors TS module) |
| `src/hooks/useGame.js` | Load + subscribe to `game_combats` |
| `src/components/game/ObjectivesSection.jsx` | Show eligibility dots + disable SCORE |
| `src/components/game/MyPanelSection.jsx` | Eligibility on secret objectives |
