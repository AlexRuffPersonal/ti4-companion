import { useState } from 'react'

const PHASE_LABELS = { strategy: 'Action', action: 'Status', status: 'Strategy' }

export default function HostControlsSection({
  isHost, game, players, objectives,
  onScoreObjective, onRevealObjective, onShuffleDeck, onAdvancePhase,
}) {
  const [scoringObj, setScoringObj] = useState(null)
  const [scoringPlayer, setScoringPlayer] = useState('')
  const [revealStage, setRevealStage] = useState(1)

  if (!isHost) return null

  const revealedObjs = objectives.filter(o => o.state === 'revealed')
  const nextPhaseLabel = PHASE_LABELS[game?.phase] ?? '?'

  return (
    <div className="panel flex flex-col gap-4">
      <p className="label">HOST CONTROLS</p>

      {/* Score Objective */}
      <div className="flex flex-col gap-2">
        <p className="text-dim text-xs">SCORE OBJECTIVE</p>
        <div className="flex gap-2 flex-wrap">
          <select
            className="input text-xs flex-1"
            value={scoringObj ?? ''}
            onChange={e => setScoringObj(e.target.value || null)}
          >
            <option value="">Select objective…</option>
            {revealedObjs.map(o => (
              <option key={o.id} value={o.id}>{o.public_objectives?.name}</option>
            ))}
          </select>
          <select
            className="input text-xs flex-1"
            value={scoringPlayer}
            onChange={e => setScoringPlayer(e.target.value)}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <button
            className="btn-ghost text-xs"
            disabled={!scoringObj || !scoringPlayer}
            onClick={() => {
              onScoreObjective(scoringObj, scoringPlayer)
              setScoringObj(null)
              setScoringPlayer('')
            }}
          >
            SCORE
          </button>
        </div>
      </div>

      {/* Reveal & Shuffle */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          className="input text-xs"
          value={revealStage}
          onChange={e => setRevealStage(Number(e.target.value))}
          aria-label="objective stage"
        >
          <option value={1}>Stage 1</option>
          <option value={2}>Stage 2</option>
        </select>
        <button className="btn-ghost text-xs" onClick={() => onRevealObjective(revealStage)}>
          REVEAL OBJECTIVE
        </button>
        <button className="btn-ghost text-xs" onClick={() => onShuffleDeck(`public_objectives_${revealStage}`)}>
          SHUFFLE DECK
        </button>
      </div>

      {/* Advance Phase */}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={onAdvancePhase}>
          ADVANCE PHASE → {nextPhaseLabel.toUpperCase()}
        </button>
      </div>
    </div>
  )
}
