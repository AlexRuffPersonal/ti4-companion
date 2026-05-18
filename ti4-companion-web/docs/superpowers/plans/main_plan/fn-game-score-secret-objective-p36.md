# fn-game-score-secret-objective-p36
**File:** `supabase/functions/game-score-secret-objective/index.ts`
**Status:** Modify
**Prereqs:** shared-objectiveConditions, migration-046-objective-conditions

## Changes

```pseudocode
// In existing objective fetch, also select condition_check from secret_objectives join

// After existing state/ownership checks, add:
ctx = await buildEvaluationContext(db, game_id, player_id)
result = evaluateCondition(refObj.condition_check, ctx)
IF !result.eligible → ERR(result.reason, 422)

// Existing scored + VP logic unchanged

// Spend side effects (after VP update succeeds)
IF conditionCheck is spend-type:
  await applySpendSideEffect(conditionCheck.type, conditionCheck.params, ctx, db)
```

## Tests

```pseudocode
STD_MOCKS

T401, TCORS
T400('game_id'), T400('objective_id'), T400('player_id')
T404_GAME

it('422 condition not met')
  mock: evaluateCondition returns { eligible: false, reason: 'Must win a combat first' }
  EXPECT 422 with reason

it('200 scores when condition met')
  mock: evaluateCondition returns { eligible: true }
  EXPECT VP incremented, objective marked scored

it('200 applies spend side effect for spend_influence condition')
  mock: condition_check { type: 'spend_influence', params: { amount: 6 } }
  EXPECT applySpendSideEffect called
```
