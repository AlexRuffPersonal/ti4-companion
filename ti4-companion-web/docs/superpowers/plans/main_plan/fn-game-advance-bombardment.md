# fn-game-advance-bombardment

**File:** `supabase/functions/game-advance-bombardment/index.ts`
**Status:** New
**Prereqs:** migration-031-invasion

## Functionality

```pseudocode
CORS AUTH BODY(game_id, system_key) PLAYER GAME(round)

ACTIVATION(system_key)

// Reject if any bombardment row still has unassigned hits
pending = query game_combats
  WHERE game_id, system_key, combat_type='bombardment', phase='bombardment_assign'
if pending.length > 0: ERR('Unresolved bombardment hits — assign before advancing', 409)

// Set bombardment_done on this activation row
update game_system_activations
  SET bombardment_done=true
  WHERE game_id, system_key, player_id=player.id, round=game.round

OK({ ok: true })
```

Bombardment is optional — the attacker may call this immediately without firing. The only guard is that any fired bombardments must have hits resolved first.

## Tests

New file: `tests/functions/game-advance-bombardment.test.js`

```pseudocode
STD_MOCKS REQ(game_id, system_key)
T401 T400(game_id) T400(system_key) T404_PLAYER TCORS
T409_ACTIVATED

T409('unresolved bombardment hits') — mock pending=[{id:'c1', phase:'bombardment_assign'}]

GIVEN pending=[] (no unresolved rows — either no bombardment fired or all complete)
  EXPECT game_system_activations.update called with bombardment_done=true
  EXPECT response { ok: true }

GIVEN pending=[] even with complete bombardment rows (phase='complete')
  EXPECT advances successfully (only 'bombardment_assign' rows are rejected)
```
