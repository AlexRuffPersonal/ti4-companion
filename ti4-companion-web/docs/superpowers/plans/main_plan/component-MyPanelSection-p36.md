# component-MyPanelSection-p36
**File:** `src/components/game/MyPanelSection.jsx`
**Status:** Modify
**Prereqs:** lib-objectiveEvaluator, hook-useGame-p36

## Changes

```pseudocode
// In secret objectives display section:
//   For each held (unscored) secret objective:
//     result = evaluateCondition(obj.secret_objectives.condition_check, myEvaluationCtx)

//   Show eligibility status next to each secret objective:
//     eligible → green indicator
//     not eligible → gray indicator + tooltip with reason

//   SCORE button (if in correct phase for that objective's timing):
//     eligible → enabled
//     not eligible → disabled with reason tooltip
//     null condition_check → enabled
```

## Tests

```pseudocode
it('shows eligible indicator on secret objective when condition met')
  mock: evaluateCondition returns { eligible: true }
  EXPECT green indicator

it('shows ineligible indicator with reason on secret objective when condition not met')
  mock: evaluateCondition returns { eligible: false, reason: 'Must win a combat first' }
  EXPECT gray indicator; reason shown

it('disables SCORE button for ineligible secret objective')
  mock: eligible: false
  EXPECT SCORE button disabled

it('enables SCORE button when condition_check is null')
  mock: condition_check = null
  EXPECT SCORE button enabled
```
