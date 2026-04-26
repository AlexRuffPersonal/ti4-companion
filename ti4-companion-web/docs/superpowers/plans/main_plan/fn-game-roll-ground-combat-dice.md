# fn-game-roll-ground-combat-dice

**File:** `supabase/functions/game-roll-ground-combat-dice/index.ts`
**Status:** New
**Prereqs:** migration-028-ground-combat

## Functionality

```pseudocode
CORS AUTH BODY(game_id, combat_id) PLAYER COMBAT

ERR if combat.combat_type !== 'ground'
ERR if phase not in [attacker_roll, defender_roll]
ERR if phase=attacker_roll and caller !== attacker
ERR if phase=defender_roll and caller !== defender

units = query game_player_units
  WHERE game_id, system_key=combat.system_key, on_planet=combat.planet_name, player_id=rollingPlayer

load unit defs (combat stat); ROLL_DICE(units, defMap)

attacker_roll → update combat: attacker_dice=results, attacker_hits=hits, phase=defender_assign
defender_roll → update combat: defender_dice=results, defender_hits=hits, phase=attacker_assign

OK({ phase:nextPhase, dice:results, hits })
```

Note: no barrage phase for ground combat.

## Tests

New file: `tests/functions/game-roll-ground-combat-dice.test.js`

```pseudocode
STD_MOCKS REQ(game_id, combat_id)
T401 T400(game_id) T400(combat_id) T404_PLAYER T404_COMBAT TCORS

T409('combat_type is space')
T409('phase is space_cannon')
T409('attacker rolls on defender_roll phase')
T409('defender rolls on attacker_roll phase')

GIVEN attacker_roll phase, caller=attacker:
  EXPECT units queried with on_planet=combat.planet_name (not null)
  EXPECT combat updated: attacker_dice, attacker_hits, phase=defender_assign
  EXPECT response { phase:'defender_assign', dice:[…], hits:n }

GIVEN defender_roll phase, caller=defender:
  EXPECT combat updated: defender_dice, defender_hits, phase=attacker_assign
```
