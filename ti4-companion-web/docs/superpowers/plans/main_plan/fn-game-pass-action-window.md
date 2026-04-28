# fn-game-pass-action-window

**File:** `supabase/functions/game-pass-action-window/index.ts`
**Status:** New
**Prereqs:** migration-036-combat-action-cards

## Functionality

```pseudocode
CORS; AUTH; BODY(game_code, combat_id)
GAME(id); PLAYER; COMBAT

if not combat.phase.startsWith('window_'): ERR('Not in an action window', 409)

side = player.id === combat.attacker_player_id ? 'attacker' : 'defender'
passes = jsonb_set(combat.window_passes, side, true)
UPDATE game_combats SET window_passes=passes

if passes.attacker AND passes.defender:
  advanceFromWindow(combat, passes)

OK({ phase: combat.phase })

// advanceFromWindow(combat):
//   Clear window_passes → {attacker:false, defender:false}
//   Determine next phase:
//
//   'window_pre_space_cannon'    → 'space_cannon'
//   'window_space_cannon_assign' → apply pending space cannon hits; → 'window_pre_barrage'
//   'window_pre_barrage'         → 'barrage'
//   'window_start_round'         → 'window_announce_retreat'
//   'window_announce_retreat'    → 'attacker_roll'
//                                  (if rout_active and attacker can retreat: force retreat logic)
//   'window_pre_assign_defender' → 'defender_assign'
//   'window_post_sustain'        → clear sustained_this_phase
//                                  if destroyed_this_phase non-empty: → 'window_post_destroy'
//                                  else: resume assignment completion → next main phase
//   'window_post_destroy'        → clear destroyed_this_phase; resume assignment completion
//   'window_pre_assign_attacker' → 'attacker_assign'
//   'window_post_combat'         → 'dismissed'
//
//   UPDATE game_combats SET phase=nextPhase, window_passes={attacker:false,defender:false},
//     sustained_this_phase=[] (if clearing), destroyed_this_phase=[] (if clearing)
```

## Tests

```pseudocode
STD_MOCKS; T401; T400(game_code, combat_id); TCORS; T404_PLAYER; T404_COMBAT

GIVEN phase='window_pre_assign_defender', attacker passes, defender already passed
  EXPECT window_passes={attacker:true, defender:true}
  EXPECT phase updated to 'defender_assign'

GIVEN phase='window_pre_assign_defender', only attacker passes (defender not yet)
  EXPECT window_passes={attacker:true, defender:false}
  EXPECT phase unchanged

GIVEN phase='window_post_sustain', sustained_this_phase=[], destroyed_this_phase=[{...}], both pass
  EXPECT phase='window_post_destroy'

GIVEN phase='window_post_sustain', both empty, both pass
  EXPECT phase advances to next main combat phase

GIVEN phase not starting with 'window_'
  EXPECT 409
```
