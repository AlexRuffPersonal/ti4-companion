# fn-game-move-ships-p25
**File:** `supabase/functions/game-move-ships/index.ts`
**Status:** Modify
**Prereqs:** migration-038-gravity-rift, fn-game-move-ships

## Changes

After all Phase 18 validation passes and before the write pass, check for rift systems in path:

```pseudocode
riftSystemKeys = path (excluding destination_key) where tileMap[key].anomalies includes 'gravity_rift'

IF riftSystemKeys.length > 0:
  // Separate ships from transported units
  shipUnitIds = unit_ids where unit_type NOT IN ['Fighter','Infantry']
  transportedUnitIds = unit_ids where unit_type IN ['Fighter','Infantry']

  // Assign transported units to carrier ships by capacity (greedy)
  fetch unitDefs for shipUnitIds unit_types → capacityMap { unit_type → capacity }
  cargoAssignment = [] // array of { unit_id (ship), unit_type (ship), cargo: [{unit_id, unit_type}] }
  remainingTransported = [...transportedUnitIds]
  for each shipUnitId in shipUnitIds:
    cap = capacityMap[ship.unit_type]
    assigned = remainingTransported.splice(0, cap)
    cargoAssignment.push({ unit_id: shipUnitId, unit_type: ship.unit_type,
      roll: null, destroyed: false,
      cargo: assigned.map(u => ({ unit_id: u.unit_id, unit_type: u.unit_type })) })

  // Insert one transit row per rift system (path order = created_at order)
  for each riftKey in riftSystemKeys (in path order):
    insert game_rift_transits { game_id, system_key: riftKey, destination_key,
      player_id: userId, ships: cargoAssignment, status: 'pending' }

  // Hold move — do NOT execute the Phase 18 write pass
  OK({ moved: false, rift_transit: true })

ELSE:
  // No rifts — execute Phase 18 write pass as normal
```

## Tests

```pseudocode
STD_MOCKS

happy: no rift in path → units moved immediately, no transit rows inserted
happy: one rift in path → one transit row inserted; units NOT moved; response { moved:false, rift_transit:true }
happy: two rifts in path → two transit rows inserted in path order
happy: carrier with 2 fighters → transit ships entry has cargo: [{fighter}, {fighter}]
happy: infantry and fighters distributed across two carriers by capacity
T409: all existing Phase 18 validations still apply (rift check comes after)
```
