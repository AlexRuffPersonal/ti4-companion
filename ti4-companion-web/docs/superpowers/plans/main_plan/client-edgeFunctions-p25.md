# client-edgeFunctions-p25
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-roll-rift-dice

## Changes

```js
// Add export:
export const rollRiftDice = (transitId, rollAll, unitId) =>
  callFunction('game-roll-rift-dice', { transit_id: transitId, roll_all: rollAll, unit_id: unitId })
```

## Tests

```pseudocode
it('rollRiftDice calls game-roll-rift-dice with transit_id, roll_all, unit_id')
it('rollRiftDice omits unit_id when undefined')
```
