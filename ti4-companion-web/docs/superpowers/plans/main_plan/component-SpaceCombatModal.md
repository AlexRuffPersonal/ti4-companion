# component-SpaceCombatModal

**File:** `src/components/game/SpaceCombatModal.jsx`
**Status:** Modify
**Prereqs:** hook-useCombat, component-ActionCardWindowPanel
**Also modified in:** Phase 14 (Full Invasion — AFB assign branches)

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

### Phase 14 — AFB Assign branches

Add after the existing `barrage` branch:

```pseudocode
IF combat.phase === 'afb_attacker_assign':
  LABEL("Anti-Fighter Barrage — Assign Losses")
  DiceResultsPanel(combat.barrage_attacker_dice, combat.barrage_attacker_hits) // attacker fired these
  DiceResultsPanel(combat.barrage_defender_dice, combat.barrage_defender_hits) // defender fired these
  IF isAttacker:
    LABEL("Assign {combat.barrage_defender_hits} hit(s) to your fighters")
    FleetDisplay(attackerUnits, isInteractive=true, hitsToAssign=combat.barrage_defender_hits,
      validUnitTypes=['fighter'], onConfirm → onAssignHits)
  ELSE:
    MUTED("Waiting for attacker to assign losses…")

IF combat.phase === 'afb_defender_assign':
  LABEL("Anti-Fighter Barrage — Assign Losses")
  DiceResultsPanel(combat.barrage_attacker_dice, combat.barrage_attacker_hits)
  DiceResultsPanel(combat.barrage_defender_dice, combat.barrage_defender_hits)
  IF isDefender:
    LABEL("Assign {combat.barrage_attacker_hits} hit(s) to your fighters")
    FleetDisplay(defenderUnits, isInteractive=true, hitsToAssign=combat.barrage_attacker_hits,
      validUnitTypes=['fighter'], onConfirm → onAssignHits)
  ELSE:
    MUTED("Waiting for defender to assign losses…")
```

`onAssignHits` calls `assignHits(gameId, combatId, casualties)` from edgeFunctions.

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

// afb_attacker_assign, isAttacker=true
  renders both dice result panels
  renders FleetDisplay isInteractive=true with hitsToAssign=barrage_defender_hits
  FleetDisplay validUnitTypes=['fighter']
  confirm calls onAssignHits

// afb_attacker_assign, isAttacker=false
  does NOT render interactive FleetDisplay
  renders waiting message

// afb_defender_assign, isDefender=true
  renders FleetDisplay isInteractive=true with hitsToAssign=barrage_attacker_hits
  confirm calls onAssignHits

// afb_defender_assign, isDefender=false
  renders waiting message
```

### Phase 20 (Space Combat Action Cards)

Render `ActionCardWindowPanel` above `FleetDisplay` whenever `isWindowPhase` is true:

```pseudocode
IF isWindowPhase:
  <ActionCardWindowPanel
    combat={combat}
    myPlayerId={myPlayerId}
    windowCards={windowCards}
    onPlayCard={playActionCard}
    onPass={passActionWindow}
  />
// FleetDisplay and other phase-specific panels render below as usual
```

```pseudocode
// Phase 20 tests

// window_pre_assign_defender, player has Shields Holding
  renders ActionCardWindowPanel above FleetDisplay
  ActionCardWindowPanel receives windowCards containing Shields Holding
  FleetDisplay still visible below

// window_post_sustain, player has Direct Hit
  ActionCardWindowPanel renders with Direct Hit chip

// non-window phase (attacker_roll)
  ActionCardWindowPanel not rendered
```
