# fn-game-assign-ground-hits

**File:** `supabase/functions/game-assign-ground-hits/index.ts`
**Status:** New
**Prereqs:** migration-028-ground-combat, fn-game-land-troops

## Functionality

```pseudocode
CORS AUTH BODY(game_id, combat_id, casualties[]) PLAYER COMBAT

ERR if combat.combat_type !== 'ground'
ERR if phase not in [defender_assign, attacker_assign]

assignee = defender_assign ? combat.defender_player_id : combat.attacker_player_id
hitsNeeded = defender_assign ? combat.attacker_hits : combat.defender_hits

ERR if caller !== assignee
ERR if casualties.length !== hitsNeeded

units = query game_player_units
  WHERE game_id, system_key=combat.system_key, on_planet=combat.planet_name, player_id=assignee

APPLY_CASUALTIES(casualties, unitMap, defMap)   // sustain or destroy

IF defender_assign:
  update combat phase=defender_roll
  OK({ phase:'defender_roll' })

IF attacker_assign:
  count attacker units remaining on planet
  count defender units remaining on planet

  IF both > 0:
    update combat: phase=attacker_roll, round=round+1, clear dice/hits
    OK({ phase:'attacker_roll', round:nextRound })

  IF defender = 0 (attacker wins):
    CLAIM_PLANET(gameId, attacker, planet_name, tileId)
    CUSTODIANS(gameId, attacker, system_key, game)
    update combat: status=complete, winner=attacker
    OK({ status:'complete', winner_player_id:attacker })

  IF attacker = 0 (defender wins):
    update combat: status=complete, winner=defender
    OK({ status:'complete', winner_player_id:defender })
```

Note: no retreat logic (ground combat has no retreat).

## Tests

New file: `tests/functions/game-assign-ground-hits.test.js`

```pseudocode
STD_MOCKS REQ(game_id, combat_id, casualties)
T401 T400(game_id) T400(combat_id) T400(casualties=non-array) T404_PLAYER T404_COMBAT TCORS

T409('combat_type is space')
T409('phase is attacker_roll')
T409('caller is not assignee')
T409('casualties.length !== hitsNeeded')
T409('sustain on unit without sustain_damage')
T409('sustain on already-damaged unit')

GIVEN defender_assign:
  EXPECT phase advances to defender_roll

GIVEN attacker_assign, both sides have units:
  EXPECT phase=attacker_roll, round incremented, dice/hits cleared

GIVEN attacker_assign, defender has 0 units:
  EXPECT CLAIM_PLANET called for attacker
  EXPECT defender's game_player_planets row deleted
  EXPECT combat status=complete, winner=attacker

GIVEN attacker wins on Mecatol Rex (system_key='0,0'), custodians not yet claimed:
  EXPECT games updated: custodians_claimed=true, agenda_unlocked=true
  EXPECT attacker VP +1

GIVEN custodians already claimed:
  EXPECT no VP/flag update

GIVEN attacker_assign, attacker has 0 units:
  EXPECT no planet ownership change
  EXPECT combat status=complete, winner=defender
```
