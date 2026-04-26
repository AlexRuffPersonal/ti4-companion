# fn-game-advance-barrage

**File:** `supabase/functions/game-advance-barrage/index.ts`
**Status:** New
**Prereqs:** migration-030-afb

## Functionality

```pseudocode
CORS AUTH BODY(game_id, combat_id) PLAYER COMBAT

if combat.phase !== 'barrage': ERR('Combat is not in barrage phase', 409)
if player.id !== combat.attacker_player_id: ERR('Only the attacker can advance barrage', 409)

if combat.barrage_attacker_dice IS NULL:
  // Barrage not yet fired — only allowed to skip if truly no AFB units in system
  allUnits = query game_player_units WHERE game_id, system_key=combat.system_key, on_planet IS NULL
  types = distinct unit_type from allUnits
  afbDefs = query units WHERE name IN types AND afb IS NOT NULL
  if afbDefs.length > 0: ERR('Must fire Anti-Fighter Barrage before advancing', 409)

update game_combats SET phase='attacker_roll' WHERE id=combat_id

OK({ phase: 'attacker_roll' })
```

## Tests

New file: `tests/functions/game-advance-barrage.test.js`

```pseudocode
STD_MOCKS REQ(game_id, combat_id)
T401 T400(game_id) T400(combat_id) T404_PLAYER T404_COMBAT TCORS

T409('not in barrage phase')           — mock combat.phase='attacker_roll'
T409('only attacker can advance')      — mock player.id=defender_player_id
T409('must fire barrage first')        — mock barrage_attacker_dice=null, afbDefs=[{name:'destroyer'}]

GIVEN barrage_attacker_dice=null, afbDefs=[]   // no AFB units — skip allowed
  EXPECT phase updated to 'attacker_roll'
  EXPECT response { phase: 'attacker_roll' }

GIVEN barrage_attacker_dice=[...]              // already fired
  EXPECT afbDefs query NOT called
  EXPECT phase updated to 'attacker_roll'
  EXPECT response { phase: 'attacker_roll' }
```
