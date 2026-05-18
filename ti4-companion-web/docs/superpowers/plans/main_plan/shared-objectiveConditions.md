# shared-objectiveConditions
**File:** `supabase/functions/_shared/objectiveConditions.ts`
**Status:** New
**Prereqs:** migration-046-objective-conditions

## Functionality

```pseudocode
type EvaluationContext = {
  player: GamePlayer              // command_tokens, technologies, trade_goods
  planets: (GamePlayerPlanet & TilePlanet)[]  // planet rows + tile join (resources, influence, tech_specialty, type[])
  units: GamePlayerUnit[]         // all units for this player
  homeSystems: Record<string, string>  // player_id → system_key
  mecatolSystemKey: string        // always "0,0"
  combats: GameCombat[]           // all game_combats for this game
  neighbors: string[]             // player_ids neighboring this player
  technologies: Technology[]      // reference table (for color lookup)
}

type EligibilityResult = { eligible: boolean; reason: string }

// Condition types handled:
//   count_planets       { min, filter? }
//   count_technologies  { min?, colors?, per_color?, filter? }
//   count_units         { unit, min, location? }
//   count_systems       { min, filter? }
//   count_command_tokens { pool, min }
//   planet_stat_total   { stat, min }
//   control_mecatol     {}
//   spend_resources     { amount }
//   spend_influence     { amount }
//   spend_trade_goods   { amount }
//   spend_command_tokens { amount, pool }
//   won_combat          { combat_type?, vs_neighbor? }
//   destroyed_ships     { min, ship_type? }

export function evaluateCondition(
  conditionCheck: { type: string; params: Record<string, unknown> } | null,
  ctx: EvaluationContext
): EligibilityResult
// null conditionCheck → { eligible: true, reason: '' }

export async function applySpendSideEffect(
  type: string,
  params: Record<string, unknown>,
  ctx: EvaluationContext,
  db: SupabaseClient
): Promise<void>
// spend_resources: exhaust cheapest combination of planets covering amount
// spend_influence: same using influence values
// spend_trade_goods: decrement game_players.trade_goods
// spend_command_tokens: decrement command_tokens[pool]
// other types: no-op

export async function buildEvaluationContext(
  db: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<EvaluationContext>
// parallel queries:
//   game_players row for playerId
//   game_player_planets joined to tiles.planets JSONB for playerId
//   game_player_units for playerId
//   game_players for all players in game (neighbor detection)
//   game_combats for gameId
//   technologies reference table
//   factions to resolve home system keys from map_tiles
```

## Tests

```pseudocode
// evaluateCondition

GIVEN count_planets { min: 3, filter: 'tech_specialty' }, player has 2 tech-specialty planets
  EXPECT { eligible: false, reason: /need 1 more/ }

GIVEN count_planets { min: 3, filter: 'tech_specialty' }, player has 3 tech-specialty planets
  EXPECT { eligible: true }

GIVEN count_technologies { colors: 2, per_color: 2 }, player has 1 green + 3 blue
  EXPECT { eligible: true }

GIVEN count_technologies { colors: 2, per_color: 2 }, player has 3 green + 1 blue
  EXPECT { eligible: true }

GIVEN count_technologies { colors: 2, per_color: 2 }, player has 3 green + 0 blue
  EXPECT { eligible: false }

GIVEN spend_resources { amount: 8 }, player has 2 non-exhausted planets (5+4 resources)
  EXPECT { eligible: true }

GIVEN spend_resources { amount: 8 }, player has 2 non-exhausted planets (3+4 resources)
  EXPECT { eligible: false, reason: /only 7 available/ }

GIVEN won_combat { vs_neighbor: true }, matching complete combat record exists
  EXPECT { eligible: true }

GIVEN won_combat { vs_neighbor: true }, no complete combat record for this player
  EXPECT { eligible: false }

GIVEN null conditionCheck
  EXPECT { eligible: true, reason: '' }

// applySpendSideEffect

GIVEN spend_resources amount=8, planets with resources [5,4,3]
  EXPECT cheapest pair exhausted (4+5 → exhaust those two)
  EXPECT db updated: exhausted=true on those planet rows

GIVEN spend_trade_goods amount=3, player has trade_goods=5
  EXPECT trade_goods updated to 2

GIVEN spend_command_tokens amount=2, pool='tactic', tactic_total=4
  EXPECT command_tokens.tactic_total updated to 2
```
