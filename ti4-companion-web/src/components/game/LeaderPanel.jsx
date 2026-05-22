import { useState } from 'react'
import LeaderCard from './LeaderCard';
import PlanetSelectionModal from './PlanetSelectionModal.jsx'

export default function LeaderPanel({ agent, commander, hero, factionMech, leaderStatus, onUseAbility, onUnlock,
  planets = [], currentPlayerId, onDeployMech, onUseMechAbility,
  leaderModalOpen, activeLeader, onConfirm, onClose, gamePlayers }) {
  const [showDeployModal, setShowDeployModal] = useState(false)

  function handleDeployConfirm(selected) {
    const planet = selected[0]
    const replacingInfantry = (factionMech?.deploy_trigger === 'ground_combat_start')
    onDeployMech?.(factionMech.id, planet.system_key, planet.planet_name, replacingInfantry)
    setShowDeployModal(false)
  }

  return (
    <div className="panel w-full max-w-lg flex flex-col gap-4">
      <p className="label">LEADERS</p>
      <div className="grid grid-cols-2 gap-3">
        <LeaderCard
          leader={agent}
          status={leaderStatus?.agent}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={commander}
          status={leaderStatus?.commander}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={hero}
          status={leaderStatus?.hero}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={factionMech}
          status="unlocked"
          isMech={true}
          onDeploy={() => setShowDeployModal(true)}
          onUseMechAbility={() => onUseMechAbility?.(factionMech)}
        />
      </div>

      {showDeployModal && (
        <PlanetSelectionModal
          planets={planets}
          currentPlayerId={currentPlayerId}
          scope="own"
          onConfirm={handleDeployConfirm}
          onClose={() => setShowDeployModal(false)}
        />
      )}
    </div>
  );
}
