# component-GalaxyTab

**File:** `src/components/game/GalaxyTab.jsx`
**Status:** Modify
**Prereqs:** component-GroundCombatModal

## Changes

### Phase 11 — Ground Combat

```pseudocode
import GroundCombatModal

destructure rollGroundDice, assignHits, fireSpaceCannonDefense from useCombat(...)

derive:
  spaceCombatActive = combatActive && combat?.combat_type === 'space'
  groundCombatActive = combatActive && combat?.combat_type === 'ground'

  showSpaceCannon = spaceCombatActive && combat.phase === 'space_cannon'
  showSpaceCombat = (spaceCombatActive && phase !== 'space_cannon') || completedCombat?.combat_type === 'space'
  showGroundCombat = groundCombatActive || completedCombat?.combat_type === 'ground'

add after CombatModal:
  {showGroundCombat && (
    <GroundCombatModal
      combat={displayCombat}
      myPlayerId={myPlayerId}
      players={players}
      systemUnits={systemUnits}
      onRollGroundDice={rollGroundDice}
      onAssignHits={assignHits}
      onFireScd={fireSpaceCannonDefense}
      onClose={() => setCompletedCombat(null)}
    />
  )}
```

### Phase 14 — Bombardment Panel

```pseudocode
import BombardmentPanel (inline section, not a modal)

destructure fireBombardment, advanceBombardment, commitGroundForces from useCombat(...)

// Derive bombardment state
// bombardmentCombats: active game_combats rows with combat_type='bombardment' for current system
// (Realtime subscription on game_combats already fires; filter by combat_type)
bombardmentActive = isActivePlayer &&
  activationDone &&
  !activation?.bombardment_done &&
  spaceCombatPhase === 'complete' (or no space combat)

derive bombardmentCombatsByPlanet = Map(bombardmentCombats by planet_name)

add above GroundCombatModal (shown during pre-commit bombardment window):
  {bombardmentActive && (
    <BombardmentPanel
      systemUnits={systemUnits}
      unitDefs={unitDefs}
      bombardmentCombats={bombardmentCombatsByPlanet}
      myPlayerId={myPlayerId}
      players={players}
      onFireBombardment={fireBombardment}
      onAssignHits={assignHits}
      onAdvance={advanceBombardment}
    />
  )}
```

### BombardmentPanel (inline component in GalaxyTab.jsx or separate file)

```pseudocode
props: { systemUnits, unitDefs, bombardmentCombats, myPlayerId, players,
         onFireBombardment, onAssignHits, onAdvance }

hasBombardmentShips = systemUnits.some(u =>
  u.player_id===myPlayerId && u.on_planet===null && unitDefs.get(u.unit_type)?.bombardment != null)

planets = derive planet names from systemUnits where defender ground forces exist

PANEL(lg):
  LABEL("Bombardment")

  for each planet:
    bc = bombardmentCombats.get(planet)
    if !bc:
      // Not yet fired
      MUTED("{planet}")
      "Fire Bombardment" btn → onFireBombardment(systemKey, planet)
      OR "Skip {planet}" btn (fires advance without creating a row — handled client-side by skipping)
    elif bc.phase === 'bombardment_assign':
      // Defender must assign hits — show for defender; show waiting for attacker
      LABEL("{planet} — {bc.attacker_hits} hit(s)")
      DiceResultsPanel(bc.attacker_dice, bc.attacker_hits)
      IF myPlayerId === bc.defender_player_id:
        FleetDisplay(defenderPlanetUnits, isInteractive=true, hitsToAssign=bc.attacker_hits,
          onConfirm → onAssignHits(bc.id, casualties))
      ELSE:
        MUTED("Waiting for defender to assign losses…")
    elif bc.phase === 'complete':
      MUTED("{planet} — bombardment complete ({bc.attacker_hits} hits)")

  allResolved = all planets either have bc.phase='complete' OR no bc
  if allResolved:
    "Done with Bombardment" btn → onAdvance(systemKey)
```

### Phase 17 — Exploration Badge

```pseudocode
props: add exploration (from useExploration)

// Planet tiles: show explore badge for unexplored planets owned by any player
// (allPlanetState contains explored flag for all players' planets)
for each rendered planet tile:
  planetState = exploration.allPlanetState.find(p => p.planet_name === planet.name && p.player_id === myPlayerId)
  if planetState && !planetState.explored && canExplore(planet):
    render "Explore" badge/button on planet tile
    onClick → open ExplorationModal for this planet

// Frontier tokens: show explore option when active player has Dark Energy Tap
if isActivePlayer && playerHasDarkEnergyTap && system has frontier token:
  render "Explore Frontier" button
  onClick → open ExplorationModal with isFrontier=true, systemKey

{showExplorationModal && (
  <ExplorationModal
    planet={selectedPlanet}
    systemKey={activeSystemKey}
    traits={selectedPlanet.traits}
    isFrontier={exploringFrontier}
    onExplorePlanet={exploration.explorePlanet}
    onResolveCard={exploration.resolveExplorationCard}
    onExploreFrontier={exploration.exploreFrontier}
    onClose={() => setShowExplorationModal(false)}
  />
)}
```

### Phase 18 — Move Ships Button

```pseudocode
import MoveShipsModal

props: add moveShips (from useGalaxy)

// After activation, before combat: show Move Ships button for active player
activationDone = myActivations.has(activeSystemKey)  // system activated this turn
movementStep = isActivePlayer && activationDone && !combatActive

{movementStep && !showMoveModal && (
  <button className="btn-primary" onClick={() => setShowMoveModal(true)}>Move Ships</button>
)}
// OR if no eligible ships:
{movementStep && noEligibleShips && (
  <button className="btn-ghost" onClick={() => setShowMoveModal(false)}>Skip Movement</button>
)}

{showMoveModal && (
  <MoveShipsModal
    gameId={gameId}
    game={game}
    activeSystemKey={activeSystemKey}
    tileData={tileData}
    mapTiles={mapTiles}
    systemUnits={systemUnits}
    myPlayerId={myPlayerId}
    myTokenSystems={myTokenSystems}
    unitDefs={unitDefs}
    onClose={() => setShowMoveModal(false)}
  />
)}
```

## Tests

No new test file. Existing GalaxyTab tests must still pass. Add smoke cases:

```pseudocode
GIVEN activeCombat with combat_type='ground':
  EXPECT GroundCombatModal rendered
  EXPECT CombatModal NOT rendered

GIVEN bombardmentActive=true, hasBombardmentShips=true:
  EXPECT BombardmentPanel rendered with Fire Bombardment buttons per planet

GIVEN all bombardmentCombats phase='complete':
  EXPECT "Done with Bombardment" button rendered
```

## Deploy (after all Phase 14 tasks complete)

```bash
supabase functions deploy game-fire-bombardment --no-verify-jwt
supabase functions deploy game-advance-bombardment --no-verify-jwt
supabase functions deploy game-commit-ground-forces --no-verify-jwt
supabase functions deploy game-fire-space-cannon-defense --no-verify-jwt
supabase functions deploy game-assign-hits --no-verify-jwt
supabase functions deploy game-fire-anti-fighter-barrage --no-verify-jwt
supabase functions deploy game-roll-ground-combat-dice --no-verify-jwt
supabase db push
```
