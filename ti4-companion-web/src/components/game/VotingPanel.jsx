import { useState } from 'react'
import PlanetSelectionModal from './PlanetSelectionModal.jsx'

export default function VotingPanel({
  agenda,
  votes = [],
  players = [],
  currentPlayer,
  currentVoterId,
  planets = [],
  onCastVote,
}) {
  const [showPlanetPicker, setShowPlanetPicker] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState(null)

  const isMyTurn = currentPlayer?.id === currentVoterId
  const myVote = votes.find(v => v.game_player_id === currentPlayer?.id)

  // Tally votes per choice
  const tally = votes.reduce((acc, v) => {
    if (!v.abstained && v.choice) {
      acc[v.choice] = (acc[v.choice] ?? 0) + v.vote_count
    }
    return acc
  }, {})

  const options = agenda?.outcome === 'For/Against' ? ['For', 'Against'] : []

  function handleVote(selectedPlanetIds) {
    const myPlanets = planets.filter(p => selectedPlanetIds.includes(p.id))
    const voteCount = myPlanets.reduce((sum, p) => sum + (p.influence ?? 0), 0)
    onCastVote({ choice: selectedChoice, vote_count: voteCount, abstain: false })
    setShowPlanetPicker(false)
  }

  function handleVoteClick(choice) {
    setSelectedChoice(choice)
    setShowPlanetPicker(true)
  }

  return (
    <div className="panel-inset flex flex-col gap-3">
      <p className="label text-xs">AGENDA VOTE</p>
      <p className="text-text font-display text-sm">{agenda?.name}</p>
      {agenda?.note && (
        <p data-testid="agenda-note" className="text-dim text-xs leading-snug">
          {agenda.note}
        </p>
      )}

      {/* Live vote totals */}
      <div className="flex gap-4">
        {options.map(opt => (
          <div key={opt} className="flex flex-col items-center">
            <span className="text-dim text-xs uppercase">{opt}</span>
            <span className="text-text font-display">{tally[opt] ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Per-player status */}
      <div className="flex flex-col gap-1">
        {players.map(p => {
          const voted = votes.find(v => v.game_player_id === p.id)
          const isCurrentVoter = p.id === currentVoterId
          return (
            <div key={p.id} className={`flex items-center justify-between text-xs ${isCurrentVoter ? 'text-gold' : 'text-dim'}`}>
              <span>{p.display_name}{isCurrentVoter ? ' ◀' : ''}</span>
              <span>{voted ? (voted.abstained ? 'Abstained' : `${voted.vote_count} — ${voted.choice}`) : '...'}</span>
            </div>
          )
        })}
      </div>

      {/* Active voter controls */}
      {isMyTurn && !myVote && (
        <div className="flex gap-2 flex-wrap">
          {options.map(opt => (
            <button
              key={opt}
              className="btn-ghost text-xs"
              onClick={() => handleVoteClick(opt)}
            >
              VOTE {opt.toUpperCase()}
            </button>
          ))}
          <button className="btn-ghost text-xs" onClick={() => onCastVote({ abstain: true })}>
            ABSTAIN
          </button>
        </div>
      )}

      {showPlanetPicker && (
        <PlanetSelectionModal
          planets={planets}
          currentPlayerId={currentPlayer?.id}
          scope="own"
          filter="non-exhausted"
          selectionMode="multi"
          valueMode="influence"
          label="Select planets to exhaust for votes"
          onConfirm={handleVote}
          onClose={() => setShowPlanetPicker(false)}
        />
      )}
    </div>
  )
}
