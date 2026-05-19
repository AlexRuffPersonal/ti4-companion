# fn-game-deploy-mech
**File:** `supabase/functions/game-deploy-mech/index.ts`
**Status:** New
**Prereqs:** migration-050-mech-abilities, [[shared-gameEvents]]

## Functionality
```
POST { game_id, unit_id, system_key, target_planet_name, replacing_infantry? }
```
```
CORS; AUTH; BODY(game_id, unit_id, system_key, target_planet_name)
PLAYER(id, faction)
fetch units WHERE id=unit_id; ERR 404 if missing
ERR 409 if unit_type !== 'mech'
ERR 409 if unit.faction !== player.faction
fetch game_player_planets WHERE game_id + player_id + planet_name; ERR 409 if not found
upsert game_player_units { unit_type:'mech', count+1, on_planet, system_key }
if replacing_infantry:
  fetch game_player_units for infantry on same planet
  if found: decrement count (delete row if count reaches 0)
logEvent(EVT_DEPLOY_MECH, { unit_id, system_key, target_planet_name, replacing_infantry })
OK({ deployed: true })
```
`EVT_DEPLOY_MECH = 'deploy_mech'` added to `_shared/gameEvents.ts`.

## Tests
- `T401`, `T400(game_id)`, `T400(unit_id)`
- `409` faction mismatch
- `409` planet not controlled by player
- `200` deploys mech (inserts game_player_units row)
- `200` with `replacing_infantry=true` removes one infantry from same planet
