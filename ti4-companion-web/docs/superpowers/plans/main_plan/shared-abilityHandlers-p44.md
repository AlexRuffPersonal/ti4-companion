# shared-abilityHandlers-p44

**File:** `supabase/functions/_shared/abilityHandlers.ts`
**Status:** Modify
**Prereqs:** migration-053-titans-ul-attachments

## Functionality

Add `ul_progenitor_hero` to the `handlers` registry:

```
ul_progenitor_hero: async (context, db) =>
  SELECT id, attachments FROM game_player_planets
    WHERE game_id=gameId + player_id=activatingPlayerId + planet_name='Elysium'
    → throw 409 'Elysium not controlled' if null
  ATTACH_PLANET(gameId, activatingPlayerId, 'Elysium', 'Geoform')
  UPDATE game_player_planets SET exhausted=false
    WHERE game_id=gameId + player_id=activatingPlayerId + planet_name='Elysium'
  SELECT leaders FROM game_players WHERE id=activatingPlayerId
  UPDATE game_players SET leaders={...leaders, hero:'attached'} WHERE id=activatingPlayerId
```

Errors are thrown as `Object.assign(new Error(msg), { status: 409|500 })` so `game-resolve-ability` surfaces them correctly.

## Tests

Via `tests/functions/game-resolve-ability.test.js` — the handler registry is mocked at that level. Handler unit test is optional but not required since game-resolve-ability tests verify the integration.
