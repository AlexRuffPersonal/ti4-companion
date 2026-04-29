# hook-useGalaxy-p31
**File:** `src/hooks/useGalaxy.js`
**Status:** Modify
**Prereqs:** —

## Changes

### Fix tile select query

Update the select from `'id, tile_number, planets, type, wormhole'` to `'id, tile_number, planets, type, wormholes, anomalies'`. `wormholes` (text[]) and `anomalies` (text[]) are the correct column names per the schema; `wormhole` (singular) was a pre-existing typo and `anomalies` was missing entirely.

### Add planetStaticMap

Compute alongside `planetOwnership` at the return site (no new state, no new fetches):

```pseudocode
const planetStaticMap = {}
for each tile of Object.values(tileData):
  for each p of tile.planets ?? []:
    planetStaticMap[p.name] = {
      resources:     p.resources,
      influence:     p.influence,
      tech_specialty: p.tech_specialty ?? null,
      traits:        p.type ?? [],   // 'type' field in tile schema = traits array
    }

return {
  ...existing fields...,
  planetStaticMap,
}
```

## Tests

```pseudocode
GIVEN tileData with a tile containing planet { name:'Welfor', resources:2, influence:0, tech_specialty:'blue', type:['cultural'] }
  planetStaticMap['Welfor'] === { resources:2, influence:0, tech_specialty:'blue', traits:['cultural'] }

GIVEN planet with no tech_specialty field
  planetStaticMap[name].tech_specialty === null

GIVEN planet with no type field
  planetStaticMap[name].traits === []

GIVEN tileData is empty
  planetStaticMap === {}
```
