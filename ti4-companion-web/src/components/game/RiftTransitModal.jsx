// Props:
// { transit, myPlayerId, players, tileMap, onRollAll, onRollOne, onClose, loading, error }
// tileMap = map_tiles from game merged with tile reference data
// transit shape: { player_id, system_key, ships: [{ unit_id, unit_type, cargo, roll, destroyed }] }

export default function RiftTransitModal({ transit, myPlayerId, players, tileMap, onRollAll, onRollOne, onClose, loading, error }) {
  if (!transit) return null

  const isActivePlayer = transit.player_id === myPlayerId
  const activePlayerName = players.find(p => p.id === transit.player_id)?.faction_name ?? 'Opponent'
  const systemName = tileMap?.[transit.system_key]?.name ?? transit.system_key
  const allRolled = transit.ships.every(s => s.roll !== null)
  const firstUnrolledId = transit.ships.find(s => s.roll === null)?.unit_id

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50">
      <div className="panel w-full max-w-md">
        <p className="label mb-4">GRAVITY RIFT — {systemName}</p>

        {!isActivePlayer && (
          <p className="text-dim text-sm mb-4">Waiting for {activePlayerName} to resolve gravity rift…</p>
        )}

        <div className="space-y-2 mb-4">
          {transit.ships.map(ship => {
            const cargoSummary = ship.cargo?.length > 0
              ? ` (${ship.cargo.map(c => `${c.count} ${c.unit_type}`).join(', ')})`
              : ''
            return (
              <div key={ship.unit_id} className="flex items-center justify-between text-sm">
                <span>{ship.unit_type}{cargoSummary}</span>
                <span>{ship.roll ?? '—'}</span>
                {ship.roll !== null && (
                  <span className={ship.destroyed ? 'text-danger font-bold' : 'text-success font-bold'}>
                    {ship.destroyed ? 'DESTROYED' : 'SAFE'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-danger text-sm mb-3">{error}</p>}

        {isActivePlayer && !allRolled && (
          <div className="flex gap-3 mb-3">
            <button className="btn-primary" disabled={loading} onClick={onRollAll}>Roll All</button>
            <button className="btn-ghost" disabled={loading || !firstUnrolledId} onClick={() => onRollOne(firstUnrolledId)}>Roll One</button>
          </div>
        )}

        {allRolled && (
          <div>
            <p className="text-dim text-xs mb-3">
              Rift resolved: {transit.ships.filter(s => s.destroyed).length} destroyed, {transit.ships.filter(s => !s.destroyed).length} survived
            </p>
            {isActivePlayer && (
              <button className="btn-primary" onClick={onClose}>Done</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
