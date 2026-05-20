# fn-game-play-promissory-note-p44

**File:** `supabase/functions/game-play-promissory-note/index.ts`
**Status:** Modify
**Prereqs:** migration-053-titans-ul-attachments

## Functionality

Add `planet_name?: string` to body type. Change `promissory_notes` select to include `name` field.

After fetching `noteRefData`, if `name === 'Terraform'`, branch early before the general `newState` logic:

```
if noteRefData.name === 'Terraform':
  BODY(planet_name) → 400 if missing
  SELECT id, attachments, tiles(type) FROM game_player_planets
    WHERE game_id + player_id + planet_name → 409 'Planet not controlled' if null
  if tile.type === 'faction' OR planet_name === 'Mecatol Rex' → 409 'Cannot attach to home planet or Mecatol Rex'
  ATTACH_PLANET(gameId, playerId, planet_name, 'Terraform')
  UPDATE game_player_promissory_notes SET state='in_play' WHERE id=note_instance_id
  logEvent + OK({ played: true })
  return early (skip general newState block)
```

Non-Terraform notes: existing `newState` logic unchanged.

## Tests

Extend `tests/functions/game-play-promissory-note.test.js` mockDb to handle `game_player_planets` (with embedded tiles join) and `attachments` tables. Add a `describe('Terraform attachment')` block:

- T400: missing `planet_name` → 400
- T409: planet not controlled (planetRow null) → 409
- T409: tile.type === 'faction' → 409 'Cannot attach to home planet or Mecatol Rex'
- T409: planet_name === 'Mecatol Rex' → 409 same
- T409: attachment already in planet.attachments → 409 'Already attached'
- Happy path: attaches and returns `{ played: true }` 200
