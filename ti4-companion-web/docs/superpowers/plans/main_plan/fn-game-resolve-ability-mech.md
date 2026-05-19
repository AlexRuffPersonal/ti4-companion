# fn-game-resolve-ability-mech
**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** migration-050-mech-abilities, [[fn-game-resolve-ability-p30]]

## Functionality
Three changes to the existing function:

1. Player select adds `faction` to the columns: `select('id, action_card_count, faction')`

2. `VALID_SOURCE_TYPES` gains `'mech'`

3. `ability_definition_id` validation made conditional:
```
if source_type !== 'mech':
  ERR 400 if ability_definition_id missing
```

4. Mech early-return branch inserted after the player-not-found guard:
```
if source_type === 'mech':
  BODY(source_id)
  fetch units WHERE id=source_id; ERR 404 if missing
  ERR 409 if unit_type !== 'mech'
  ERR 409 if unit.faction !== player.faction
  interpretEffects(unit.effects, { gameId, activatingPlayerId: player.id, selections }, db)
  logEvent(EVT_RESOLVE_ABILITY, { source_type:'mech', source_id, selections })
  OK({ resolved: true })
```

## Tests
- `T401`, `T400(source_id)` for mech source
- `T404` when unit not found
- `409` when unit is not a mech
- `409` when faction mismatch
- `200` calls `interpretEffects` with unit's effects array
- `409` propagated when `interpretEffects` throws DSL error
