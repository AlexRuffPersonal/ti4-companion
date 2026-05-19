# fn-game-land-troops-p39
**File:** `supabase/functions/game-land-troops/index.ts`
**Status:** Modify
**Prereqs:** fn-game-land-troops-p26, migration-046-exploration-fixes

## Functionality
One new check, inserted after planet ownership is established (upsert) and before unit placement. Only runs when `unit_type === 'mech'`:

```pseudocode
if body.unit_type === 'mech':
  fetch game_player_planets WHERE game_id + player_id + planet_name
         SELECT attachments
  planetAttachments = planet.attachments as UUID[] ?? []
  if planetAttachments.length > 0:
    fetch attachments WHERE id IN planetAttachments SELECT name
    attachmentNames = results.map(a => a.name)
    if 'Demilitarized Zone' IN attachmentNames:
      ERR 409 'Cannot place a mech on a Demilitarized Zone planet'
```

Note: `body.unit_type` is not currently a request field — `game-land-troops` always lands infantry. Add this check only if the function is extended to handle mechs; otherwise the DMZ guard is future-proofing against the mech-landing extension. For now, add the check so it is ready when mech landing is added.

Actually — `game-land-troops` currently only handles infantry (troop_count of infantry). The DMZ rule blocks mechs. Since mechs are not yet landable via this function, the guard should be placed at the function entry as a comment-block noting it will apply when `unit_type` is added, OR the check can be added now as dead code that activates when `unit_type='mech'` is eventually passed.

Design decision: add the check now against `body.unit_type` (optional string field). If `body.unit_type === 'mech'`, enforce DMZ. If absent or `'infantry'`, skip.

## Tests
```pseudocode
it('409 Cannot place a mech on a Demilitarized Zone planet')
  body includes unit_type='mech'
  planet.attachments contains DMZ attachment UUID
  attachments table returns [{name:'Demilitarized Zone'}]
  → 409

it('allows infantry landing even when DMZ attachment present')
  body does not include unit_type (default infantry)
  planet has DMZ attachment
  → 200 (no DMZ check for infantry)
```
