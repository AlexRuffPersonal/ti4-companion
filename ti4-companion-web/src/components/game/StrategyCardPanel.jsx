const STRATEGY_CARD_NAMES = {
  1: 'Leadership',
  2: 'Diplomacy',
  3: 'Politics',
  4: 'Construction',
  5: 'Trade',
  6: 'Warfare',
  7: 'Technology',
  8: 'Imperial',
}

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
              return (
                <button
                  key={cardNum}
                  onClick={() => onPickStrategyCard(cardNum)}
                  className="btn-primary text-xs py-2"
                >
                  <div className="font-display">{cardNum}</div>
                  <div className="text-xs text-muted">{STRATEGY_CARD_NAMES[cardNum]}</div>
                </button>
              )
            })}
          </div>
        </div>
      )
    } else {
      // Card selected - show read-only label
      return (
        <div className="panel">
          <div className="label text-dim">
            Card {player.strategy_card} selected: {STRATEGY_CARD_NAMES[player.strategy_card]}
          </div>
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
      // Card is currently active
      return (
        <div className="panel">
          <div className="label text-dim">
            Card {activePay.card_number} is active
          </div>
        </div>
      )
    }

    if (isActive) {
      // Player's turn and can play their strategy card
      return (
        <div className="panel">
          <button onClick={onPlayPrimary} className="btn-primary w-full">
            PLAY STRATEGY CARD
          </button>
        </div>
      )
    }

    // Player has card but it's not their turn
    return (
      <div className="panel">
        <div className="label text-dim">
          Card {player.strategy_card}: {STRATEGY_CARD_NAMES[player.strategy_card]}
        </div>
      </div>
    )
  }

  // Other phases: render nothing
  return null
}
