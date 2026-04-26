# component-GroundCombatModal

**File:** `src/components/game/GroundCombatModal.jsx`
**Status:** New
**Prereqs:** hook-useCombat

## Props

```js
{ combat, myPlayerId, players, systemUnits,
  onRollGroundDice, onAssignHits, onFireScd, onClose }
```

## Functionality

```pseudocode
return null if !combat

load unitDefs from supabase.from('units').select('name,sustain_damage') on mount

planetUnits = systemUnits.filter(u => u.system_key===combat.system_key && u.on_planet===combat.planet_name)
attackerUnits = planetUnits.filter(u => u.player_id===combat.attacker_player_id)
defenderUnits = planetUnits.filter(u => u.player_id===combat.defender_player_id)
isAttacker = myPlayerId === combat.attacker_player_id
isDefender = myPlayerId === combat.defender_player_id

IF combat.status === 'complete':
  render result screen: winner name + Close button → onClose

header: "GROUND COMBAT — {combat.planet_name}" | "ROUND {combat.round}"

// Phase 14: SCD phases (before ground combat rounds)
IF combat.phase === 'scd_fire':
  LABEL("Space Cannon Defense")
  IF isDefender:
    "Fire Space Cannon" btn → onFireScd()
    show loading/error state
  ELSE:
    MUTED("Waiting for defender to fire Space Cannon Defense…")

IF combat.phase === 'scd_assign':
  LABEL("Space Cannon Defense — Assign Losses")
  DiceResultsPanel(combat.scd_dice, combat.scd_hits)
  IF isAttacker:
    LABEL("Assign {combat.scd_hits} hit(s) to your ground forces")
    FleetDisplay(attackerUnits, isInteractive=true, hitsToAssign=combat.scd_hits,
      onConfirm → onAssignHits)
  ELSE:
    MUTED("Waiting for attacker to assign losses…")

// Ground combat rounds (unchanged)
two-column fleet display (FleetDisplay, same as CombatModal):
  attacker: isInteractive = phase=attacker_assign && isAttacker; hitsToAssign = combat.defender_hits
  defender: isInteractive = phase=defender_assign && isDefender; hitsToAssign = combat.attacker_hits
  onConfirm → onAssignHits

roll phases [attacker_roll, defender_roll]:
  IF my roll → "Roll Dice" button → onRollGroundDice
  ELSE → waiting message

show DiceResultsPanel for attacker_dice / defender_dice (same as CombatModal)

NO retreat picker
```

Reuses: `FleetDisplay`, `DiceResultsPanel` (no changes to those components).

## Tests

New file: `tests/components/game/GroundCombatModal.test.jsx`

```pseudocode
mock supabase so units query resolves immediately
mock FleetDisplay + DiceResultsPanel as simple divs

renders null when combat=null
renders planet name in header

// SCD phases
scd_fire, isDefender=true: renders "Fire Space Cannon" button → calls onFireScd
scd_fire, isDefender=false: renders waiting message, no fire button
scd_assign, isAttacker=true: renders DiceResultsPanel(scd_dice), FleetDisplay isInteractive=true hitsToAssign=scd_hits
scd_assign, isAttacker=false: renders waiting message, no interactive FleetDisplay

// Ground combat rounds
shows Roll Dice for attacker on attacker_roll
shows Roll Dice for defender on defender_roll
does NOT show Roll Dice for wrong player
FleetDisplay isInteractive=true for attacker on attacker_assign
FleetDisplay isInteractive=true for defender on defender_assign
shows waiting message when not caller's turn
NO retreat picker rendered (assert element absent)
result screen shows winner name when status=complete
Close button calls onClose
Roll Dice calls onRollGroundDice
Assign hits calls onAssignHits
```
