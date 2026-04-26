export default function SpaceCannonModal({ combat, myPlayerId, onFire, onPass }) {
  const pending = combat?.space_cannon_pending ?? []
  const myEntry = pending.find(e => e.player_id === myPlayerId && !e.resolved)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-4">
        <p className="label text-center">SPACE CANNON</p>
        {myEntry ? (
          <>
            <div className="panel-inset p-3 text-center flex flex-col gap-1">
              <p className="text-bright font-display text-sm capitalize">{myEntry.unit_type}</p>
              <p className="text-muted text-xs">from system {myEntry.system_key}</p>
              <p className="text-dim text-xs">{myEntry.dice_count} dice</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={onFire}>Fire</button>
              <button className="btn-ghost flex-1" onClick={onPass}>Pass</button>
            </div>
          </>
        ) : (
          <div className="panel-inset p-4 text-center">
            <p className="text-muted text-sm">Waiting for other players…</p>
          </div>
        )}
      </div>
    </div>
  )
}