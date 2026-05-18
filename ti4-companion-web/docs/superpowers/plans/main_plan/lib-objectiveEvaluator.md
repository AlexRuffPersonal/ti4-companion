# lib-objectiveEvaluator
**File:** `src/lib/objectiveEvaluator.js`
**Status:** New
**Prereqs:** migration-046-objective-conditions

## Functionality

```pseudocode
// JavaScript mirror of shared-objectiveConditions.ts evaluateCondition only.
// applySpendSideEffect and buildEvaluationContext are server-only; not exported here.

// EvaluationContext shape (built from useGame data):
// {
//   player,          // game_players row
//   planets,         // game_player_planets rows each merged with their tile planet entry
//   units,           // game_player_units rows for this player
//   homeSystems,     // { [player_id]: system_key }
//   mecatolSystemKey,// '0,0'
//   combats,         // game_combats rows for this game
//   neighbors,       // player_ids who neighbor this player
//   technologies,    // reference technologies rows
// }

export function evaluateCondition(conditionCheck, ctx)
// → { eligible: boolean, reason: string }
// null conditionCheck → { eligible: true, reason: '' }
// Implements all 13 condition types identical to the TS version
```

## Tests

```pseudocode
// Same condition-type coverage as shared-objectiveConditions tests but in Vitest (JS)

GIVEN count_planets { min: 4 }, player controls 3 planets
  EXPECT { eligible: false, reason: /need 1 more/ }

GIVEN count_command_tokens { pool: 'fleet', min: 5 }, command_tokens.fleet=6
  EXPECT { eligible: true }

GIVEN control_mecatol {}, player has unit in system '0,0'
  EXPECT { eligible: true }

GIVEN control_mecatol {}, player has no unit in system '0,0'
  EXPECT { eligible: false }

GIVEN planet_stat_total { stat: 'resources', min: 12 }, exhausted + ready planets total 14 resources
  EXPECT { eligible: true }
// (exhausted planets still count for planet_stat_total)

GIVEN null conditionCheck
  EXPECT { eligible: true, reason: '' }
```
