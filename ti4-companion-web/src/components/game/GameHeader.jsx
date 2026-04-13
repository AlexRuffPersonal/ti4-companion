import { phaseLabel } from '../../lib/gameUtils.js'

export default function GameHeader({ game, speaker }) {
  return (
    <div className="bg-hull border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <span className="font-display text-plasma text-xs tracking-widest">
        ROUND {game?.round ?? '—'}
      </span>
      <span className="font-display text-bright text-xs tracking-widest">
        {phaseLabel(game?.phase)}
      </span>
      <span className="text-dim text-xs">
        GOAL: {game?.vp_goal ?? '?'} VP
        {speaker && <> · 🎙 {speaker.display_name}</>}
      </span>
    </div>
  )
}
