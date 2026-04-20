import { useState } from 'react'
import VotingPanel from './VotingPanel.jsx'
import AgendaResolutionModal from './AgendaResolutionModal.jsx'

export default function AgendaSection({
  game,
  agenda,
  votes = [],
  players = [],
  currentPlayer,
  isSpeaker,
  planets = [],
  onDrawAgenda,
  onCastVote,
  onResolve,
}) {
  const [resolvingOpen, setResolvingOpen] = useState(false)

  const step = game?.agenda_phase_step
  if (!step || step === 'inactive') return null

  const cardInPlay = !!game.agenda_current_card_id
  const allVoted = cardInPlay && !game.agenda_vote_current_player_id

  return (
    <div className="panel flex flex-col gap-4">
      <p className="label">AGENDA PHASE</p>

      {isSpeaker && !cardInPlay && (
        <button className="btn-primary" onClick={onDrawAgenda}>
          DRAW AGENDA
        </button>
      )}

      {!cardInPlay && !isSpeaker && (
        <p className="text-dim text-xs">Waiting for speaker to draw the next agenda…</p>
      )}

      {cardInPlay && agenda && (
        <VotingPanel
          agenda={agenda}
          votes={votes}
          players={players}
          currentPlayer={currentPlayer}
          currentVoterId={game.agenda_vote_current_player_id}
          planets={planets}
          onCastVote={onCastVote}
        />
      )}

      {isSpeaker && allVoted && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setResolvingOpen(true)}>
            RESOLVE
          </button>
        </div>
      )}

      {resolvingOpen && agenda && (
        <AgendaResolutionModal
          agenda={agenda}
          votes={votes}
          players={players}
          planets={planets}
          currentPlayerId={currentPlayer?.id}
          onConfirm={(electedTarget) => {
            onResolve(game.agenda_current_card_id, electedTarget)
            setResolvingOpen(false)
          }}
          onClose={() => setResolvingOpen(false)}
        />
      )}
    </div>
  )
}
