# fn-game-roll-combat-dice-p39b
**File:** `supabase/functions/game-roll-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** fn-game-roll-combat-dice-p30

## Functionality
- After dice roll, before returning results: read game_combats.cavalry_active_player_id
- If cavalry_active_player_id = activatingPlayerId AND cavalry_unit_id is set:
  - Replace stats for the unit matching cavalry_unit_id with Nomad flagship stats (move=1, combat=5(×2), capacity=3, sustain)
  - Reroll that unit's dice if it was already rolled with wrong stats (replace result)
- Note: cavalry_active_player_id and cavalry_unit_id are pre-existing columns (migration 032)

## Tests (game-roll-combat-dice.phase39b.test.js)
- cavalry_active_player_id set for caller, cavalry_unit_id matches a unit → flagship stats applied to that unit
- cavalry_active_player_id set for opponent, not caller → no effect
- cavalry_active_player_id null → no effect
