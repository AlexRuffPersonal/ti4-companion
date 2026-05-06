import { useState, useMemo } from 'react'
import PlanetSelectionModal from './PlanetSelectionModal.jsx'

function tallyVotes(votes) {
  return votes.reduce((acc, v) => {
    if (!v.abstained && v.choice) {
      acc[v.choice] = (acc[v.choice] ?? 0) + v.vote_count
    }
    return acc
  }, {})
}

function winnerForAgainst(tally) {
  const forVotes = tally['For'] ?? 0
  const againstVotes = tally['Against'] ?? 0
  return forVotes > againstVotes ? 'For' : 'Against'
}

export default function AgendaResolutionModal({
  agenda,
  votes = [],
  players = [],
  planets = [],
  currentPlayerId,
  onConfirm,
  onClose,
}) {
  const tally = useMemo(() => tallyVotes(votes), [votes])
  const [electedPlayer, setElectedPlayer] = useState('')
  const [electedText, setElectedText] = useState('')
  const [showPlanetPicker, setShowPlanetPicker] = useState(false)
  const [electedPlanet, setElectedPlanet] = useState(null)

  const isForAgainst = agenda?.outcome === 'For/Against' || !agenda?.elect_type
  const electType = agenda?.elect_type
  const isNonTractable = agenda?.type === 'law' && !agenda?.tractable

  function handleConfirm() {
    if (isForAgainst) {
      onConfirm(winnerForAgainst(tally))
    } else if (electType === 'player') {
      onConfirm(electedPlayer)
    } else if (electType === 'planet') {
      onConfirm(electedPlanet)
    } else {
      onConfirm(electedText || null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-full max-w-sm mx-4 flex flex-col gap-4">
        <p className="label">RESOLVE: {agenda?.name}</p>

        <div className="panel-inset">
          <p className="text-dim text-xs mb-1">VOTE TOTALS</p>
          {Object.entries(tally).map(([choice, count]) => (
            <p key={choice} className="text-xs text-text">{choice}: {count}</p>
          ))}
          {Object.keys(tally).length === 0 && (
            <p className="text-xs text-dim">No votes cast</p>
          )}
        </div>

        {agenda?.note && (
          <div className="panel-inset">
            <p data-testid="agenda-note" className="text-xs text-muted">{agenda.note}</p>
          </div>
        )}

        {isNonTractable && (
          <div className="panel-inset">
            <p className="label text-xs text-warning">HOST APPLIES MANUALLY</p>
            <p className="text-xs text-muted mt-1">Apply this law's effect manually before confirming.</p>
          </div>
        )}

        {isForAgainst && (
          <p className="text-xs text-text">
            Winner: <span className="text-gold font-display">{winnerForAgainst(tally)}</span>
          </p>
        )}

        {electType === 'player' && (
          <select
            className="input text-xs"
            value={electedPlayer}
            onChange={e => setElectedPlayer(e.target.value)}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        )}

        {electType === 'planet' && (
          <div>
            <p className="text-xs text-dim mb-1">{electedPlanet ?? 'No planet selected'}</p>
            <button className="btn-ghost text-xs" onClick={() => setShowPlanetPicker(true)}>
              SELECT PLANET
            </button>
          </div>
        )}

        {electType && !['player', 'planet'].includes(electType) && (
          <input
            className="input text-xs"
            placeholder="Enter elected target…"
            value={electedText}
            onChange={e => setElectedText(e.target.value)}
          />
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
          <button className="btn-primary text-xs" onClick={handleConfirm}>CONFIRM</button>
        </div>
      </div>

      {showPlanetPicker && (
        <PlanetSelectionModal
          planets={planets}
          currentPlayerId={currentPlayerId}
          scope="any-player"
          filter="all"
          selectionMode="single"
          valueMode="none"
          label="Elect a planet"
          onConfirm={(ids) => {
            const p = planets.find(pl => pl.id === ids[0])
            setElectedPlanet(p?.planet_name ?? null)
            setShowPlanetPicker(false)
          }}
          onClose={() => setShowPlanetPicker(false)}
        />
      )}
    </div>
  )
}
