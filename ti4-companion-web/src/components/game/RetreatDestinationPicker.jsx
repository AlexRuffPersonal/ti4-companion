function axialNeighborKeys(systemKey) {
  const [q, r] = systemKey.split(',').map(Number)
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ].map(([nq, nr]) => `${nq},${nr}`)
}

export default function RetreatDestinationPicker({
  combatSystemKey, mapTiles, systemUnits, allPlanets,
  retreatingPlayerId, onSelect, onCancel,
}) {
  const neighbors = new Set(axialNeighborKeys(combatSystemKey))

  const validDestinations = Object.keys(mapTiles).filter(sk => {
    if (!neighbors.has(sk)) return false
    const hasUnits = systemUnits.some(u => u.system_key === sk && u.player_id === retreatingPlayerId && u.on_planet == null)
    const hasPlanets = allPlanets.some(p => p.system_key === sk && p.player_id === retreatingPlayerId)
    return hasUnits || hasPlanets
  })

  return (
    <div className="panel-inset p-3 flex flex-col gap-2">
      <p className="label text-xs">SELECT RETREAT DESTINATION</p>
      {validDestinations.length === 0 ? (
        <p className="text-muted text-xs">No valid retreat destinations.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {validDestinations.map(sk => (
            <button
              key={sk}
              className="btn-ghost text-left text-xs px-2 py-1"
              onClick={() => onSelect(sk)}
            >
              {sk}
            </button>
          ))}
        </div>
      )}
      <button className="btn-ghost text-xs text-muted" onClick={onCancel}>Cancel</button>
    </div>
  )
}