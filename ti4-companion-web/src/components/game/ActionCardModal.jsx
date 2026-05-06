import { useState } from 'react'
import { deriveHandState } from '../../lib/handState.js'

const TIMING_COLOURS = {
  Action: 'text-plasma',
  Agenda: 'text-gold',
  Component: 'text-success',
}

export default function ActionCardModal({ cards, onDraw, onDiscard, onClose, triggerableByActionCardId = new Map(), onPlay, onPlayCard, isMyTurn }) {
  const [playingCard, setPlayingCard] = useState(null)
  const { mustDiscard } = deriveHandState(cards)

  return (
    <>
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="label">ACTION CARDS ({cards.length}/7)</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {mustDiscard && (
          <div className="bg-danger/20 border border-danger rounded px-3 py-2 text-danger text-xs font-body">
            Hand limit exceeded — discard down to 7 before continuing.
          </div>
        )}

        {!mustDiscard && (
          <button className="btn-primary text-xs self-start" onClick={onDraw}>
            DRAW CARD
          </button>
        )}

        {cards.length === 0 && (
          <p className="text-dim text-sm font-body">Your hand is empty.</p>
        )}

        <div className="flex flex-col gap-3">
          {cards.map(card => {
            const triggerableAbility = triggerableByActionCardId.get(card.action_card_id)
            const isPlayable = !!triggerableAbility
            return (
              <div key={card.id} className="panel-inset flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-body text-bright text-sm">{card.action_cards.name}</span>
                  <span className={`label text-xs ${TIMING_COLOURS[card.action_cards.timing] ?? 'text-muted'}`}>
                    {card.action_cards.timing}
                  </span>
                </div>
                <p className="text-dim text-xs font-body">{card.action_cards.text}</p>
                <div className="flex gap-2 self-end mt-1 flex-wrap">
                  {card.action_cards.ability !== null && card.action_cards.timing?.startsWith('Action:') && isMyTurn && (
                    <button
                      data-testid={`play-card-${card.id}`}
                      className="btn-primary text-xs"
                      onClick={() => setPlayingCard(card)}
                    >
                      Play
                    </button>
                  )}
                  {(!card.action_cards.ability || !card.action_cards.timing?.startsWith('Action:')) && (
                    <span className="text-dim text-xs">Not yet enforced</span>
                  )}
                  {isPlayable && (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => onPlay?.(card, triggerableAbility)}
                    >
                      PLAY
                    </button>
                  )}
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => onDiscard(card.id)}
                  >
                    PLAY / DISCARD
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>

    {playingCard && (
      <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-60 p-4">
        <div className="panel w-full max-w-sm flex flex-col gap-4">
          <p className="label">PLAY: {playingCard.action_cards.name}</p>
          <p className="text-dim text-xs">{playingCard.action_cards.text}</p>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost text-xs" onClick={() => setPlayingCard(null)}>CANCEL</button>
            <button
              data-testid="confirm-play"
              className="btn-primary text-xs"
              onClick={() => { onPlayCard?.(playingCard.id, {}); setPlayingCard(null) }}
            >
              CONFIRM
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
