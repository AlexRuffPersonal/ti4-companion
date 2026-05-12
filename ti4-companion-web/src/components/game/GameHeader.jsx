import { phaseLabel } from '../../lib/gameUtils.js'

export default function GameHeader({ game, speaker, onOpenTradeLog, onOpenRules, isHost = false, onUndo = () => {}, canUndo = false }) {
  return (
    <div className="bg-hull border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <span className="font-display text-plasma text-xs tracking-widest">
        ROUND {game?.round ?? '—'}
      </span>
      <span className="font-display text-bright text-xs tracking-widest">
        {phaseLabel(game?.phase)}
      </span>
      <div className="flex items-center gap-4">
        <span className="text-dim text-xs">
          GOAL: {game?.vp_goal ?? '?'} VP
          {speaker && <> · 🎙 {speaker.display_name}</>}
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
