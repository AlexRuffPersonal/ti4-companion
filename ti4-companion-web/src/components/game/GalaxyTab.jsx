import { useState, useEffect } from 'react'
import HexMap from './HexMap.jsx'
import SystemActionModal from './SystemActionModal.jsx'
import SpaceCannonModal from './SpaceCannonModal.jsx'
import CombatModal from './CombatModal.jsx'
import { useCombat } from '../../hooks/useCombat.js'

export default function GalaxyTab({
  gameId, mapTiles, tileData, activations, allPlanets, systemUnits,
  activatedSystems, myActivations, planetOwnership, activeCombat, myPlayerId,
  players, currentPlayer, game,
  activateSystem, landTroops,
}) {
  const [selectedSystemKey, setSelectedSystemKey] = useState(null)
  const [custodiansClaimed, setCustodiansClaimed] = useState(false)
  const [completedCombat, setCompletedCombat] = useState(null)

  const { combat, fireSpaceCannon, rollDice, assignHits, declareRetreat } =
    useCombat(gameId, activeCombat?.id)

  // Hold complete combat state for result screen until player dismisses
  useEffect(() => {
    if (combat?.status === 'complete') setCompletedCombat(combat)
    else if (combat?.status === 'active') setCompletedCombat(null)
  }, [combat])

  const isActivePlayer = game?.active_player_id === currentPlayer?.id
  const tacticUsed = activations.filter(a => a.player_id === currentPlayer?.id).length
  const tacticTotal = currentPlayer?.command_tokens?.tactic_total ?? 0
  const hasAvailableTacticTokens = tacticTotal > tacticUsed

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

  const combatActive = combat && combat.status === 'active'
  const showSpaceCannon = combatActive && combat.phase === 'space_cannon'
  const showCombat = (combatActive && combat.phase !== 'space_cannon') || completedCombat != null
  const displayCombat = completedCombat ?? combat

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

      {showCombat && (
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
    </div>
  )
}