# fn-game-roll-rift-dice
**File:** `supabase/functions/game-roll-rift-dice/index.ts`
**Status:** New
**Prereqs:** migration-038-gravity-rift

## Functionality

```pseudocode
CORS; AUTH; BODY(transit_id, roll_all)
// unit_id optional: required when roll_all=false

fetch game_rift_transits where id=transit_id; ERR 404 if missing
ERR 403 if transit.player_id !== userId
ERR 409 if transit.status !== 'pending'

ships = transit.ships (mutable copy)

IF roll_all:
  for each ship in ships where ship.roll === null:
    ship.roll = floor(random() * 10) + 1
    ship.destroyed = ship.roll <= 3
ELSE:
  ERR 400 if unit_id missing
  ship = ships.find(s => s.unit_id === unit_id); ERR 404 if missing
  ERR 409 if ship.roll !== null  // already rolled
  ship.roll = floor(random() * 10) + 1
  ship.destroyed = ship.roll <= 3

update game_rift_transits set ships=ships where id=transit_id

IF all ships have non-null roll:
  // Collect destroyed unit_ids (ships + their cargo)
  destroyedIds = ships.filter(s => s.destroyed).flatMap(s => [s.unit_id, ...s.cargo.map(c => c.unit_id)])
  delete game_player_units where id IN destroyedIds

  // Check for next pending transit for this game (sequential multi-rift)
  nextTransit = select game_rift_transits where game_id=transit.game_id AND status='pending'
    AND created_at < transit.created_at ORDER BY created_at ASC LIMIT 1
  IF nextTransit: // leave it pending; move not complete yet
    update game_rift_transits set status='complete' where id=transit_id
    OK({ complete: false, next_transit_id: nextTransit.id })
  ELSE:
    // Move surviving ships and their cargo to destination
    survivingShipIds = ships.filter(s => !s.destroyed).map(s => s.unit_id)
    survivingCargoIds = ships.filter(s => !s.destroyed).flatMap(s => s.cargo.map(c => c.unit_id))
    update game_player_units set system_key=transit.destination_key
      where id IN [...survivingShipIds, ...survivingCargoIds]
    update game_rift_transits set status='complete' where id=transit_id
    OK({ complete: true, destroyed: destroyedIds })
ELSE:
  OK({ complete: false, ships })
```

## Tests

```pseudocode
STD_MOCKS
T401; TCORS; T400(transit_id); T400(roll_all)

T403: caller is not transit.player_id
T409: transit.status is 'complete'
T404: transit not found

happy roll_all: all null rolls populated with 1–10; ships with roll≤3 marked destroyed=true
happy roll_all: destroyed ships' cargo unit_ids also deleted from game_player_units
happy roll_all last roll: surviving ships updated to destination_key; status set to 'complete'

happy roll one: only targeted ship.roll populated; others remain null; status stays 'pending'
T409: roll one on already-rolled ship → 409

multi-rift: completing transit A (created_at earlier) → transit B still pending; units NOT moved yet
multi-rift: completing final transit → units moved; status complete

happy: no destroyed ships → all ships + cargo moved to destination_key
happy: all ships destroyed → no units moved; status complete; destroyedIds returned
```
