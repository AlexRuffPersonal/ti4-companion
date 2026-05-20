# fn-game-resolve-ability-p44

**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** shared-abilityHandlers-p44

## Functionality

In the `purges_source` side-effect block (after handler/effects execution), add a leader case alongside the existing relic and action_card cases:

```
if purges_source AND source_id:
  if source_type === 'relic': ...existing...
  else if source_type === 'action_card': ...existing...
  else if source_type === 'leader':
    SELECT leaders FROM game_players WHERE id=player.id
    UPDATE game_players SET leaders={...leaders, hero:'purged'} WHERE id=player.id
```

The Ul hero (`purges_source=false`) bypasses this path. This path is for future faction heroes that are purged on use (Phases 43a–c).

## Tests

Extend `tests/functions/game-resolve-ability.test.js` with a `describe('purges_source side-effect for leader')` block:

- Happy path: `purges_source=true + source_type='leader'` → game_players.update called with `{ leaders: { hero: 'purged' } }` and returns 200
- Verify handler dispatch for `ul_progenitor_hero` returns 200 (handler mocked at registry level)
- Verify 409 propagation when handler throws with status 409
