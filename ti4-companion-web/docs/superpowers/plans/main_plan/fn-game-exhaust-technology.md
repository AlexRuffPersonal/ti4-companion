# fn-game-exhaust-technology

**File:** `supabase/functions/game-exhaust-technology/index.ts`
**Status:** New
**Prereqs:** migration-043-tech-effects, shared-techEffects

## Functionality

```pseudocode
CORS; AUTH; BODY(game_id, technology_name); PLAYER(technologies, exhausted_technologies)

ERR 409 'Technology not owned' if technology_name NOT IN player.technologies
ERR 409 'Technology cannot be exhausted' if technology_name NOT IN EXHAUSTABLE_TECHS
ERR 409 'Technology already exhausted' if technology_name IN player.exhausted_technologies

UPDATE game_players SET exhausted_technologies = array_append(exhausted_technologies, technology_name)
  WHERE id = player.id

OK({})
```

## Tests

```pseudocode
STD_MOCKS
TCORS; T401; T400(game_id); T400(technology_name); T404_PLAYER
T409('Technology not owned')
T409('Technology cannot be exhausted') — tech owned but not in EXHAUSTABLE_TECHS
T409('Technology already exhausted')
GIVEN valid exhaustable unexhausted tech EXPECT exhausted_technologies appended
```
