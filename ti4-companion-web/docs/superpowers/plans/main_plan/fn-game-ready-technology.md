# fn-game-ready-technology

**File:** `supabase/functions/game-ready-technology/index.ts`
**Status:** New
**Prereqs:** migration-043-tech-effects

## Functionality

```pseudocode
CORS; AUTH; BODY(game_id, technology_name); PLAYER(exhausted_technologies)

ERR 409 'Technology not exhausted' if technology_name NOT IN player.exhausted_technologies

UPDATE game_players SET exhausted_technologies = array_remove(exhausted_technologies, technology_name)
  WHERE id = player.id

OK({})
```

## Tests

```pseudocode
STD_MOCKS
TCORS; T401; T400(game_id); T400(technology_name); T404_PLAYER
T409('Technology not exhausted')
GIVEN tech in exhausted_technologies EXPECT array_remove applied
```
