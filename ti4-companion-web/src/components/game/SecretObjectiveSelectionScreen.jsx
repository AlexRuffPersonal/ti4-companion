export default function SecretObjectiveSelectionScreen({ secrets, pendingPlayers = [], onDiscard }) {
  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center px-4 py-8 gap-6">
      <h2 className="font-display text-bright text-lg tracking-widest">SELECT YOUR SECRET OBJECTIVE</h2>
      <p className="text-dim text-sm font-body">Discard one card. The other is yours to score.</p>

      <div className="flex flex-col gap-4 w-full max-w-md">
        {secrets.map(s => {
          const ref = s.secret_objectives
          return (
            <div key={s.id} className="panel flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-bright text-sm font-body">{ref?.name}</span>
                  <span className="label text-xs text-gold">{ref?.timing?.toUpperCase()}</span>
                  <span className="text-dim text-xs font-body">{ref?.condition}</span>
                </div>
                <button
                  className="btn-ghost text-xs flex-shrink-0"
                  onClick={() => onDiscard(s.id)}
                >
                  DISCARD
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {pendingPlayers.length > 0 && (
        <div className="panel-inset w-full max-w-md">
          <p className="label text-xs text-dim mb-1">WAITING FOR OTHERS TO SELECT</p>
          <p className="text-muted text-sm font-body">
            {pendingPlayers.map(p => p.display_name).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}