# fn-game-score-objective-p36
**File:** `supabase/functions/game-score-objective/index.ts`
**Status:** Modify
**Prereqs:** shared-objectiveConditions, migration-046-objective-conditions

## Changes

```pseudocode
// In existing objective fetch, also select condition_check:
.select('id, objective_id, state, scored_by')
→ join to public_objectives to get condition_check

// After existing 'not revealed' and 'already scored' checks, add:

// 1. Home system control check (§61.16)
homeSystemPlanets = planets in player's home system (from map_tiles + game_player_planets)
IF any home system planet not in player's game_player_planets → ERR('Must control your home system to score public objectives', 422)

// 2. Condition evaluation
ctx = await buildEvaluationContext(db, game_id, player_id)
result = evaluateCondition(refObj.condition_check, ctx)
IF !result.eligible → ERR(result.reason, 422)

// 3. Existing scored_by + VP logic unchanged

// 4. Spend side effects (after VP update succeeds)
IF conditionCheck is spend-type:
  await applySpendSideEffect(conditionCheck.type, conditionCheck.params, ctx, db)
```

## Tests

```pseudocode
STD_MOCKS

T401, TCORS
T400('game_id'), T400('objective_id'), T400('player_id')
T404_GAME
it('403 non-host cannot score')
it('404 objective not in game')
it('409 objective not yet revealed')
it('409 already scored by this player')

it('422 player does not control home system')
  mock: player missing a home planet
  EXPECT 422

it('422 condition not met')
  mock: evaluateCondition returns { eligible: false, reason: 'Need 2 more planets' }
  EXPECT 422 with reason in body

it('200 scores and awards VP when condition met')
  mock: evaluateCondition returns { eligible: true }
  EXPECT scored_by appended, VP incremented

it('200 applies spend side effect for spend_resources condition')
  mock: condition_check { type: 'spend_resources', params: { amount: 8 } }
  EXPECT applySpendSideEffect called with correct args
```
