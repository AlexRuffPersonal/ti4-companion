import React from 'react'

const WINDOW_LABELS = {
  when_agenda_revealed:        'An agenda has been revealed',
  after_speaker_votes:         'The speaker has voted',
  when_voting_begins:          'Voting is about to begin',
  after_technology_researched: 'A player researched a technology',
}

const TIMING_MAP = {
  when_agenda_revealed:        'When an agenda is revealed:',
  after_speaker_votes:         'After the speaker votes on an agenda:',
  when_voting_begins:          'When voting is about to begin:',
  after_technology_researched: 'After a player researches a technology:',
}

export default function ActionWindowBanner({ window, currentPlayerId, myCards = [], onPlayCard, onPass, loading }) {
  if (!window) return null

  const eligibleIds = window.eligible_player_ids ?? []
  const passedIds = window.passed_player_ids ?? []

  const isEligible = eligibleIds.includes(currentPlayerId)
  const hasPassed = passedIds.includes(currentPlayerId)

  if (!isEligible || hasPassed) return null

  const matchingCards = myCards.filter(c => c.timing === TIMING_MAP[window.type] && c.ability != null)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-40 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-4">
        <p className="label">{WINDOW_LABELS[window.type] ?? 'Action window'}</p>
        <p className="text-muted text-xs">Play a card or pass</p>
        {matchingCards.map(card => (
          <button
            key={card.id}
            data-testid={`window-play-${card.id}`}
            className="btn-ghost text-sm w-full text-left"
            onClick={() => onPlayCard(card.id, {})}
          >
            {card.name}
          </button>
        ))}
        <button
          data-testid="window-pass"
          className="btn-ghost text-sm"
          onClick={onPass}
          disabled={loading}
        >
          Pass
        </button>
      </div>
    </div>
  )
}
