# fn-game-fire-anti-fighter-barrage

**File:** `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
**Status:** New
**Prereqs:** migration-030-afb

## Functionality

```pseudocode
CORS AUTH BODY(game_id, combat_id) PLAYER COMBAT

if combat.phase !== 'barrage': ERR('Combat is not in barrage phase', 409)
if combat.barrage_attacker_dice !== null: ERR('Barrage already fired', 409)
if player.id !== combat.attacker_player_id: ERR('Only the attacker can fire barrage', 409)

atkUnits = query game_player_units WHERE game_id, system_key=combat.system_key,
           player_id=attacker_player_id, on_planet IS NULL
defUnits = query game_player_units WHERE game_id, system_key=combat.system_key,
           player_id=defender_player_id, on_planet IS NULL

allTypes = distinct unit_type from atkUnits + defUnits
unitDefs = query units WHERE name IN allTypes AND afb IS NOT NULL  // generalised: any AFB unit

if unitDefs empty: ERR('No units with Anti-Fighter Barrage in this system', 409)

defMap = Map(unitDefs by name)

// Roll AFB simultaneously for both sides
atkResults=[], atkHits=0
for each atkUnit where defMap.has(unit_type):
  ROLL_DICE([atkUnit], defMap using afb stat)  → append to atkResults, accumulate atkHits

defResults=[], defHits=0
for each defUnit where defMap.has(unit_type):
  ROLL_DICE([defUnit], defMap using afb stat)  → append to defResults, accumulate defHits

// Do NOT auto-destroy fighters — transition to assign phase instead
// Determine starting assign phase based on which side has hits
if atkHits > 0:
  nextPhase = 'afb_attacker_assign'   // attacker assigns their own fighter losses first
elif defHits > 0:
  nextPhase = 'afb_defender_assign'
else:
  nextPhase = 'attacker_roll'         // no hits on either side — skip assign entirely

update game_combats SET
  barrage_attacker_dice=atkResults, barrage_attacker_hits=atkHits,
  barrage_defender_dice=defResults, barrage_defender_hits=defHits,
  phase=nextPhase
WHERE id=combat_id

OK({ barrage_attacker_dice:atkResults, barrage_attacker_hits:atkHits,
     barrage_defender_dice:defResults, barrage_defender_hits:defHits,
     phase: nextPhase })
```

Note: `ROLL_DICE` uses the `afb` stat column, not `combat`. Adapt `parseStat` accordingly.
Hit assignment is handled by `game-assign-hits` (`afb_attacker_assign` / `afb_defender_assign` phases).

## Tests

New file: `tests/functions/game-fire-anti-fighter-barrage.test.js`

```pseudocode
STD_MOCKS REQ(game_id, combat_id)
T401 T400(game_id) T400(combat_id) T404_PLAYER T404_COMBAT TCORS

T409('not in barrage phase')       — mock combat.phase='attacker_roll'
T409('barrage already fired')      — mock combat.barrage_attacker_dice=[...]
T409('only attacker can fire')     — mock player.id=defender_player_id
T409('no AFB units')               — mock unitDefs=[]

GIVEN atk has 2 destroyers (afb='9'), def has 1 destroyer + 3 fighters
  mock rolls: attacker gets [10,10] (2 hits), defender gets [5] (0 hits)
  EXPECT game_combats.update called with barrage_attacker_hits=2, barrage_defender_hits=0, phase='afb_attacker_assign'
  EXPECT no game_player_units mutations (no auto-destroy)
  EXPECT response { barrage_attacker_hits:2, barrage_defender_hits:0, phase:'afb_attacker_assign' }

GIVEN only defender rolls hit (atkHits=0, defHits=1)
  EXPECT phase='afb_defender_assign'

GIVEN all rolls miss (atkHits=0, defHits=0)
  EXPECT game_combats.update with both hits=0, phase='attacker_roll'
  EXPECT no game_player_units mutations
```
