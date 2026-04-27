# component-MoveShipsModal
**File:** `src/components/game/MoveShipsModal.jsx`
**Status:** New
**Prereqs:** hook-useMovement

## Functionality

```
props: { gameId, game, activeSystemKey, tileData, mapTiles, systemUnits, myPlayerId,
         myTokenSystems, unitDefs, onClose }

const movement = useMovement(gameId, game, tileData, mapTiles, systemUnits, myPlayerId, myTokenSystems)

const [step, setStep] = useState('select') // 'select' | 'route' | 'excess'
const [activeShipIndex, setActiveShipIndex] = useState(0)
const [error, setError] = useState(null)

// Step 1 — Select ships
// Group player's space units by system; show systems where unit has move>0 and no command token
eligibleSystems = systemUnits
  .filter(u => u.player_id===myPlayerId && on_planet===null && unitDefs[u.unit_type]?.move > 0)
  .filter(u => !myTokenSystems.has(u.system_key) || u.system_key===activeSystemKey)
  .groupBy(u => u.system_key)

MODAL_WRAPPER → PANEL(lg):
  LABEL("Step 1 — Select Ships to Move")
  for each eligible system:
    system header
    for each unit type in system:
      toggle button per ship (add/remove from selectedShips)
  "Next: Draw Routes" btn (disabled if selectedShips empty) → setStep('route')
  "Skip Movement" btn → onClose()

// Step 2 — Draw routes (one ship at a time)
activeShip = selectedShips[activeShipIndex]
currentPath = activeShip.path

PANEL(lg):
  LABEL("Step 2 — {activeShip.unit_type} from {activeShip.origin_system_key} — Moves left: {movesLeft}")
  inline HexMap highlight:
    reachable = reachableSystems(activeShip, currentPath)
    current path systems highlighted blue; reachable systems highlighted green; blocked grey
  
  per system on currentPath (after origin): cargo picker for fighters/infantry at that system
    show current picks; +/- buttons; capped by capacityRemaining

  "Undo last hop" btn; "Done with this ship" btn → advance activeShipIndex or → setStep('excess')
  "Back" btn → setStep('select')

// Step 3 — Resolve excess
excess = excessBySystem()

PANEL(lg):
  LABEL("Step 3 — Resolve Excess Capacity")
  if no excess: MUTED("No excess units — ready to confirm.")
  for each system with excess:
    LABEL("{system_key}")
    for each excess entry: show unit + excess count; -/+ buttons to add to excessRemovals
  
  "Confirm Movement" btn (disabled if !isReadyToConfirm()) →
    confirmMove(activeSystemKey).then(onClose).catch(e => setError(e.message))
  "Back" btn → setStep('route')
  {error && <p className="text-danger">{error}</p>}
```

## Tests

```
renders Step 1 with eligible ship systems listed
toggle ship → adds to selectedShips; "Next" enables
"Skip Movement" → calls onClose
Step 2 renders route drawing with move-counter
cargo picker shows only fighters/infantry (not ships)
"Done with this ship" when all ships routed → advances to Step 3
Step 3 "Confirm Movement" disabled when excess unresolved
Step 3 "Confirm Movement" enabled when excess resolved → calls confirmMove
error from confirmMove shown in red
```
