export default function SecretObjectivesModal({ secrets, game, onScore, onClose }) {
  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">MY SECRET OBJECTIVES</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {secrets.length === 0 ? (
          <p className="text-dim text-sm font-body">No secret objectives held.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {secrets.map(s => {
              const ref = s.secret_objectives
              const canScore = game?.phase === 'status' && ref?.timing === game?.phase
              return (
                <div key={s.id} className="panel-inset flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-bright text-sm font-body">{ref?.name}</span>
                    <span className="label text-xs text-gold">{ref?.timing?.toUpperCase()}</span>
                    <span className="text-dim text-xs font-body">{ref?.condition}</span>
                  </div>
                  <button
                    className={canScore ? 'btn-primary text-xs flex-shrink-0' : 'btn-ghost text-xs flex-shrink-0 opacity-40'}
                    disabled={!canScore}
                    onClick={() => canScore && onScore(s.id)}
                  >
                    SCORE
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}