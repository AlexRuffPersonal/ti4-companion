import { useState, useEffect } from 'react'
import HexMap from './HexMap.jsx'
import SystemActionModal from './SystemActionModal.jsx'
import SystemInfoModal from './SystemInfoModal.jsx'
import SpaceCannonModal from './SpaceCannonModal.jsx'
import CombatModal from './CombatModal.jsx'
import GroundCombatModal from './GroundCombatModal.jsx'
import MoveShipsModal from './MoveShipsModal.jsx'
import ExplorationModal from './ExplorationModal.jsx'
import { useCombat } from '../../hooks/useCombat.js'

function BombardmentPanel({ systemKey, systemUnits, unitDefs, bombardmentCombatsByPlanet, myPlayerId, players, onFireBombardment, onAssignHits, onAdvance }) {
  const attackerUnits = (systemUnits ?? []).filter(u => u.player_id === myPlayerId && u.on_planet === null)
  const hasBombardmentShips = attackerUnits.some(u => {
    const def = unitDefs?.get?.(u.unit_type) ?? unitDefs?.[u.unit_type]
    return def?.bombardment != null
  })

  const defenderGroundForces = (systemUnits ?? []).filter(u => u.player_id !== myPlayerId && u.on_planet !== null)
  const planets = [...new Set(defenderGroundForces.map(u => u.on_planet))]

  const getBc = (planet) => bombardmentCombatsByPlanet?.get?.(planet) ?? bombardmentCombatsByPlanet?.[planet]

  const allResolved = planets.length > 0 && planets.every(p => getBc(p)?.phase === 'complete')

  return (
    <div className="panel mb-4" data-testid="bombardment-panel">
      <p className="label mb-3">Bombardment</p>
      {planets.map(planet => {
        const bc = getBc(planet)
        if (!bc) {
          return (
            <div key={planet} className="mb-3">
              <p className="text-dim text-sm mb-1">{planet}</p>
              {hasBombardmentShips && (
                <button className="btn-ghost text-xs mr-2" onClick={() => onFireBombardment(systemKey, planet)}>
                  Fire Bombardment
                </button>
              )}
            </div>
          )
        }
        if (bc.phase === 'bombardment_assign') {
          return (
            <div key={planet} className="mb-3">
              <p className="label text-xs">{planet} — {bc.attacker_hits ?? 0} hit(s)</p>
              {bc.defender_player_id === myPlayerId
                ? <p className="text-dim text-xs">Assign {bc.attacker_hits} hit(s) to your units</p>
                : <p className="text-dim text-xs">Waiting for defender to assign losses…</p>
              }
            </div>
          )
        }
        return (
          <div key={planet} className="mb-3">
            <p className="text-dim text-xs">{planet} — bombardment complete ({bc.attacker_hits ?? 0} hits)</p>
          </div>
        )
      })}
      {allResolved && (
        <button className="btn-primary text-xs" onClick={() => onAdvance(systemKey)}>
          Done with Bombardment
        </button>
      )}
    </div>
  )
}

export default function GalaxyTab({
  gameId, mapTiles, tileData, activations, allPlanets, systemUnits,
  activatedSystems, myActivations, planetOwnership, activeCombat, myPlayerId,
  players, currentPlayer, game, unitDefs, myTokenSystems, planetStaticMap,
  activateSystem, landTroops, exploration,
}) {
  const [selectedSystemKey, setSelectedSystemKey] = useState(null)
  const [custodiansClaimed, setCustodiansClaimed] = useState(false)
  const [completedCombat, setCompletedCombat] = useState(null)
  const [bombardmentCombats, setBombardmentCombats] = useState([])
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [infoSystemKey, setInfoSystemKey] = useState(null)
  const [showExplorationModal, setShowExplorationModal] = useState(false)
  const [selectedPlanet, setSelectedPlanet] = useState(null)

  const {
    combat, fireSpaceCannon, rollDice, rollGroundDice, assignHits, declareRetreat,
    fireBombardment, advanceBombardment,
  } = useCombat(gameId, activeCombat?.id)

  // Hold complete combat state for result screen until player dismisses
  useEffect(() => {
    if (combat?.status === 'complete') setCompletedCombat(combat)
    else if (combat?.status === 'active') setCompletedCombat(null)
  }, [combat])

  const isActivePlayer = game?.active_player_id === currentPlayer?.id
  const tacticUsed = activations.filter(a => a.player_id === currentPlayer?.id).length
  const tacticTotal = currentPlayer?.command_tokens?.tactic_total ?? 0
  const hasAvailableTacticTokens = tacticTotal > tacticUsed

  const combatActive = combat && combat.status === 'active'
  const spaceCombatActive = combatActive && combat.combat_type === 'space'
  const groundCombatActive = combatActive && combat.combat_type === 'ground'
  const showSpaceCannon = spaceCombatActive && combat.phase === 'space_cannon'
  const showSpaceCombat = (spaceCombatActive && combat.phase !== 'space_cannon') || completedCombat?.combat_type === 'space'
  const showGroundCombat = groundCombatActive || completedCombat?.combat_type === 'ground'
  const displayCombat = completedCombat ?? combat

  // Derive the active system for the current player
  const activeSystemActivation = myActivations
    ? activations.find(a => myActivations.has?.(a.system_key) || myActivations.has(a.system_key))
    : null
  const activeSystemKey = activeSystemActivation?.system_key ?? null

  // movementStep: active player has an activation but no combat is active
  const activationDone = isActivePlayer && activeSystemKey !== null
  const movementStep = activationDone && !combatActive

  // Bombardment panel: active player, activation exists, space combat complete or absent, bombardment not done
  const spaceCombatComplete = (combat?.combat_type === 'space' && combat?.status === 'complete') || (!combat && !completedCombat)
  const bombardmentActive = isActivePlayer && activeSystemKey !== null && spaceCombatComplete && !groundCombatActive

  // Build bombardmentCombatsByPlanet map
  const bombardmentCombatsByPlanet = new Map(
    bombardmentCombats.map(bc => [bc.planet_name, bc])
  )

  async function handleActivate(systemKey) {
    try {
      await activateSystem(systemKey)
    } catch (e) {
      console.error('Activate error:', e)
    }
    setSelectedSystemKey(null)
  }

  async function handleLandTroops(systemKey, planetName, troopCount) {
    try {
      const result = await landTroops(systemKey, planetName, troopCount)
      if (result?.custodians_claimed) setCustodiansClaimed(true)
    } catch (e) {
      console.error('Land troops error:', e)
    }
    setSelectedSystemKey(null)
  }

  const selectedTileInfo = selectedSystemKey
    ? tileData[mapTiles[selectedSystemKey]?.tile_id] ?? null
    : null

  return (
    <div className="panel flex flex-col" style={{ height: '70vh' }}>
      <p className="label mb-2">GALAXY</p>
      <div className="flex-1 min-h-0">
        <HexMap
          mapTiles={mapTiles}
          tileData={tileData}
          activations={activations}
          systemUnits={systemUnits}
          planetOwnership={planetOwnership}
          players={players}
          onSelectSystem={setSelectedSystemKey}
        />
      </div>

      {selectedSystemKey && !combatActive && (
        <SystemActionModal
          systemKey={selectedSystemKey}
          tileInfo={selectedTileInfo}
          activations={activations.filter(a => a.system_key === selectedSystemKey)}
          planetOwnership={planetOwnership}
          players={players}
          currentPlayer={currentPlayer}
          isActivePlayer={isActivePlayer}
          hasAvailableTacticTokens={hasAvailableTacticTokens}
          myActivations={myActivations}
          onActivate={handleActivate}
          onLandTroops={handleLandTroops}
          onClose={() => setSelectedSystemKey(null)}
          custodiansClaimed={custodiansClaimed}
          onInfo={() => setInfoSystemKey(selectedSystemKey)}
        />
      )}

      {infoSystemKey && (
        <SystemInfoModal
          systemKey={infoSystemKey}
          tileInfo={tileData[mapTiles[infoSystemKey]?.tile_id] ?? null}
          onClose={() => setInfoSystemKey(null)}
        />
      )}

      {showSpaceCannon && (
        <SpaceCannonModal
          combat={combat}
          myPlayerId={myPlayerId}
          onFire={() => fireSpaceCannon(false)}
          onPass={() => fireSpaceCannon(true)}
        />
      )}

      {showSpaceCombat && (
        <CombatModal
          combat={displayCombat}
          myPlayerId={myPlayerId}
          players={players}
          systemUnits={systemUnits}
          mapTiles={mapTiles}
          tileData={tileData}
          allPlanets={allPlanets}
          onRollDice={rollDice}
          onAssignHits={assignHits}
          onDeclareRetreat={declareRetreat}
          onClose={() => setCompletedCombat(null)}
        />
      )}

      {showGroundCombat && (
        <GroundCombatModal
          combat={displayCombat}
          myPlayerId={myPlayerId}
          players={players}
          systemUnits={systemUnits}
          onRollGroundDice={rollGroundDice}
          onAssignHits={assignHits}
          onFireScd={() => {}}
          onClose={() => setCompletedCombat(null)}
        />
      )}

      {bombardmentActive && (
        <BombardmentPanel
          systemKey={activeSystemKey}
          systemUnits={systemUnits}
          unitDefs={unitDefs}
          bombardmentCombatsByPlanet={bombardmentCombatsByPlanet}
          myPlayerId={myPlayerId}
          players={players}
          onFireBombardment={fireBombardment}
          onAssignHits={assignHits}
          onAdvance={advanceBombardment}
        />
      )}

      {movementStep && (
        <button className="btn-primary" onClick={() => setShowMoveModal(true)}>Move Ships</button>
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

      {exploration && (allPlanets ?? []).map(planet => {
        const planetState = (exploration.allPlanetState ?? []).find(
          p => p.planet_name === planet.planet_name && p.player_id === myPlayerId
        )
        if (!planetState || planetState.explored) return null
        if (!exploration.canExplore(planet.planet_name)) return null
        return (
          <button
            key={planet.planet_name}
            className="btn-primary text-xs animate-pulse"
            data-testid={`explore-badge-${planet.planet_name}`}
            onClick={() => { setSelectedPlanet(planet); setShowExplorationModal(true) }}
          >
            Explore {planet.planet_name}
          </button>
        )
      })}

      {showExplorationModal && selectedPlanet && (
        <ExplorationModal
          planet={selectedPlanet}
          systemKey={activeSystemKey}
          traits={selectedPlanet.traits ?? []}
          isFrontier={false}
          onExplorePlanet={exploration.explorePlanet}
          onResolveCard={exploration.resolveExplorationCard}
          onExploreFrontier={exploration.exploreFrontier}
          onClose={() => setShowExplorationModal(false)}
        />
      )}
    </div>
  )
}