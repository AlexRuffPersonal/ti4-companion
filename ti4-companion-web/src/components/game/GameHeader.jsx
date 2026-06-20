import { phaseLabel } from '../../lib/gameUtils.js'
import GameIcon from '../shared/GameIcon.jsx'

export default function GameHeader({ game, speaker, activePlayer, onOpenTradeLog, onOpenRules, isHost = false, onUndo = () => {}, canUndo = false }) {
  return (
    <div className="bg-hull border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <span className="font-display text-plasma text-xs tracking-widest">
          ROUND {game?.round ?? '—'}
        </span>
        {game?.code && (
          <span className="font-mono text-muted text-xs tracking-widest border border-border rounded px-1.5 py-0.5">
            {game.code}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-bright text-xs tracking-widest">
          {phaseLabel(game?.phase)}
        </span>
        {activePlayer && (
          <span className="text-xs text-gold font-mono">{activePlayer.display_name}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-dim text-xs">
          GOAL: {game?.vp_goal ?? '?'} VP
          {speaker && <> · <GameIcon category="economy" name="speaker" size={14} alt="speaker" className="inline" /> {speaker.display_name}</>}
        </span>
        {isHost && (
          <button
            className="btn-ghost text-xs"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last action"
          >
            Undo
          </button>
        )}
        <button className="btn-ghost text-xs" onClick={onOpenTradeLog}>
          TRADE LOG
        </button>
        <button className="btn-ghost text-xs" onClick={onOpenRules}>
          RULES
        </button>
      </div>
    </div>
  )
}
