# component-ObjectivesSection-p36
**File:** `src/components/game/ObjectivesSection.jsx`
**Status:** Modify
**Prereqs:** lib-objectiveEvaluator, hook-useGame-p36

## Changes

```pseudocode
// New prop: evaluationCtxByPlayer: Record<playerId, EvaluationContext>
// (built by parent GameScreen from useGame data, one context per player)

// For each revealed objective:
//   For each player in game:
//     result = evaluateCondition(obj.public_objectives.condition_check, evaluationCtxByPlayer[player.id])
//     eligible = result.eligible
//     reason = result.reason

// In scorers list, show dot per player:
//   already scored → existing success style
//   eligible but not scored → green dot
//   not eligible → gray dot with tooltip showing reason

// SCORE button for current player:
//   eligible → enabled (existing behavior)
//   not eligible → disabled button, tooltip shows reason
//   null condition_check → always enabled (fallback)
```

## Tests

```pseudocode
it('shows green dot for eligible non-scored player')
  mock: evaluateCondition returns { eligible: true }
  EXPECT green indicator present

it('shows gray dot with reason tooltip for ineligible player')
  mock: evaluateCondition returns { eligible: false, reason: 'Need 2 more planets' }
  EXPECT gray dot; tooltip contains 'Need 2 more planets'

it('disables SCORE button when current player is ineligible')
  mock: evaluateCondition returns { eligible: false }
  EXPECT SCORE button disabled

it('enables SCORE button when current player is eligible')
  mock: evaluateCondition returns { eligible: true }
  EXPECT SCORE button enabled

it('enables SCORE button when condition_check is null')
  mock: obj.public_objectives.condition_check = null
  EXPECT SCORE button enabled
```
