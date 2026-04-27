# fn-game-play-promissory-note
**File:** `supabase/functions/game-play-promissory-note/index.ts`
**Status:** Modify
**Prereqs:** shared-promissoryEnforcement, shared-abilityDsl

## Functionality
```pseudocode
CORS AUTH BODY(game_id, note_instance_id, selections?) PLAYER

fetch note instance where id=note_instance_id AND game_id=game_id AND held_by_player_id=player.id AND state='held'
  → 404 if missing

fetch ability_definition via ability_sources where source_type='promissory_note' AND source_id=note.note_id
  → 404 if none

build ResolveContext from selections:
  { gameId, activatingPlayerId: note.held_by_player_id,
    originPlayerId: note.origin_player_id,
    chosenPlayerId: selections.chosenPlayerId,
    chosenTechnologyId: selections.chosenTechnologyId,
    chosenSystemKey: selections.chosenSystemKey,
    chosenDestinationPlanet: selections.chosenDestinationPlanet }

IF ability_definition.handler_key → call named handler from abilityHandlers
ELSE → call interpretEffects(ability_definition.effects, ctx, db)

transition state:
  IF note.into_play_area → state='in_play' (held_by_player_id unchanged)
  ELIF note.purge_on_use → state='discarded'
  ELSE → state='held', held_by_player_id=note.origin_player_id

return OK({ played: true })
```

## Tests
New file: `tests/functions/game-play-promissory-note.test.js`

```pseudocode
STD_MOCKS REQ(game_id, note_instance_id, selections:{})
T401 T400(game_id) T400(note_instance_id) T404_PLAYER
T404('note not found or not held by caller')
T404('no ability_definition for note')
GIVEN note with into_play_area=false, purge_on_use=false → state='held', held_by=origin_player_id
GIVEN note with into_play_area=true → state='in_play', held_by unchanged
GIVEN note with purge_on_use=true → state='discarded'
GIVEN ability_definition with handler_key='ceasefire' → handler called
GIVEN ability_definition with effects=[...] and no handler_key → interpretEffects called
```
