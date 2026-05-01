export default function SystemActionModal({
  systemKey, tileInfo, activations, planetOwnership, players,
  currentPlayer, isActivePlayer, hasAvailableTacticTokens,
  myActivations, onActivate, onLandTroops, onClose, custodiansClaimed,
  myPlanets, systemUnits, unitDefs, onOpenProduction,
}) {
  const systemActivatedByMe = myActivations.has(systemKey)
  const planets = tileInfo?.planets ?? []

  // Derive: does this system have a caller-owned space dock?
  const systemPlanets = planets.map(p => p.name)
  const myPlanetsInSystem = (myPlanets ?? []).filter(p =>
    systemPlanets.some(sp => sp === p.planet_name)
  )
  const hasSpaceDock = myPlanetsInSystem.some(p => p.space_dock_unit_id != null)

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div className="panel max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <p className="label mb-4">SYSTEM {systemKey}</p>

        {isActivePlayer && hasAvailableTacticTokens && !systemActivatedByMe && (
          <button className="btn-primary w-full mb-4" onClick={() => onActivate(systemKey)}>
            ACTIVATE SYSTEM
          </button>
        )}

        {systemActivatedByMe && planets.map(planet => (
          <button
            key={planet.name}
            className="btn-ghost w-full mb-2"
            onClick={() => onLandTroops(systemKey, planet.name, 1)}
          >
            LAND ON {planet.name.toUpperCase()}
          </button>
        ))}

        {systemActivatedByMe && hasSpaceDock && isActivePlayer && (
          <button className="btn-ghost w-full mb-2" onClick={() => onOpenProduction(systemKey)}>
            PRODUCE UNITS
          </button>
        )}

        {custodiansClaimed && (
          <div className="panel-inset mb-4">
            <p className="text-gold font-body text-sm">You claimed the Custodians! +1 VP</p>
          </div>
        )}

        <div className="flex flex-col gap-1 mt-2">
          {planets.map(planet => {
            const ownership = planetOwnership.get(planet.name)
            const owner = ownership ? players.find(p => p.id === ownership.player_id) : null
            return (
              <div key={planet.name} className="flex justify-between text-xs font-body">
                <span className="text-muted">{planet.name}</span>
                <span className="text-dim">{owner ? owner.display_name : 'Unclaimed'}</span>
              </div>
            )
          })}
        </div>

        <button className="btn-ghost text-xs mt-4 w-full" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  )
}