# component-SpaceCombatModal

**File:** `src/components/game/SpaceCombatModal.jsx`
**Status:** Modify
**Prereqs:** hook-useCombat

## Changes

Add a `barrage` phase branch. Three sub-states based on combat row data:

```pseudocode
IF combat.phase === 'barrage':

  isAttacker = myPlayerId === combat.attacker_player_id

  STATE 1 — barrage not yet fired AND AFB units present (barrage_attacker_dice===null && hasAfbUnits):
    LABEL("Anti-Fighter Barrage")
    list AFB-capable unit types present in system (derived from systemUnits + unitDefs)
    IF isAttacker:
      "Fire Anti-Fighter Barrage" btn → onFireBarrage()
      show loading/error state
    ELSE:
      MUTED("Waiting for attacker to fire barrage…")

  STATE 2 — barrage not yet fired AND no AFB units (barrage_attacker_dice===null && !hasAfbUnits):
    MUTED("No units capable of Anti-Fighter Barrage")
    IF isAttacker:
      "Continue to Combat" btn → onAdvanceBarrage()
    ELSE:
      MUTED("Waiting for attacker…")

  STATE 3 — results stored (barrage_attacker_dice !== null):
    LABEL("Anti-Fighter Barrage Results")
    attacker barrage results card: DiceResultsPanel(combat.barrage_attacker_dice, combat.barrage_attacker_hits)
    defender barrage results card: DiceResultsPanel(combat.barrage_defender_dice, combat.barrage_defender_hits)
    IF isAttacker:
      "Continue to Combat" btn → onAdvanceBarrage()
    ELSE:
      MUTED("Waiting for attacker…")
```

`hasAfbUnits` prop: boolean — true if any unit in system (either side) has a non-null `afb` stat.

## Tests

Extend `tests/components/game/SpaceCombatModal.test.jsx` (or equivalent existing test file).

```pseudocode
// barrage phase, hasAfbUnits=true, barrage_attacker_dice=null, isAttacker=true
  renders "Fire Anti-Fighter Barrage" button
  clicking calls onFireBarrage

// barrage phase, hasAfbUnits=true, barrage_attacker_dice=null, isAttacker=false
  does NOT render fire button
  renders waiting message

// barrage phase, hasAfbUnits=false, barrage_attacker_dice=null, isAttacker=true
  renders "No units capable" message
  renders "Continue to Combat" button → calls onAdvanceBarrage

// barrage phase, barrage_attacker_dice=[...], isAttacker=true
  renders DiceResultsPanel for attacker dice
  renders DiceResultsPanel for defender dice
  renders "Continue to Combat" button → calls onAdvanceBarrage

// barrage phase, barrage_attacker_dice=[...], isAttacker=false
  renders results panels
  does NOT render "Continue to Combat" button
  renders waiting message
```
