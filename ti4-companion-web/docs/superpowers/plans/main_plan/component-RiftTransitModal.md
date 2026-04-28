# component-RiftTransitModal
**File:** `src/components/game/RiftTransitModal.jsx`
**Status:** New
**Prereqs:** hook-useRiftTransit

## Props

```js
{ transit, myPlayerId, players, tileMap,
  onRollAll, onRollOne, onClose, loading, error }
```

`tileMap` = map_tiles from game (system_key → tile_id) merged with tiles reference (tile_id → tile data).

## Functionality

```pseudocode
return null if !transit

isActivePlayer = transit.player_id === myPlayerId
activePlayerName = players.find(p => p.id === transit.player_id)?.faction_name ?? 'Opponent'
systemName = tileMap[transit.system_key]?.name ?? transit.system_key
allRolled = transit.ships.every(s => s.roll !== null)
firstUnrolledId = transit.ships.find(s => s.roll === null)?.unit_id

MODAL_WRAPPER
  PANEL(lg)
    header: LABEL("GRAVITY RIFT — {systemName}")

    IF !isActivePlayer:
      MUTED("Waiting for {activePlayerName} to resolve gravity rift…")

    // Ship list (shown to all players)
    for each ship in transit.ships:
      row: unit_type | cargo summary "({n} Fighter, {m} Infantry)" if cargo.length > 0
           | roll result (ship.roll ?? "—")
           | badge: "DESTROYED" (danger) if destroyed, "SAFE" (success) if rolled && !destroyed

    IF error: render error message

    IF isActivePlayer && !allRolled:
      btn-primary "Roll All" disabled=loading → onRollAll()
      btn-ghost "Roll One" disabled=loading || !firstUnrolledId → onRollOne(firstUnrolledId)

    IF allRolled:
      MUTED("Rift resolved: {ships.filter(s=>s.destroyed).length} destroyed, {ships.filter(s=>!s.destroyed).length} survived")
      IF isActivePlayer:
        btn-primary "Done" → onClose()
```

## Tests

```pseudocode
mock transit object with ships array; mock players

renders null when transit=null
shows system name in header (derived from tileMap)
shows each ship row: unit_type, cargo count, roll result, badge
shows "—" for unrolled ships
shows DESTROYED badge for roll≤3, SAFE for roll>3

isActivePlayer=true, not all rolled: Roll All + Roll One buttons visible
Roll All calls onRollAll
Roll One calls onRollOne with first unrolled unit_id
Roll One disabled when all ships rolled

isActivePlayer=false: no roll buttons; waiting message shown
allRolled=true: summary line visible; Done button visible for active player; no roll buttons
Done calls onClose

loading=true: Roll All + Roll One disabled
error rendered when error prop set
```
