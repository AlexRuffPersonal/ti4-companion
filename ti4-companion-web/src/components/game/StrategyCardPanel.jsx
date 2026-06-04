import { getCard } from '../../lib/strategyCardConstants.js'
import GameIcon from '../shared/GameIcon.jsx'

export default function StrategyCardPanel({
  player,
  game,
  allPlayers,
  activePay,
  isActive,
  onPickStrategyCard,
  onPlayPrimary,
}) {
  if (!player) return null

  // During strategy phase: show card picker or selected card label
  if (game.phase === 'strategy') {
    if (player.strategy_card === null) {
      // Show available cards (1-8 minus cards held by other players)
      const heldCards = new Set(
        allPlayers
          .filter(p => p.id !== player.id && p.strategy_card !== null)
          .map(p => p.strategy_card)
      )

      return (
        <div className="panel space-y-2">
          <div className="label text-text">Select Strategy Card</div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map(cardNum => {
              if (heldCards.has(cardNum)) return null
              const card = getCard(cardNum)
              return (
                <button
                  key={cardNum}
                  onClick={() => onPickStrategyCard(cardNum)}
                  className="btn-primary text-xs py-2 flex flex-col items-center gap-1"
                >
                  <GameIcon category="strategy" name={card?.name?.toLowerCase() ?? String(cardNum)} size={20} alt={card?.name?.toLowerCase() ?? String(cardNum)} />
                  <div className="font-display">{cardNum}</div>
                  <div className="text-xs text-muted">{card?.name}</div>
                </button>
              )
            })}
          </div>
        </div>
      )
    } else {
      // Card selected - show read-only label with initiative + name
      const card = getCard(player.strategy_card)
      return (
        <div className="panel">
          <p className="label text-dim">
            {card?.initiative ?? player.strategy_card}. {card?.name ?? player.strategy_card} selected
          </p>
        </div>
      )
    }
  }

  // During action phase: show play button or active card status
  if (game.phase === 'action') {
    if (player.strategy_card === null) {
      // No card selected, render nothing
      return null
    }

    if (activePay) {
      // Card is currently active — show card name
      const activeCard = getCard(activePay.card_number)
      return (
        <div className="panel">
          <p className="label text-dim">
            {activeCard?.name ?? activePay.card_number} is active
          </p>
        </div>
      )
    }

    if (isActive) {
      // Player's turn and can play their strategy card — show card name on button
      const card = getCard(player.strategy_card)
      return (
        <div className="panel">
          <button onClick={onPlayPrimary} className="btn-primary w-full">
            PLAY {card?.name?.toUpperCase() ?? 'STRATEGY CARD'}
          </button>
        </div>
      )
    }

    // Player has card but it's not their turn — show initiative + name
    const card = getCard(player.strategy_card)
    return (
      <div className="panel">
        <p className="label text-dim">
          {card?.initiative ?? player.strategy_card}. {card?.name ?? player.strategy_card}
        </p>
      </div>
    )
  }

  // Other phases: render nothing
  return null
}
