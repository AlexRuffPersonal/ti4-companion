import GameIcon from '../shared/GameIcon.jsx'
import { deriveActivePlayer, factionIconSlug } from '../../lib/gameUtils.js'

const COLOUR_HEX = {
  blue: '#58a6ff', red: '#f85149', green: '#3fb950', yellow: '#e3b341',
  orange: '#f0883e', pink: '#ff7bda', purple: '#bc8cff', white: '#f0f6fc',
}

export default function ScoreboardSection({ players, game, currentPlayerId, onViewTech }) {
  const activePlayer = deriveActivePlayer(players, game)
  const sorted = [...players].sort((a, b) => b.vp - a.vp)

  return (
    <div>
      <p className="label mb-2">SCOREBOARD</p>
      <div className="flex flex-col gap-2">
        {sorted.map(player => {
          const isActive = activePlayer?.id === player.id
          const isPassed = player.passed
          const isMe = player.id === currentPlayerId
          const slug = factionIconSlug(player.faction)

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 py-2 rounded border transition-opacity ${
                isActive ? 'border-plasma bg-panel' : 'border-border bg-hull'
              } ${isPassed ? 'opacity-60' : ''}`}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLOUR_HEX[player.colour] ?? '#6e7681' }}
              />
              <span className={`flex-1 font-body text-sm ${isMe ? 'text-bright' : 'text-text'}`}>
                <span className={player.eliminated ? 'text-muted line-through' : ''}>
                  {player.display_name}
                </span>
                {player.faction && (
                  <span className="flex items-center gap-1 text-dim text-xs ml-2">
                    {slug && <GameIcon category="factions" name={slug} size={14} alt={slug} />}
                    ({player.faction})
                  </span>
                )}
              </span>
              {player.strategy_card != null && (
                <span className="label text-xs bg-hull px-1 rounded border border-border">
                  {player.strategy_card}
                </span>
              )}
              {game?.phase === 'action' && isActive && (
                <span className="label text-plasma text-xs">ACTIVE</span>
              )}
              {game?.phase === 'action' && isPassed && !isActive && (
                <span className="label text-success text-xs">PASSED</span>
              )}
              <span
                className="label text-xs text-muted"
                aria-label={`${player.display_name} action cards: ${player.action_card_count ?? 0}`}
              >
                ✦ {player.action_card_count ?? 0}
              </span>
              <span
                className="label text-xs text-muted"
                aria-label={`${player.display_name} secret objectives: ${player.secret_objective_count ?? 0}`}
              >
                ★ {player.secret_objective_count ?? 0}
              </span>
              <button
                className="label text-xs text-dim hover:text-text px-1"
                onClick={(e) => { e.stopPropagation(); onViewTech(player.id) }}
                title="View tech tree"
              >
                TECH
              </button>
              <span className="font-display text-gold text-sm font-bold">{player.vp} VP</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
