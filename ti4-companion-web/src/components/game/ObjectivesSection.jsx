export default function ObjectivesSection({ objectives, players, game, currentPlayerId, onScore }) {
  const revealed = objectives.filter(o => o.state === 'revealed')
  const isStatusPhase = game?.phase === 'status'

  return (
    <div>
      <p className="label mb-2">PUBLIC OBJECTIVES</p>
      {revealed.length === 0 ? (
        <p className="text-dim text-sm">No objectives revealed yet.</p>
      ) : (
        <div className="panel-inset flex flex-col gap-3">
          {revealed.map(obj => {
            const ref = obj.public_objectives
            const scorers = (obj.scored_by ?? [])
              .map(pid => players.find(p => p.id === pid)?.display_name)
              .filter(Boolean)
            const alreadyScored = (obj.scored_by ?? []).includes(currentPlayerId)
            const showScore = isStatusPhase && !alreadyScored && onScore

            return (
              <div key={obj.id} className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-text text-sm">{ref?.name}</span>
                  <span className="text-dim text-xs ml-2">
                    Stage {ref?.stage} · {ref?.points ?? 1} VP
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-xs text-success">
                    {scorers.length > 0 ? scorers.join(', ') : <span className="text-dim">—</span>}
                  </div>
                  {showScore && (
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => onScore(obj.id)}
                    >
                      SCORE
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}