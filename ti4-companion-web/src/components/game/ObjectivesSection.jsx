import { evaluateCondition } from '../../lib/objectiveEvaluator.js'

export default function ObjectivesSection({ objectives, players, game, currentPlayerId, onScore, evaluationCtxByPlayer }) {
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
            const conditionCheck = ref?.condition_check ?? null
            const alreadyScored = (obj.scored_by ?? []).includes(currentPlayerId)
            const showScore = isStatusPhase && !alreadyScored && onScore

            const playerEligibility = players.reduce((acc, p) => {
              const ctx = evaluationCtxByPlayer?.[p.id]
              acc[p.id] = ctx && conditionCheck
                ? evaluateCondition(conditionCheck, ctx)
                : { eligible: true, reason: '' }
              return acc
            }, {})
            const myEligibility = playerEligibility[currentPlayerId] ?? { eligible: true, reason: '' }

            return (
              <div key={obj.id} className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-text text-sm">{ref?.name}</span>
                  <span className="text-dim text-xs ml-2">
                    Stage {ref?.stage} · {ref?.points ?? 1} VP
                  </span>
                  {ref?.condition && (
                    <p data-testid="objective-condition" className="text-dim text-xs mt-0.5">
                      {ref.condition}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-0.5 text-xs">
                    {players.map(p => {
                      const scored = (obj.scored_by ?? []).includes(p.id)
                      const eligibility = playerEligibility[p.id] ?? { eligible: true, reason: '' }
                      if (scored) {
                        return (
                          <span key={p.id} className="text-success" title={p.display_name}>•</span>
                        )
                      } else if (eligibility.eligible) {
                        return (
                          <span key={p.id} className="text-gold" title={p.display_name}>•</span>
                        )
                      } else {
                        return (
                          <span key={p.id} className="text-dim" title={eligibility.reason}>•</span>
                        )
                      }
                    })}
                  </div>
                  {showScore && (
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => onScore(obj.id)}
                      disabled={!myEligibility.eligible}
                      title={!myEligibility.eligible ? myEligibility.reason : undefined}
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
